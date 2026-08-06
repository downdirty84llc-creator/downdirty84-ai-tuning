import type { Thresholds } from "./thresholds.js";

/**
 * Threshold profiles, by fuel and induction.
 *
 * One global set of numbers was wrong for this shop. A 0.8 AFR lean margin is
 * a reasonable NA-gasoline heuristic and a dangerous one on boost, and on E85
 * it does not even mean the same thing — stoich is ~9.77 rather than ~14.7, so
 * the same AFR delta is half again as large in lambda terms.
 *
 *   0.8 AFR on gasoline   → 0.8 / 14.7 = 5.4% lean
 *   0.8 AFR on E85        → 0.8 /  9.77 = 8.2% lean   ← much further out
 *
 * So the profile is chosen from the job, not assumed, and each profile is
 * confirmed by the owner separately. Confirming the one you actually validated
 * must not silently vouch for the three you did not.
 */

export type Fuel = "GASOLINE" | "E85";
export type Induction = "NA" | "FORCED";

export type ProfileKey = "NA_GAS" | "BOOSTED_GAS" | "NA_E85" | "BOOSTED_E85";

export const PROFILE_KEYS: ProfileKey[] = ["NA_GAS", "BOOSTED_GAS", "NA_E85", "BOOSTED_E85"];

export const PROFILE_LABELS: Record<ProfileKey, string> = {
  NA_GAS: "Naturally aspirated, gasoline",
  BOOSTED_GAS: "Forced induction, gasoline",
  NA_E85: "Naturally aspirated, E85",
  BOOSTED_E85: "Forced induction, E85"
};

/** Stoichiometric AFR, used to express a lean margin as a fraction of stoich. */
export const STOICH: Record<Fuel, number> = { GASOLINE: 14.7, E85: 9.77 };

export function profileKey(fuel: Fuel, induction: Induction): ProfileKey {
  if (induction === "FORCED") return fuel === "E85" ? "BOOSTED_E85" : "BOOSTED_GAS";
  return fuel === "E85" ? "NA_E85" : "NA_GAS";
}

/**
 * Work out the profile from what the job actually records.
 *
 * Returns null when either half is unknown. A null is not a licence to guess:
 * callers fall back to the strictest values across all profiles and report the
 * run as unconfirmed, because assuming the confirmed profile on unknown input
 * is exactly how an unchecked thing comes to read as a checked one.
 */
export function selectProfile(job: {
  fuel?: string | null;
  induction?: string | null;
  service_type?: string | null;
}): ProfileKey | null {
  const fuel = normaliseFuel(job.fuel);

  // STAGE1_BOOST is an explicit statement that the car is boosted, so it is
  // usable evidence. STAGE1_NA likewise. LOG_REVIEW says nothing either way.
  let induction = normaliseInduction(job.induction);
  if (!induction && job.service_type === "STAGE1_BOOST") induction = "FORCED";
  if (!induction && job.service_type === "STAGE1_NA") induction = "NA";

  if (!fuel || !induction) return null;
  return profileKey(fuel, induction);
}

export function normaliseFuel(v: string | null | undefined): Fuel | null {
  const s = (v ?? "").trim().toUpperCase();
  if (s === "GASOLINE" || s === "GAS" || s === "PUMP" || s === "PETROL") return "GASOLINE";
  if (s === "E85" || s === "ETHANOL" || s === "FLEX") return "E85";
  return null;
}

export function normaliseInduction(v: string | null | undefined): Induction | null {
  const s = (v ?? "").trim().toUpperCase();
  if (s === "NA" || s === "N/A" || s === "NATURALLY_ASPIRATED") return "NA";
  if (s === "FORCED" || s === "BOOST" || s === "BOOSTED" || s === "TURBO" || s === "SUPERCHARGED")
    return "FORCED";
  return null;
}

/**
 * Conservative starting values per profile.
 *
 * ───────────────────────────────────────────────────────────────────────────
 *  Only NA_GAS has been reviewed by the owner. The other three are starting
 *  points biased hard toward over-flagging, and every run against them is
 *  reported as unconfirmed until the owner supplies real numbers.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Where a boosted or E85 value differs from NA gasoline, the reasoning is on
 * the line. Where it does not differ, it is because the physics does not care
 * about induction or fuel — a 108 °C coolant ceiling is a coolant ceiling.
 */
function naGas(): Thresholds {
  return {
    safety: {
      leanAfrDelta: 0.8,
      leanMinTps: 55,
      leanMinSeconds: 1.5,
      krDegrees: 3,
      krMinSeconds: 1.0,
      ectMaxC: 108,
      iatMaxC: 70,
      overtempMinSeconds: 3,
      fuelPressDropPct: 0.12,
      fuelPressMinSeconds: 1.0
    },
    drivability: {
      surgeStftP2P: 8,
      cruiseMaxRpmVariation: 200,
      cruiseMaxTpsVariation: 3,
      cruiseMinSeconds: 5,
      throttleClosureMinDelta: 5,
      throttleClosureMinSeconds: 1.0
    },
    diffgen: {
      mafMaxStepPct: 0.03,
      mafMaxTotalPct: 0.15,
      mafMinBinSeconds: 8,
      mafBinWidthHz: 200
    }
  };
}

export const PROFILE_DEFAULTS: Record<ProfileKey, Thresholds> = {
  NA_GAS: naGas(),

  BOOSTED_GAS: {
    ...naGas(),
    safety: {
      ...naGas().safety,
      // Under boost a lean excursion damages an engine in far less time and at
      // far smaller margins than it does NA, so both the margin and the time
      // it must hold come down.
      leanAfrDelta: 0.5,
      leanMinSeconds: 1.0,
      // Boost makes cylinder pressure, and cylinder pressure makes detonation.
      // 2° sustained will over-flag on noisy engines; that is the intent.
      krDegrees: 2,
      krMinSeconds: 0.7,
      // Charge temperature is the thing an intercooler is fighting. A boosted
      // car seeing 60 °C intake air is losing that fight.
      iatMaxC: 60,
      // Boosted fuel systems are closer to their limit at peak demand, so a
      // smaller sag is meaningful sooner.
      fuelPressDropPct: 0.08,
      fuelPressMinSeconds: 0.7
    },
    diffgen: {
      ...naGas().diffgen,
      // A boosted MAF curve spans a much wider airflow range, so a correction
      // of the same percentage moves far more actual fuel. Smaller single pass.
      mafMaxTotalPct: 0.1
    }
  },

  NA_E85: {
    ...naGas(),
    safety: {
      ...naGas().safety,
      // Scaled to keep the same fraction-of-stoich margin as gasoline:
      // 0.8 / 14.7 × 9.77 ≈ 0.53. Without this rescaling an E85 log would have
      // to go half again as lean before the rule noticed.
      leanAfrDelta: 0.53,
      // E85's charge cooling and knock resistance mean measurable knock retard
      // is more anomalous, not less — so it is flagged sooner, not later.
      krDegrees: 2.5,
      // E85 needs roughly 30% more fuel volume, so the pump is working harder
      // at the same power and pressure drop matters sooner.
      fuelPressDropPct: 0.1
    }
  },

  BOOSTED_E85: {
    ...naGas(),
    safety: {
      ...naGas().safety,
      // Boosted margin (0.5 AFR on gasoline) rescaled to E85 stoich:
      // 0.5 / 14.7 × 9.77 ≈ 0.33.
      leanAfrDelta: 0.33,
      leanMinSeconds: 1.0,
      krDegrees: 2,
      krMinSeconds: 0.7,
      iatMaxC: 60,
      fuelPressDropPct: 0.07,
      fuelPressMinSeconds: 0.7
    },
    diffgen: {
      ...naGas().diffgen,
      mafMaxTotalPct: 0.1
    }
  }
};

type NumericGroup = Record<string, number | null>;

/**
 * For each threshold, the value that flags soonest across every profile.
 *
 * Used when the job does not say what the car is. The result is never treated
 * as confirmed — it is the safe thing to measure against while the run is
 * openly reported as judged without knowing the platform.
 *
 * "Strictest" is per-field, not per-profile, because the direction that means
 * "flag sooner" differs by field: a lower ceiling is stricter, but a lower
 * minimum-duration is also stricter, while a *higher* minimum-TPS would mean
 * looking at less of the log.
 */
function strictestGroup<T extends NumericGroup>(groups: T[], lowerIsStricter: (k: string) => boolean): T {
  const out = { ...groups[0] };
  for (const key of Object.keys(out)) {
    const values = groups
      .map((g) => g[key])
      .filter((v): v is number => v !== null && v !== undefined);
    if (values.length === 0) {
      (out as NumericGroup)[key] = null;
      continue;
    }
    (out as NumericGroup)[key] = lowerIsStricter(key) ? Math.min(...values) : Math.max(...values);
  }
  return out;
}

/**
 * Fields where a *higher* number means the check is more eager to fire.
 * Everything else is stricter when lower.
 */
const HIGHER_IS_STRICTER = new Set<string>([
  // Wider bins and longer windows are not stricter, but these three genuinely
  // are: they widen what the rule is willing to look at.
  "cruiseMaxRpmVariation",
  "cruiseMaxTpsVariation",
  "mafBinWidthHz"
]);

export function strictestAcrossProfiles(): Thresholds {
  const all = PROFILE_KEYS.map((k) => PROFILE_DEFAULTS[k]);
  const stricter = (k: string) => !HIGHER_IS_STRICTER.has(k);
  return {
    safety: strictestGroup(all.map((t) => t.safety), stricter),
    drivability: strictestGroup(all.map((t) => t.drivability), stricter),
    diffgen: strictestGroup(all.map((t) => t.diffgen), stricter)
  };
}
