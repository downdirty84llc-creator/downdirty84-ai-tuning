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
import {
  PROFILE_DEFAULTS,
  PROFILE_KEYS,
  strictestAcrossProfiles,
  type ProfileKey
} from "./thresholds.profiles.js";
export { CONSERVATIVE_DEFAULTS };

const NULL_THRESHOLDS = (): Thresholds => ({
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
});

/**
 * Owner-confirmed overrides, per profile.
 *
 * Anything left null falls back to that profile's defaults. A profile is only
 * treated as confirmed when its flag in OWNER_CONFIRMED_PROFILES is true, and
 * confirming one profile deliberately says nothing about the others — the
 * whole reason these are separate is that reviewing NA gasoline numbers does
 * not vouch for boosted or E85 ones.
 *
 * To confirm a profile: write its values here, then set its flag below. Do
 * both. Setting a flag without setting values leaves defaults in place under a
 * claim that they were reviewed, which is worse than either alone.
 */
export const OWNER_OVERRIDES: Record<ProfileKey, Thresholds> = {
  /**
   * Reviewed and approved by the owner (Down Dirty 84), 2026-08-06.
   *
   * Written out in full rather than left null on purpose: these exact numbers
   * are what was approved. Inheriting them from PROFILE_DEFAULTS would mean a
   * later edit to the defaults silently changed values carrying an owner's
   * name, which is not something a signature should allow.
   */
  NA_GAS: {
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
  },

  // Not yet reviewed. The starting values in thresholds.profiles.ts apply, and
  // every run against them is reported as unconfirmed.
  BOOSTED_GAS: NULL_THRESHOLDS(),
  NA_E85: NULL_THRESHOLDS(),
  BOOSTED_E85: NULL_THRESHOLDS()
};

/**
 * Which profiles the owner has reviewed against real platforms, fuel and
 * customer hardware. Flip one only after actually doing that for it.
 */
export const OWNER_CONFIRMED_PROFILES: Record<ProfileKey, boolean> = {
  NA_GAS: true,
  BOOSTED_GAS: false,
  NA_E85: false,
  BOOSTED_E85: false
};

export type ThresholdSource = "OWNER_CONFIRMED" | "CONSERVATIVE_DEFAULTS";

function mergeGroup<T extends Record<string, number | null>>(defaults: T, overrides: T): T {
  const out = { ...defaults };
  for (const k of Object.keys(defaults) as Array<keyof T>) {
    if (overrides[k] !== null && overrides[k] !== undefined) out[k] = overrides[k];
  }
  return out;
}

/**
 * The thresholds to judge one run by.
 *
 * `profile` null means the job did not say what the car is. That is not a
 * reason to fall through to the confirmed profile: it measures against the
 * strictest value across every profile and reports the run as unconfirmed,
 * because an unknown platform judged by NA-gasoline numbers under an owner's
 * signature is precisely the unchecked-reads-as-checked failure this system
 * is built to avoid.
 */
export function resolveThresholds(
  profile: ProfileKey | null = null
): { thresholds: Thresholds; source: ThresholdSource; profile: ProfileKey | null } {
  if (profile === null) {
    return { thresholds: strictestAcrossProfiles(), source: "CONSERVATIVE_DEFAULTS", profile: null };
  }

  const defaults = PROFILE_DEFAULTS[profile];
  const overrides = OWNER_OVERRIDES[profile];
  const merged: Thresholds = {
    safety: mergeGroup(defaults.safety, overrides.safety),
    drivability: mergeGroup(defaults.drivability, overrides.drivability),
    diffgen: mergeGroup(defaults.diffgen, overrides.diffgen)
  };

  return {
    thresholds: merged,
    source: OWNER_CONFIRMED_PROFILES[profile] ? "OWNER_CONFIRMED" : "CONSERVATIVE_DEFAULTS",
    profile
  };
}

/** True when every profile has been reviewed. Reported by /ready. */
export function allProfilesConfirmed(): boolean {
  return PROFILE_KEYS.every((k) => OWNER_CONFIRMED_PROFILES[k]);
}

/** Profiles still running on unreviewed starting values. */
export function unconfirmedProfiles(): ProfileKey[] {
  return PROFILE_KEYS.filter((k) => !OWNER_CONFIRMED_PROFILES[k]);
}

/**
 * The thresholds used when the platform is unknown, and their source.
 *
 * Kept as the module-level default so any caller that has not been given a
 * profile gets the cautious answer rather than the confirmed one.
 */
export const THRESHOLDS: Thresholds = resolveThresholds(null).thresholds;
export const THRESHOLD_SOURCE: ThresholdSource = resolveThresholds(null).source;

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
