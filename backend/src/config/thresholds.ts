/**
 * Safety and drivability thresholds.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  The system runs on CONSERVATIVE_DEFAULTS until the owner confirms values
 *  here. Every report produced under defaults is marked UNCONFIRMED.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A wrong threshold does not produce a slightly-off report. It passes a
 * dangerous condition silently — a lean-under-load event that should have
 * blocked a WOT pull gets reported as fine. These are engineering judgment
 * about specific platforms, fuel, and hardware, and they belong to the owner
 * in the same way the price book does.
 *
 * The defaults exist so the pipeline is usable, and they are deliberately
 * biased toward over-flagging: a false blocker is an annoyance, a missed one
 * is the failure this system exists to prevent. See thresholds.defaults.ts for
 * each value and why it sits where it does.
 *
 * A rule whose threshold is genuinely null is still skipped rather than passed,
 * reported as `R1_THRESHOLD_UNSET`, and still blocks diffgen — an unevaluated
 * safety check is never a pass.
 *
 * See docs/ANALYSIS-ENGINE.md for what each value means.
 */

export type SafetyThresholds = {
  /** S1: how much leaner than commanded AFR counts as lean. */
  leanAfrDelta: number | null;
  /** S1: only applies above this load, as throttle %. */
  leanMinTps: number | null;
  /** S1: must hold this long to be a blocker. */
  leanMinSeconds: number | null;

  /** S2: knock retard in degrees that counts as excessive. */
  krDegrees: number | null;
  /** S2: must hold this long. */
  krMinSeconds: number | null;

  /** S3: coolant and intake air ceilings, °C. */
  ectMaxC: number | null;
  iatMaxC: number | null;
  overtempMinSeconds: number | null;

  /** S4: fuel pressure drop from baseline, as a percentage, under demand. */
  fuelPressDropPct: number | null;
  fuelPressMinSeconds: number | null;
};

export type DrivabilityThresholds = {
  /** D1: STFT peak-to-peak during steady cruise that counts as surge. */
  surgeStftP2P: number | null;
  /** D1: what counts as "steady cruise" — RPM and TPS variation ceilings. */
  cruiseMaxRpmVariation: number | null;
  cruiseMaxTpsVariation: number | null;
  cruiseMinSeconds: number | null;

  /** D2: throttle closing while pedal demand rises. */
  throttleClosureMinDelta: number | null;
  throttleClosureMinSeconds: number | null;
};

export type DiffgenThresholds = {
  /** Maximum change between adjacent MAF bins, as a fraction (0.03 = 3%). */
  mafMaxStepPct: number | null;
  /** Maximum single-pass correction on any bin, as a fraction. */
  mafMaxTotalPct: number | null;
  /** Minimum seconds of data in a bin before it may be corrected. */
  mafMinBinSeconds: number | null;
  /** Bin width in Hz. */
  mafBinWidthHz: number | null;
};

export type Thresholds = {
  safety: SafetyThresholds;
  drivability: DrivabilityThresholds;
  diffgen: DiffgenThresholds;
};

import { CONSERVATIVE_DEFAULTS } from "./thresholds.defaults.js";
export { CONSERVATIVE_DEFAULTS };

/**
 * Owner-confirmed overrides.
 *
 * Anything left null here falls back to CONSERVATIVE_DEFAULTS, and the run is
 * marked UNCONFIRMED — which appears in the findings, the exported summary, and
 * the run record, so a clean result is never mistaken for a clearance.
 *
 * To confirm: replace the nulls with your values, then set
 * OWNER_CONFIRMED_THRESHOLDS to true below. Do both. Setting the flag without
 * setting values leaves the conservative defaults in place under a claim that
 * they were reviewed, which is worse than either alone.
 */
export const OWNER_OVERRIDES: Thresholds = {
  safety: {
    leanAfrDelta: null,
    leanMinTps: null,
    leanMinSeconds: null,
    krDegrees: null,
    krMinSeconds: null,
    ectMaxC: null,
    iatMaxC: null,
    overtempMinSeconds: null,
    fuelPressDropPct: null,
    fuelPressMinSeconds: null
  },
  drivability: {
    surgeStftP2P: null,
    cruiseMaxRpmVariation: null,
    cruiseMaxTpsVariation: null,
    cruiseMinSeconds: null,
    throttleClosureMinDelta: null,
    throttleClosureMinSeconds: null
  },
  diffgen: {
    mafMaxStepPct: null,
    mafMaxTotalPct: null,
    mafMinBinSeconds: null,
    mafBinWidthHz: null
  }
};

/**
 * Flip to true only after reviewing every value in OWNER_OVERRIDES against
 * your platforms, fuel, and customer hardware.
 */
export const OWNER_CONFIRMED_THRESHOLDS = false;

export type ThresholdSource = "OWNER_CONFIRMED" | "CONSERVATIVE_DEFAULTS";

function mergeGroup<T extends Record<string, number | null>>(defaults: T, overrides: T): T {
  const out = { ...defaults };
  for (const k of Object.keys(defaults) as Array<keyof T>) {
    if (overrides[k] !== null && overrides[k] !== undefined) out[k] = overrides[k];
  }
  return out;
}

export function resolveThresholds(): { thresholds: Thresholds; source: ThresholdSource } {
  const merged: Thresholds = {
    safety: mergeGroup(CONSERVATIVE_DEFAULTS.safety, OWNER_OVERRIDES.safety),
    drivability: mergeGroup(CONSERVATIVE_DEFAULTS.drivability, OWNER_OVERRIDES.drivability),
    diffgen: mergeGroup(CONSERVATIVE_DEFAULTS.diffgen, OWNER_OVERRIDES.diffgen)
  };
  return {
    thresholds: merged,
    source: OWNER_CONFIRMED_THRESHOLDS ? "OWNER_CONFIRMED" : "CONSERVATIVE_DEFAULTS"
  };
}

/** The active thresholds. Conservative defaults until the owner confirms. */
export const THRESHOLDS: Thresholds = resolveThresholds().thresholds;
export const THRESHOLD_SOURCE: ThresholdSource = resolveThresholds().source;

/** Every threshold explicitly unset. Used by tests that assert refusal. */
export const NO_THRESHOLDS: Thresholds = {
  safety: {
    leanAfrDelta: null,
    leanMinTps: null,
    leanMinSeconds: null,
    krDegrees: null,
    krMinSeconds: null,
    ectMaxC: null,
    iatMaxC: null,
    overtempMinSeconds: null,
    fuelPressDropPct: null,
    fuelPressMinSeconds: null
  },
  drivability: {
    surgeStftP2P: null,
    cruiseMaxRpmVariation: null,
    cruiseMaxTpsVariation: null,
    cruiseMinSeconds: null,
    throttleClosureMinDelta: null,
    throttleClosureMinSeconds: null
  },
  diffgen: {
    mafMaxStepPct: null,
    mafMaxTotalPct: null,
    mafMinBinSeconds: null,
    mafBinWidthHz: null
  }
};

/** True when every listed threshold has a value. */
export function allSet<T extends Record<string, number | null>>(
  group: T,
  keys: Array<keyof T>
): boolean {
  return keys.every((k) => group[k] !== null && group[k] !== undefined);
}

/** Names the thresholds a rule needs but does not have, for the INFO finding. */
export function missingKeys<T extends Record<string, number | null>>(
  group: T,
  keys: Array<keyof T>
): string[] {
  return keys.filter((k) => group[k] === null || group[k] === undefined).map(String);
}
