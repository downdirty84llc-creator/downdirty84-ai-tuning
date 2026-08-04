import { allSet, missingKeys } from "../../../config/thresholds.js";
import {
  at,
  findSustained,
  has,
  peakToPeak,
  round,
  toEvidenceRanges,
  valuesIn
} from "../log/series.js";
import { mkFinding, type Rule, type RuleOutcome } from "./types.js";

/**
 * D1 — Cruise surge.
 *
 * Fuel trims oscillating during steady cruise: usually airflow modeling error
 * or O2 control instability, and the customer feels it as a hunt or surge.
 * "Steady cruise" is established first, so trim movement during an actual
 * throttle change is not mistaken for surge.
 */
export const cruiseSurge: Rule = {
  code: "D1_CRUISE_SURGE",
  title: "Cruise surge / closed-loop oscillation",
  severity: "WARN",
  safety: false,
  run({ log, thresholds, nextId }): RuleOutcome {
    const need = ["rpm", "tps", "stft_b1"] as const;
    const missingData = need.filter((c) => !has(log, c));
    if (missingData.length > 0) return { state: "SKIPPED_NO_DATA", missing: [...missingData] };

    const keys = [
      "surgeStftP2P",
      "cruiseMaxRpmVariation",
      "cruiseMaxTpsVariation",
      "cruiseMinSeconds"
    ] as const;
    if (!allSet(thresholds.drivability, [...keys])) {
      return {
        state: "SKIPPED_NO_THRESHOLDS",
        missing: missingKeys(thresholds.drivability, [...keys])
      };
    }
    const p2pLimit = thresholds.drivability.surgeStftP2P!;
    const rpmVar = thresholds.drivability.cruiseMaxRpmVariation!;
    const tpsVar = thresholds.drivability.cruiseMaxTpsVariation!;
    const minSec = thresholds.drivability.cruiseMinSeconds!;

    // A short lookback keeps "steady" local, so a slow speed change does not
    // disqualify an otherwise steady stretch.
    const LOOKBACK = 10;
    const steady = (i: number): boolean => {
      if (i < LOOKBACK) return false;
      const rpmWin: number[] = [];
      const tpsWin: number[] = [];
      for (let k = i - LOOKBACK; k <= i; k++) {
        const r = at(log, "rpm", k);
        const t = at(log, "tps", k);
        if (!Number.isFinite(r) || !Number.isFinite(t)) return false;
        rpmWin.push(r);
        tpsWin.push(t);
      }
      if (Math.max(...rpmWin) < 800) return false; // not cruising, idling or off
      return peakToPeak(rpmWin) <= rpmVar && peakToPeak(tpsWin) <= tpsVar;
    };

    const cruiseWindows = findSustained(log, steady, { minSeconds: minSec });
    if (cruiseWindows.length === 0) {
      return {
        state: "EVALUATED",
        findings: [
          mkFinding(
            "D1_CRUISE_SURGE",
            "INFO",
            "No steady cruise found",
            "The log contains no steady cruise segment long enough to assess surge.",
            {
              id: nextId("D1_CRUISE_SURGE", 1),
              actions: [
                {
                  type: "RELOG",
                  priority: 1,
                  text: "Collect steady cruise segments at several speeds and gears, holding each 10–20 seconds."
                }
              ]
            }
          )
        ]
      };
    }

    const offending = cruiseWindows.filter((w) => {
      const b1 = peakToPeak(valuesIn(log, "stft_b1", w));
      const b2 = has(log, "stft_b2") ? peakToPeak(valuesIn(log, "stft_b2", w)) : NaN;
      return b1 >= p2pLimit || (Number.isFinite(b2) && b2 >= p2pLimit);
    });

    if (offending.length === 0) return { state: "EVALUATED", findings: [] };

    const worstB1 = Math.max(...offending.map((w) => peakToPeak(valuesIn(log, "stft_b1", w))));
    const stats: Record<string, number> = {
      stftP2PBank1Pct: round(worstB1, 1),
      cruiseWindows: cruiseWindows.length,
      offendingWindows: offending.length
    };
    if (has(log, "stft_b2")) {
      stats.stftP2PBank2Pct = round(
        Math.max(...offending.map((w) => peakToPeak(valuesIn(log, "stft_b2", w)))),
        1
      );
    }

    return {
      state: "EVALUATED",
      findings: [
        mkFinding(
          "D1_CRUISE_SURGE",
          "WARN",
          "Cruise surge / closed-loop oscillation",
          "Fuel trims oscillate significantly during steady cruise, consistent with airflow " +
            "modeling error or O2 control instability.",
          {
            id: nextId("D1_CRUISE_SURGE", 1),
            ranges: toEvidenceRanges(offending),
            stats,
            tags: ["DRIVABILITY"],
            charts: ["gpec_surge_primary"],
            actions: [
              {
                type: "RELOG",
                priority: 1,
                text: "Collect more steady-state cruise segments (multiple gears/speeds)."
              }
            ]
          }
        )
      ]
    };
  }
};

/**
 * D2 — Throttle closure against demand.
 *
 * Electronic throttle closing while the driver asks for more: torque
 * management, a limp condition, or a pedal/throttle correlation fault.
 * Needs both pedal and throttle channels to distinguish from a normal lift.
 */
export const throttleClosure: Rule = {
  code: "D2_THROTTLE_CLOSURE",
  title: "Throttle closure under demand",
  severity: "WARN",
  safety: false,
  run({ log, thresholds, nextId }): RuleOutcome {
    // Both pedal and throttle map onto `tps` aliases today; without two
    // distinct channels this rule cannot tell closure from a lift, so it
    // reports that rather than guessing.
    return {
      state: "SKIPPED_NO_DATA",
      missing: ["separate pedal-position and throttle-position channels"]
    };
  }
};

export const DRIVABILITY_RULES: Rule[] = [cruiseSurge, throttleClosure];
