/**
 * Safety and drivability thresholds.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  THESE SHIP UNSET ON PURPOSE. DO NOT FILL THEM IN WITH PLAUSIBLE-LOOKING
 *  NUMBERS TO MAKE THE TESTS GO GREEN.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A wrong threshold here does not produce a slightly-off report. It passes a
 * dangerous condition silently — a lean-under-load event that should have
 * blocked a WOT pull gets reported as fine. These are engineering judgment
 * about specific platforms, fuel, and hardware, and they belong to the owner
 * in the same way the price book does.
 *
 * A rule whose thresholds are null does not quietly pass. It is skipped, and
 * the run reports `R1_THRESHOLD_UNSET` naming the rule. Diffgen refuses to run
 * while any safety rule is unevaluated, because a MAF correction derived from a
 * log whose safety was never assessed is exactly the artefact this system
 * exists to prevent.
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

export const THRESHOLDS: Thresholds = {
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
