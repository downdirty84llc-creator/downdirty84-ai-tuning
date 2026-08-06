import { REQUIRED_CHANNELS, OPTIONAL_CHANNELS, type Channel } from "./log/channels.js";
import type { ParsedLog } from "./log/parser.js";
import { has } from "./log/series.js";

export type ValidationStatus = "PASS" | "FAIL";
export type WbStatus = "OK" | "MISSING" | "IMPLAUSIBLE";

export type NextLogPlan = {
  planId: string;
  title: string;
  bullets: Array<{ kind: "info" | "warn"; text: string }>;
  routine: string[];
  safetyNotes: string[];
  recommendedLogPreset: string;
};

export type Validation = {
  status: ValidationStatus;
  wbStatus: WbStatus;
  missingChannels: string[];
  unmappedColumns: string[];
  vehicleProfileDetected: {
    platform: string | null;
    family: string | null;
    engine: string | null;
    toolchain: string;
  };
  recommendedLogPreset: string;
  durationSec: number;
  sampleRateHz: number | null;
  notes: string[];
  nextLogPlan: NextLogPlan | null;
};

/** Minimum usable log length. Shorter than this and no rule can see a trend. */
const MIN_DURATION_SEC = 30;

/**
 * Wideband is not required to parse a log, but nothing fuel-related can be
 * concluded without it — and a MAF correction derived from trims alone would be
 * a guess dressed up as a measurement.
 */
function assessWideband(log: ParsedLog): WbStatus {
  if (!has(log, "afr_wb")) return "MISSING";
  const vals = (log.series.afr_wb ?? []).filter(Number.isFinite);
  if (vals.length === 0) return "MISSING";

  // A wideband pegged at one value for the whole log is disconnected or
  // simulated, not measuring. Reported as implausible rather than trusted.
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  if (max - min < 0.1) return "IMPLAUSIBLE";
  return "OK";
}

function buildNextLogPlan(
  missing: string[],
  wbStatus: WbStatus,
  durationSec: number
): NextLogPlan {
  const bullets: NextLogPlan["bullets"] = [];

  if (missing.length > 0) {
    bullets.push({
      kind: "warn",
      text: `Add these channels to your scanner config: ${missing.join(", ")}.`
    });
  }
  if (wbStatus === "MISSING") {
    bullets.push({
      kind: "warn",
      text: "No wideband channel was found. Fuel analysis and MAF suggestions need one."
    });
  }
  if (wbStatus === "IMPLAUSIBLE") {
    bullets.push({
      kind: "warn",
      text: "The wideband channel never changed value. Check that the sensor is connected and scaled correctly."
    });
  }
  if (durationSec > 0 && durationSec < MIN_DURATION_SEC) {
    bullets.push({
      kind: "warn",
      text: `Log is only ${Math.round(durationSec)}s. Aim for several minutes so trends are visible.`
    });
  }
  if (bullets.length === 0) {
    bullets.push({
      kind: "info",
      text: "Collect steady cruise segments at multiple speeds and gears for consistent airflow modeling."
    });
  }

  return {
    planId: "GM_LS_COVERAGE_STEADY_STATE",
    title: "Next log — build steady-state coverage",
    bullets,
    routine: [
      "Warm up fully (ECT stable).",
      "Cruise 10–12 minutes steady at several different speeds/gears (hold each for 10–20 seconds).",
      "4–6 smooth roll-ins 10%→35% throttle.",
      "Upload the log."
    ],
    safetyNotes: ["Avoid WOT unless explicitly instructed."],
    recommendedLogPreset: "GM_LS_BASE"
  };
}

/**
 * Decide whether a parsed log can be analysed, and if not, say exactly what to
 * change on the next one.
 *
 * A FAIL here is not an error — it is the product working. Telling a customer
 * precisely which channel to add beats producing a confident finding from data
 * that could not support it.
 */
export function validateLog(log: ParsedLog): Validation {
  const missingRequired = REQUIRED_CHANNELS.filter((c) => !has(log, c));
  const missingOptional = OPTIONAL_CHANNELS.filter((c) => !has(log, c));
  const wbStatus = assessWideband(log);

  const failures: string[] = [];
  if (missingRequired.length > 0) {
    failures.push(`missing required channels: ${missingRequired.join(", ")}`);
  }
  if (log.sampleRateHz === null) {
    failures.push("no usable time base");
  }
  if (log.durationSec < MIN_DURATION_SEC) {
    failures.push(`log too short (${Math.round(log.durationSec)}s, need ${MIN_DURATION_SEC}s)`);
  }

  const status: ValidationStatus = failures.length === 0 ? "PASS" : "FAIL";

  const notes = [...log.notes];
  if (failures.length > 0) notes.push(`Validation failed: ${failures.join("; ")}.`);
  if (log.unmappedColumns.length > 0) {
    notes.push(
      `${log.unmappedColumns.length} column(s) were not recognised and were ignored. ` +
        `If one of these is a channel you need, its name has to be added to the channel registry.`
    );
  }

  return {
    status,
    wbStatus,
    missingChannels: [...missingRequired, ...missingOptional] as string[],
    unmappedColumns: log.unmappedColumns,
    vehicleProfileDetected: {
      // Platform detection needs identifiers this parser does not yet read.
      // Reported as null rather than assumed — see docs/ANALYSIS-ENGINE.md.
      platform: null,
      family: null,
      engine: null,
      toolchain: log.toolchain
    },
    recommendedLogPreset: "GM_LS_BASE",
    durationSec: Math.round(log.durationSec * 10) / 10,
    sampleRateHz: log.sampleRateHz === null ? null : Math.round(log.sampleRateHz * 10) / 10,
    notes,
    nextLogPlan:
      status === "FAIL" || missingOptional.length > 0 || wbStatus !== "OK"
        ? buildNextLogPlan([...missingRequired, ...missingOptional] as string[], wbStatus, log.durationSec)
        : null
  };
}

export function channelLabel(c: Channel): string {
  return c;
}
