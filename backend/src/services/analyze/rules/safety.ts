import { allSet, missingKeys } from "../../../config/thresholds.js";
import { at, findSustained, mean, median, round, toEvidenceRanges, has, valuesIn } from "../log/series.js";
import { mkFinding, type Rule, type RuleOutcome } from "./types.js";

/**
 * S1 — Lean under load.
 *
 * The most consequential rule in the system: a sustained lean condition under
 * load is how engines are damaged. Requires a wideband, because inferring this
 * from fuel trims alone cannot distinguish a real lean event from a trim
 * response to something else.
 */
export const leanUnderLoad: Rule = {
  code: "S1_LEAN_UNDER_LOAD",
  title: "Lean under load",
  severity: "BLOCKER",
  safety: true,
  run({ log, thresholds, nextId }): RuleOutcome {
    const need = ["afr_wb", "afr_cmd", "tps"] as const;
    const missingData = need.filter((c) => !has(log, c));
    if (missingData.length > 0) return { state: "SKIPPED_NO_DATA", missing: [...missingData] };

    const keys = ["leanAfrDelta", "leanMinTps", "leanMinSeconds"] as const;
    if (!allSet(thresholds.safety, [...keys])) {
      return { state: "SKIPPED_NO_THRESHOLDS", missing: missingKeys(thresholds.safety, [...keys]) };
    }
    const delta = thresholds.safety.leanAfrDelta!;
    const minTps = thresholds.safety.leanMinTps!;
    const minSec = thresholds.safety.leanMinSeconds!;

    const windows = findSustained(
      log,
      (i) => {
        const wb = at(log, "afr_wb", i);
        const cmd = at(log, "afr_cmd", i);
        const tps = at(log, "tps", i);
        if (!Number.isFinite(wb) || !Number.isFinite(cmd) || !Number.isFinite(tps)) return false;
        // Leaner means numerically higher AFR than commanded.
        return tps >= minTps && wb - cmd >= delta;
      },
      { minSeconds: minSec }
    );

    if (windows.length === 0) return { state: "EVALUATED", findings: [] };

    const worst = Math.max(
      ...windows.map((w) => {
        const wb = valuesIn(log, "afr_wb", w);
        const cmd = valuesIn(log, "afr_cmd", w);
        const n = Math.min(wb.length, cmd.length);
        let m = 0;
        for (let i = 0; i < n; i++) m = Math.max(m, wb[i] - cmd[i]);
        return m;
      })
    );

    return {
      state: "EVALUATED",
      findings: [
        mkFinding(
          "S1_LEAN_UNDER_LOAD",
          "BLOCKER",
          "Lean under load",
          `Wideband AFR ran leaner than commanded by up to ${round(worst, 2)} AFR under load, ` +
            `sustained across ${windows.length} window(s). Do not perform WOT until this is resolved.`,
          {
            id: nextId("S1_LEAN_UNDER_LOAD", 1),
            ranges: toEvidenceRanges(windows),
            stats: { worstAfrDelta: round(worst, 2), windows: windows.length },
            tags: ["SAFETY"],
            actions: [
              { type: "STOP", priority: 1, text: "No wide-open-throttle operation until this is investigated." },
              { type: "INSPECT", priority: 2, text: "Check fuel delivery, injector sizing, wideband scaling and placement." }
            ]
          }
        )
      ]
    };
  }
};

/** S2 — Excessive knock retard. */
export const excessiveKnock: Rule = {
  code: "S2_EXCESSIVE_KR",
  title: "Excessive knock retard",
  severity: "BLOCKER",
  safety: true,
  run({ log, thresholds, nextId }): RuleOutcome {
    if (!has(log, "kr")) return { state: "SKIPPED_NO_DATA", missing: ["kr"] };

    const keys = ["krDegrees", "krMinSeconds"] as const;
    if (!allSet(thresholds.safety, [...keys])) {
      return { state: "SKIPPED_NO_THRESHOLDS", missing: missingKeys(thresholds.safety, [...keys]) };
    }
    const degrees = thresholds.safety.krDegrees!;
    const minSec = thresholds.safety.krMinSeconds!;

    const windows = findSustained(log, (i) => at(log, "kr", i) >= degrees, { minSeconds: minSec });
    if (windows.length === 0) return { state: "EVALUATED", findings: [] };

    const peak = Math.max(...windows.flatMap((w) => valuesIn(log, "kr", w)));

    return {
      state: "EVALUATED",
      findings: [
        mkFinding(
          "S2_EXCESSIVE_KR",
          "BLOCKER",
          "Excessive knock retard",
          `Knock retard reached ${round(peak, 1)}° and stayed at or above ${degrees}° across ` +
            `${windows.length} window(s).`,
          {
            id: nextId("S2_EXCESSIVE_KR", 1),
            ranges: toEvidenceRanges(windows),
            stats: { peakKr: round(peak, 1), windows: windows.length },
            tags: ["SAFETY"],
            actions: [
              { type: "STOP", priority: 1, text: "Stop pulls until the cause is identified." },
              { type: "INSPECT", priority: 2, text: "Check fuel octane, timing, intake air temp, and for genuine detonation versus false knock." }
            ]
          }
        )
      ]
    };
  }
};

/** S3 — Overtemp on coolant or intake air. */
export const overtemp: Rule = {
  code: "S3_OVERTEMP",
  title: "Over-temperature",
  severity: "BLOCKER",
  safety: true,
  run({ log, thresholds, nextId }): RuleOutcome {
    const available = (["ect", "iat"] as const).filter((c) => has(log, c));
    if (available.length === 0) return { state: "SKIPPED_NO_DATA", missing: ["ect", "iat"] };

    const keys = ["overtempMinSeconds"] as const;
    const limitKeys: Array<"ectMaxC" | "iatMaxC"> = available.map((c) =>
      c === "ect" ? "ectMaxC" : "iatMaxC"
    );
    if (!allSet(thresholds.safety, [...keys, ...limitKeys])) {
      return {
        state: "SKIPPED_NO_THRESHOLDS",
        missing: missingKeys(thresholds.safety, [...keys, ...limitKeys])
      };
    }
    const minSec = thresholds.safety.overtempMinSeconds!;

    const findings = [];
    let seq = 0;
    for (const ch of available) {
      const limit = ch === "ect" ? thresholds.safety.ectMaxC! : thresholds.safety.iatMaxC!;
      const windows = findSustained(log, (i) => at(log, ch, i) >= limit, { minSeconds: minSec });
      if (windows.length === 0) continue;

      const peak = Math.max(...windows.flatMap((w) => valuesIn(log, ch, w)));
      const label = ch === "ect" ? "Coolant" : "Intake air";
      findings.push(
        mkFinding(
          "S3_OVERTEMP",
          "BLOCKER",
          `${label} over-temperature`,
          `${label} temperature reached ${round(peak, 1)}°C, at or above the ${limit}°C limit.`,
          {
            id: nextId("S3_OVERTEMP", ++seq),
            ranges: toEvidenceRanges(windows),
            stats: { peakC: round(peak, 1), limitC: limit },
            tags: ["SAFETY", ch.toUpperCase()],
            actions: [{ type: "INSPECT", priority: 1, text: `Investigate ${label.toLowerCase()} temperature before further testing.` }]
          }
        )
      );
    }

    return { state: "EVALUATED", findings };
  }
};

/**
 * S4 — Fuel pressure dropping under demand.
 *
 * Compares pressure during demand against the log's own idle/low-load median
 * rather than an absolute figure, because base pressure varies by system.
 */
export const fuelPressureDrop: Rule = {
  code: "S4_FUEL_PRESSURE_DROP",
  title: "Fuel pressure drop under demand",
  severity: "BLOCKER",
  safety: true,
  // The PRD scopes this rule "if channel available" — many setups have no fuel
  // pressure sensor, and requiring one to clear any log would be wrong.
  dataOptional: true,
  run({ log, thresholds, nextId }): RuleOutcome {
    const need = ["fuel_press", "tps"] as const;
    const missingData = need.filter((c) => !has(log, c));
    if (missingData.length > 0) return { state: "SKIPPED_NO_DATA", missing: [...missingData] };

    const keys = ["fuelPressDropPct", "fuelPressMinSeconds", "leanMinTps"] as const;
    if (!allSet(thresholds.safety, [...keys])) {
      return { state: "SKIPPED_NO_THRESHOLDS", missing: missingKeys(thresholds.safety, [...keys]) };
    }
    const dropPct = thresholds.safety.fuelPressDropPct!;
    const minSec = thresholds.safety.fuelPressMinSeconds!;
    const loadTps = thresholds.safety.leanMinTps!;

    // Baseline from low-load samples in this same log.
    const baselineSamples: number[] = [];
    for (let i = 0; i < log.sampleCount; i++) {
      const tps = at(log, "tps", i);
      const fp = at(log, "fuel_press", i);
      if (Number.isFinite(tps) && Number.isFinite(fp) && tps < loadTps / 2) baselineSamples.push(fp);
    }
    if (baselineSamples.length < 10) {
      return { state: "SKIPPED_NO_DATA", missing: ["low-load fuel pressure baseline"] };
    }
    const baseline = median(baselineSamples);
    const floor = baseline * (1 - dropPct);

    const windows = findSustained(
      log,
      (i) => at(log, "tps", i) >= loadTps && at(log, "fuel_press", i) <= floor,
      { minSeconds: minSec }
    );
    if (windows.length === 0) return { state: "EVALUATED", findings: [] };

    const lowest = Math.min(...windows.flatMap((w) => valuesIn(log, "fuel_press", w)));

    return {
      state: "EVALUATED",
      findings: [
        mkFinding(
          "S4_FUEL_PRESSURE_DROP",
          "BLOCKER",
          "Fuel pressure drop under demand",
          `Fuel pressure fell to ${round(lowest, 1)} from a low-load baseline of ${round(baseline, 1)} ` +
            `(a drop of ${round((1 - lowest / baseline) * 100, 1)}%) while under load.`,
          {
            id: nextId("S4_FUEL_PRESSURE_DROP", 1),
            ranges: toEvidenceRanges(windows),
            stats: {
              baseline: round(baseline, 1),
              lowest: round(lowest, 1),
              dropPct: round((1 - lowest / baseline) * 100, 1)
            },
            tags: ["SAFETY"],
            actions: [
              { type: "STOP", priority: 1, text: "No further load testing until fuel delivery is verified." },
              { type: "INSPECT", priority: 2, text: "Check pump capacity, filter, regulator, and wiring voltage drop." }
            ]
          }
        )
      ]
    };
  }
};

export const SAFETY_RULES: Rule[] = [leanUnderLoad, excessiveKnock, overtemp, fuelPressureDrop];

export { mean };
