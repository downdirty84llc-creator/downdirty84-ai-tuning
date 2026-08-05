import type { Thresholds } from "./thresholds.js";

/**
 * Conservative starting thresholds.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  THESE ARE NOT OWNER-CONFIRMED VALUES. Every report generated while they are
 *  in use says so, in the findings, in the exported summary, and in the run
 *  record. Confirm them in thresholds.ts before treating any clean result as
 *  a clearance.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ## The bias, stated plainly
 *
 * Every value below is deliberately chosen to be **too sensitive rather than
 * too permissive**. The two failure modes are not symmetric:
 *
 *   - Too sensitive → a false blocker. The owner reviews a log that was
 *     actually fine, is mildly annoyed, and moves on.
 *   - Too permissive → a real lean event, knock event or overtemp passes as
 *     clean. That is the failure this whole system exists to prevent.
 *
 * So where a range is defensible, these sit at the cautious end of it. Expect
 * false positives. Tightening them is an owner decision made with evidence
 * from real logs; loosening them without that evidence is not.
 *
 * ## Provenance
 *
 * These are general naturally-aspirated gasoline heuristics, not values
 * derived from a specific platform, fuel, or build. Forced induction, E85,
 * diesel, and high-compression builds all want different numbers. Nothing here
 * was measured on a DD84 customer vehicle.
 *
 * ## Applicability
 *
 * Assumed: gasoline, naturally aspirated, wideband correctly scaled and placed,
 * engine at operating temperature. Outside those assumptions the detection
 * rules still run, but the thresholds are less meaningful — which is another
 * reason the report keeps flagging them as unconfirmed.
 */
export const CONSERVATIVE_DEFAULTS: Thresholds = {
  safety: {
    /**
     * 0.8 AFR leaner than commanded. Sensors and fuelling drift by a few
     * tenths in normal operation, so this sits just above routine noise and
     * well below anything that should be tolerated under load.
     */
    leanAfrDelta: 0.8,

    /**
     * 55% throttle. "Under load" starts lower than most people assume — a
     * lean condition at part throttle on a loaded engine still matters, and
     * catching it early is the cautious direction.
     */
    leanMinTps: 55,

    /**
     * 1.5 seconds. Long enough to reject a single-sample sensor glitch, short
     * enough that a real sustained lean event cannot slip through.
     */
    leanMinSeconds: 1.5,

    /**
     * 3° of knock retard. Some platforms report small values routinely; 3°
     * sustained is low enough to catch genuine detonation early and will
     * produce false positives on noisy engines. That trade is intentional.
     */
    krDegrees: 3,
    krMinSeconds: 1.0,

    /**
     * 108°C coolant, 70°C intake air. Both are below where most engines are
     * in real trouble, so this flags a trend before it becomes damage.
     */
    ectMaxC: 108,
    iatMaxC: 70,
    overtempMinSeconds: 3,

    /**
     * A 12% drop from the log's own low-load baseline, under demand. Measured
     * against the log rather than an absolute figure, because base pressure
     * varies by system.
     */
    fuelPressDropPct: 0.12,
    fuelPressMinSeconds: 1.0
  },

  drivability: {
    /** 8% STFT peak-to-peak during steady cruise reads as a hunt to a driver. */
    surgeStftP2P: 8,
    cruiseMaxRpmVariation: 200,
    cruiseMaxTpsVariation: 3,
    cruiseMinSeconds: 5,

    throttleClosureMinDelta: 5,
    throttleClosureMinSeconds: 1.0
  },

  diffgen: {
    /**
     * 3% maximum change between adjacent MAF bins. A discontinuous MAF curve
     * drives worse than one that is uniformly slightly wrong.
     */
    mafMaxStepPct: 0.03,

    /**
     * 15% maximum single-pass correction. A MAF genuinely off by more than
     * this usually means something mechanical — a leak, wrong sensor, wrong
     * pipe diameter — and applying a large multiplier would paper over it.
     * Bins that clamp here are flagged in the diagnostics.
     */
    mafMaxTotalPct: 0.15,

    /**
     * 8 seconds of steady-state data per bin. Above the 5s used in tests,
     * because thin bins produce confident-looking corrections from very
     * little evidence.
     */
    mafMinBinSeconds: 8,

    /** 200 Hz bins, matching the sample diffset's provenance. */
    mafBinWidthHz: 200
  }
};
