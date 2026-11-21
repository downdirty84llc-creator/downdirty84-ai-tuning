# Fuel-unit safety restriction

Candidate change, not proof of calibration safety. No threshold value or owner-confirmation flag changes.

The prior parser guessed lambda from numeric ranges and multiplied by gasoline14.7 even for E85, and mapped equivalence-ratio headers onto the same command channel. A warning alone did not stop action. This change rejects explicit lambda/equivalence headers and units and dimensionless-range AFR samples instead of guessing conversions. E85 and unknown/contradictory profiles fail actionable validation until fuel-scale semantics are explicitly supported. FLEX and ETHANOL no longer identify exact E85. Explicit incompatible induction/service metadata cannot inherit confirmed NA gasoline.

Raw AFR gasoline support remains conditional on correct source metadata and scaling. A generic AFR label cannot prove calibration, wideband scale or truthful vehicle metadata. No silent rescaling, numeric approval or autonomous vehicle clearance is introduced.

Successful new runs and generated proposals carry server-written GAS_AFR_FAILCLOSED_V1 provenance. Legacy runs require re-analysis before generation. Legacy proposals require regeneration before release, customer payload visibility or CSV/summary export. Never backfill this marker onto historical data. Admin inspection and rejection remain allowed. Manual release remains required even with current provenance.

Operational impact: previously accepted lambda logs, all E85 and unknown profiles are now rejected with an actionable explanation. Supported gasoline AFR paths remain tested. Production read-only review on November16 found zero diffsets at check time. That observation is not a permanent guarantee.

Validation: local unit suite and backend type/build; isolated Postgres HTTP integration tests added for legacy run/release denial. CI must execute those database/browser checks before any production deployment. Synthetic test logs do not validate real thresholds.
