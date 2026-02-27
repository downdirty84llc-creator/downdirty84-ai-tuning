# MVP PRD — Down Dirty 84 AI Tuning

## Goal
Analyze HP Tuners / Holley logs for GM/Ford/Stellantis (read-only diagnostics) and generate limited, safe calibration suggestions (write-intent) for GM LS P01/P59 MAF curve only.

## MVP Scope (Locked)
### Platforms
- GM: LS (P01/P59), LT family (E92/E41/E99/E90 umbrella) — diagnostics only for LT in MVP
- Ford: Coyote Gen 3 (TC-298), Gen 4 (MG1) — diagnostics only in MVP
- Stellantis: GPEC2/2A, GPEC3, GPEC4/4LM, GPEC5 — diagnostics only in MVP

### Toolchains
- HP Tuners + Holley logs (ingest/normalize)

### Core workflow
1) Upload logs -> start analysis run
2) Validation -> PASS/FAIL + next log plan
3) Findings -> evidence windows + chart specs
4) GM LS eligible -> generate MAF diffset + export summary + CSV

### Safety rules (MVP)
- Lean under load (WB)
- Excessive KR
- Overtemp (ECT/IAT)
- Fuel pressure drop (if channel available)

### Drivability rules (MVP)
- Cruise surge (trim oscillation)
- Throttle closure under demand (MG1 primary)

### Exports (Branded)
- Summary text includes Down Dirty 84 header + short disclaimer + full disclaimer at end
- CSV deterministic ordering

## Acceptance Criteria
- Endpoints respond per OpenAPI contracts and fixtures
- MVP enforcement blocks any diff path except `Airflow.MAF.Curve` multiplier curve points
- Branded summary/CSV filenames consistent with Down Dirty 84
