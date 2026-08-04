import type { DiffgenThresholds } from "../../../config/thresholds.js";
import { allSet, missingKeys } from "../../../config/thresholds.js";
import type { ParsedLog } from "../log/parser.js";
import { at, has, mad, median, rejectOutliers, round } from "../log/series.js";

export type MafDiffItem = {
  itemId: number;
  type: "CURVE_POINT";
  path: "Airflow.MAF.Curve";
  coordinates: { x: number; y: null };
  valueMode: "MULTIPLIER";
  before: null;
  after: number;
  units: "multiplier";
  confidence: number;
  reason: string;
  applyNotes: string;
  status: "APPROVED" | "SUGGESTED";
  tags: string[];
  provenance: {
    binWidthHz: number;
    seconds: number;
    samples: number;
    mad: number;
    stability: number;
    rawErrorPct: number;
    clampedFrom?: number;
  };
};

export type MafDiffSet = {
  name: string;
  source: "MAF_SUGGESTION_WB";
  items: MafDiffItem[];
  diagnostics: {
    mode: "WB";
    binsConsidered: number;
    binsEmitted: number;
    binsRejected: number;
    totalClamped: number;
    stepClamped: number;
    notes: string[];
  };
};

export type MafResult =
  | { ok: true; diffSet: MafDiffSet }
  | { ok: false; reason: string; missing?: string[] };

type Bin = {
  hz: number;
  errors: number[]; // fractional error per sample, +ve means MAF reads low
  seconds: number;
};

/**
 * Generate MAF curve multiplier suggestions from wideband data.
 *
 * The physics: when measured AFR is leaner than commanded, the ECU injected
 * less fuel than the cylinder actually needed, which means the MAF under-read
 * the air. The correction is the ratio of measured to commanded AFR, applied
 * to the MAF transfer function at the frequency that was flowing at the time.
 *
 * Everything else here is about not trusting that number too much:
 *
 *  - Only steady-state samples count. During a transient the wideband is
 *    reading air that passed the sensor some time ago, so pairing them
 *    produces a confident, wrong correction.
 *  - Per bin, outliers are rejected by MAD and the median is used, so a couple
 *    of bad samples cannot move a bin.
 *  - Bins with too little data are dropped rather than extrapolated.
 *  - Corrections are clamped, both in total and step-to-step between adjacent
 *    bins, because a MAF curve with a discontinuity drives worse than one that
 *    is slightly wrong everywhere.
 *  - Confidence is reported per bin so the reviewing human can see which
 *    points are well-supported.
 */
export function generateMafSuggestions(
  log: ParsedLog,
  thresholds: DiffgenThresholds
): MafResult {
  const keys = ["mafBinWidthHz", "mafMinBinSeconds", "mafMaxStepPct", "mafMaxTotalPct"] as const;
  if (!allSet(thresholds, [...keys])) {
    return {
      ok: false,
      reason: "MAF diffgen thresholds are not configured.",
      missing: missingKeys(thresholds, [...keys])
    };
  }

  const needed = (["maf_hz", "afr_wb", "afr_cmd", "rpm", "tps"] as const).filter((c) => !has(log, c));
  if (needed.length > 0) {
    return { ok: false, reason: "Required channels missing for MAF suggestions.", missing: [...needed] };
  }

  const binWidth = thresholds.mafBinWidthHz!;
  const minSeconds = thresholds.mafMinBinSeconds!;
  const maxStep = thresholds.mafMaxStepPct!;
  const maxTotal = thresholds.mafMaxTotalPct!;

  const dt = log.sampleRateHz && log.sampleRateHz > 0 ? 1 / log.sampleRateHz : null;
  if (dt === null) return { ok: false, reason: "Log has no usable time base." };

  // ---- collect steady-state samples into frequency bins --------------------
  const LOOKBACK = 5;
  const bins = new Map<number, Bin>();
  let considered = 0;

  const steady = (i: number): boolean => {
    if (i < LOOKBACK) return false;
    let minR = Infinity, maxR = -Infinity, minT = Infinity, maxT = -Infinity;
    for (let k = i - LOOKBACK; k <= i; k++) {
      const r = at(log, "rpm", k);
      const t = at(log, "tps", k);
      if (!Number.isFinite(r) || !Number.isFinite(t)) return false;
      minR = Math.min(minR, r); maxR = Math.max(maxR, r);
      minT = Math.min(minT, t); maxT = Math.max(maxT, t);
    }
    // Tight windows: transient data is worse than no data here.
    return maxR - minR <= 150 && maxT - minT <= 2;
  };

  for (let i = 0; i < log.sampleCount; i++) {
    const hz = at(log, "maf_hz", i);
    const wb = at(log, "afr_wb", i);
    const cmd = at(log, "afr_cmd", i);
    if (!Number.isFinite(hz) || !Number.isFinite(wb) || !Number.isFinite(cmd)) continue;
    if (hz <= 0 || cmd <= 0) continue;
    if (!steady(i)) continue;

    considered++;
    // wb > cmd  =>  ran lean  =>  MAF under-read  =>  multiplier > 1
    const err = wb / cmd - 1;
    const key = Math.round(hz / binWidth) * binWidth;
    const bin = bins.get(key) ?? { hz: key, errors: [], seconds: 0 };
    bin.errors.push(err);
    bin.seconds += dt;
    bins.set(key, bin);
  }

  const notes: string[] = [];
  const sorted = [...bins.values()].sort((a, b) => a.hz - b.hz);

  // ---- per-bin robust estimate --------------------------------------------
  type Candidate = { hz: number; mult: number; raw: number; conf: number; seconds: number; samples: number; madv: number; stability: number };
  const candidates: Candidate[] = [];
  let rejected = 0;

  for (const bin of sorted) {
    if (bin.seconds < minSeconds || bin.errors.length < 4) { rejected++; continue; }

    const filtered = rejectOutliers(bin.errors, 3);
    if (filtered.length < 4) { rejected++; continue; }

    const err = median(filtered);
    const spread = mad(filtered);

    // Stability: tight spread -> trustworthy. 0.02 (2% MAD) maps to ~0.
    const stability = Math.max(0, Math.min(1, 1 - spread / 0.02));
    // More seconds of data raises confidence, saturating at 4x the minimum.
    const coverage = Math.max(0, Math.min(1, bin.seconds / (minSeconds * 4)));
    const conf = round(0.4 * coverage + 0.6 * stability, 2);

    candidates.push({
      hz: bin.hz,
      mult: 1 + err,
      raw: err,
      conf,
      seconds: round(bin.seconds, 1),
      samples: filtered.length,
      madv: round(spread, 4),
      stability: round(stability, 2)
    });
  }

  if (candidates.length === 0) {
    return {
      ok: false,
      reason:
        "No frequency bin had enough steady-state wideband data to support a correction. " +
        "A longer log with more steady cruise would help."
    };
  }

  // ---- clamp total, then smooth step-to-step ------------------------------
  let totalClamped = 0;
  for (const c of candidates) {
    const capped = Math.max(1 - maxTotal, Math.min(1 + maxTotal, c.mult));
    if (capped !== c.mult) { totalClamped++; c.mult = capped; }
  }

  // Walk upward in frequency limiting adjacent change. A discontinuous MAF
  // curve drives worse than a uniformly slightly-wrong one.
  let stepClamped = 0;
  for (let i = 1; i < candidates.length; i++) {
    const prev = candidates[i - 1].mult;
    const cur = candidates[i].mult;
    const maxUp = prev * (1 + maxStep);
    const maxDown = prev * (1 - maxStep);
    if (cur > maxUp) { candidates[i].mult = maxUp; stepClamped++; }
    else if (cur < maxDown) { candidates[i].mult = maxDown; stepClamped++; }
  }

  if (totalClamped > 0) {
    notes.push(
      `${totalClamped} bin(s) hit the ${round(maxTotal * 100, 1)}% single-pass limit. ` +
        `A correction that large usually means something mechanical, not a MAF calibration error.`
    );
  }
  if (stepClamped > 0) {
    notes.push(`${stepClamped} bin(s) were smoothed to keep adjacent steps within ${round(maxStep * 100, 1)}%.`);
  }

  // ---- emit ---------------------------------------------------------------
  const items: MafDiffItem[] = candidates.map((c, idx) => {
    const clampedFrom = round(1 + c.raw, 4) !== round(c.mult, 4) ? round(1 + c.raw, 4) : undefined;
    const pct = round(c.raw * 100, 1);
    return {
      itemId: idx + 1,
      type: "CURVE_POINT",
      path: "Airflow.MAF.Curve",
      coordinates: { x: c.hz, y: null },
      valueMode: "MULTIPLIER",
      before: null,
      after: round(c.mult, 4),
      units: "multiplier",
      confidence: c.conf,
      reason:
        `WB-based error ${pct >= 0 ? "+" : ""}${pct}% steady-state; median/MAD filtered` +
        (clampedFrom !== undefined ? "; clamped" : ""),
      applyNotes: `Multiply MAF g/s at ~${c.hz} Hz by ${round(c.mult, 4)}`,
      // Anything under 0.6 confidence is a suggestion for a human to weigh,
      // not something to hand over as ready to apply.
      status: c.conf >= 0.6 ? "APPROVED" : "SUGGESTED",
      tags: ["GM", "LS", "MAF"],
      provenance: {
        binWidthHz: binWidth,
        seconds: c.seconds,
        samples: c.samples,
        mad: c.madv,
        stability: c.stability,
        rawErrorPct: pct,
        ...(clampedFrom !== undefined ? { clampedFrom } : {})
      }
    };
  });

  return {
    ok: true,
    diffSet: {
      name: "GM LS MAF Suggestions (v1)",
      source: "MAF_SUGGESTION_WB",
      items,
      diagnostics: {
        mode: "WB",
        binsConsidered: considered,
        binsEmitted: items.length,
        binsRejected: rejected,
        totalClamped,
        stepClamped,
        notes
      }
    }
  };
}
