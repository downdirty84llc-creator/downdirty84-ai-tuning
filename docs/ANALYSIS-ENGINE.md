# Analysis Engine — Scope and Design

The analysis engine is the product. Everything else in this repo exists to get a
log into it and a reviewed result out of it.

Today `POST /jobs/:id/analyze` walks a run through its states on a timer and
serves fixture JSON. This document is the plan for replacing that, and a record
of what is deliberately not decided yet.

---

## Pipeline

```
uploaded log file
      │
      ▼
┌─────────────────┐   vendor CSV → rows + header/unit detection
│ 1. parse        │   HP Tuners, Holley
└────────┬────────┘
         ▼
┌─────────────────┐   vendor column names → canonical channels
│ 2. map channels │   "SAE.RPM" / "RPM" / "Engine Speed" → rpm
└────────┬────────┘
         ▼
┌─────────────────┐   required present? WB usable? platform detected?
│ 3. validate     │   → Validation  (PASS / FAIL + next-log plan)
└────────┬────────┘
         ▼
┌─────────────────┐   safety + drivability rules over windows
│ 4. rules        │   → Findings  (BLOCKER / WARN / INFO + evidence)
└────────┬────────┘
         ▼
┌─────────────────┐   GM LS only, MAF curve only
│ 5. diffgen      │   → DiffSet  (proposed multipliers, OWNER_REVIEW)
└────────┬────────┘
         ▼
   owner release gate ── already built ──▶ export
```

Stages 1–2 are mechanical. Stage 3 is bookkeeping. **Stages 4 and 5 carry
safety weight** and are where the thresholds below matter.

---

## Canonical channels

Rules never reference a vendor column name. They reference a canonical channel,
and the mapping layer resolves vendor names onto it. Adding support for a new
toolchain or a renamed column is then a registry entry, not a code change.

| Canonical | Meaning | Required for |
| --- | --- | --- |
| `t` | seconds from log start | everything |
| `rpm` | engine speed | everything |
| `tps` | throttle position % | load context |
| `map` | manifold pressure | load context |
| `maf_hz` | MAF frequency | MAF diffgen |
| `maf_gs` | MAF airflow g/s | MAF diffgen |
| `afr_wb` | wideband AFR (or lambda) | lean detection, MAF diffgen |
| `afr_cmd` | commanded AFR | lean detection, MAF diffgen |
| `stft_b1`, `stft_b2` | short-term fuel trim % | surge, MAF diffgen |
| `ltft_b1`, `ltft_b2` | long-term fuel trim % | MAF diffgen |
| `kr` | knock retard ° | knock |
| `ect` | coolant temp | overtemp, warmup gating |
| `iat` | intake air temp | overtemp |
| `fuel_press` | fuel pressure | fuel delivery |
| `inj_duty` | injector duty % | fuel delivery |

Optional channels missing → `R0_MISSING_CHANNELS` INFO finding, analysis
continues at reduced confidence. Required channels missing → validation FAIL
with a next-log plan naming exactly what to add.

---

## Rules (from the PRD)

**Safety** — any one of these is a `BLOCKER`, and a blocker suppresses diffgen.

| Code | Rule |
| --- | --- |
| `S1_LEAN_UNDER_LOAD` | Wideband leaner than commanded, under load, sustained |
| `S2_EXCESSIVE_KR` | Knock retard beyond threshold, sustained or repeated |
| `S3_OVERTEMP` | ECT or IAT beyond threshold |
| `S4_FUEL_PRESSURE_DROP` | Fuel pressure falling under demand (when channel present) |

**Drivability** — `WARN`.

| Code | Rule |
| --- | --- |
| `D1_CRUISE_SURGE` | Fuel trim oscillation during steady cruise |
| `D2_THROTTLE_CLOSURE` | Throttle closing against driver demand |

**Readiness** — `INFO`.

| Code | Rule |
| --- | --- |
| `R0_MISSING_CHANNELS` | Optional channels absent |

Every finding carries evidence ranges `[startSec, endSec]` so the UI can point
at the exact window, plus the stats that triggered it. A finding with no
evidence window is a bug, not a finding.

---

## Two things this engine will not do

**It will not treat a default as a decision.** The engine runs on
`CONSERVATIVE_DEFAULTS` (`backend/src/config/thresholds.defaults.ts`) so the
pipeline is usable today, but every run made against them emits
`R3_THRESHOLDS_UNCONFIRMED`, and that flag rides along into the findings, the
run record, and the exported summary. A clean report under defaults is not a
clearance, and it says so.

The defaults are deliberately **biased toward over-flagging**. The two failure
modes are not symmetric: too sensitive means a false blocker and a mildly
annoyed owner; too permissive means a real lean event passing as clean. Expect
false positives — that is the trade being made on purpose.

To confirm them: fill `OWNER_OVERRIDES` in `thresholds.ts` and set
`OWNER_CONFIRMED_THRESHOLDS = true`. Do both; the flag alone just asserts that
unreviewed defaults were reviewed.

A threshold that is genuinely `null` still skips its rule rather than passing
it, emits `R1_THRESHOLD_UNSET`, and still blocks diffgen — an unevaluated
safety check is never a pass.

There is a deliberate distinction between two ways a rule can fail to run:

| Situation | Counts as unevaluated? | Blocks diffgen? |
| --- | --- | --- |
| Threshold unset | Yes | Yes |
| Required channel missing (e.g. wideband for S1) | Yes | Yes |
| Genuinely optional channel missing (fuel pressure, S4) | No | No |

The middle row is the one that matters. A log with no wideband has not been
*cleared* for fueling — it has merely not been *checked*, and those must never
collapse into the same answer. Only S4 is marked `dataOptional`, because the
PRD scopes it "if channel available".

This is the same pattern as the price book: a plausible-looking invented value
that survives into production is the failure mode worth designing against. A
wrong lean-under-load threshold does not produce a slightly-off report; it
passes a dangerous condition silently.

**It will not release anything.** Diffgen produces a proposal in
`OWNER_REVIEW`. The existing owner-release gate is unchanged.

---

## What is needed to finish

Two inputs, both of which are yours to supply:

### 1. Real log samples

The channel registry is seeded with the column names HP Tuners and Holley
*typically* emit, but seeded from documentation rather than from a file that
came off a real car. One real HPT export and one real Holley export would
confirm or correct the aliases in one pass. Until then, unmapped columns are
reported by name in validation rather than silently dropped, so a mismatch is
visible immediately instead of becoming a wrong finding.

### 2. Threshold confirmation

The engine runs today on conservative defaults, so nothing is blocked — but
every report says they are unconfirmed until you review them. These are
engineering judgment about your platforms, your fuel, and your customers'
hardware, and they are safety-critical:

| Threshold | Question |
| --- | --- |
| `leanAfrDelta` | How far leaner than commanded, for how long, above what load, before it is a blocker? |
| `krDegrees` | How much knock retard, sustained how long, is excessive? |
| `ectMaxC` / `iatMaxC` | Overtemp limits |
| `fuelPressDropPct` | What drop under demand indicates a delivery problem? |
| `surgeStftP2P` | Trim peak-to-peak during cruise that counts as surge |
| `mafMaxStepPct` | Maximum adjacent-bin change in a MAF correction |
| `mafMaxTotalPct` | Maximum single-pass correction before it needs a human |

Current default values are in `thresholds.defaults.ts`, each with a note on why
it sits where it does. Confirming them removes the `R3_THRESHOLDS_UNCONFIRMED`
finding from every report.

---

## Status

| Stage | State |
| --- | --- |
| 1. Parse | Built, tested |
| 2. Channel mapping | Built, tested — aliases need confirming against a real log |
| 3. Validate | Built, tested |
| 4. Rules framework | Built, tested |
| 4. `S1`–`S4`, `D1` | Built, tested — inert until thresholds are set |
| 4. `D2_THROTTLE_CLOSURE` | Reports not-applicable: needs pedal and throttle as *separate* channels, which the registry cannot yet distinguish |
| 4. `R0`, `R1`, `R2` | Built, tested |
| 5. MAF diffgen | Built, tested — recovers a known injected error to within 1% |
| Wiring into `analyze` | **Live.** The route reads the customer's upload, parses, validates, runs rules, and persists real output |
| Wiring into `diffsets/generate` | **Live.** Re-reads the log and generates real suggestions, refused unless the run recorded a safe verdict |

Fixtures are no longer served by any route. They remain in `docs/api/examples/`
as contract documentation.

## Verified end to end

Against live Postgres, through the HTTP API, with a real multipart upload:

| Scenario | Result |
| --- | --- |
| Clean log, 4% MAF error injected | Analysed, suggestions came back at 1.0403 ± 0.015, released, exported |
| Log with a sustained lean event | `S1_LEAN_UNDER_LOAD` BLOCKER, evidence window `[20, 31.9]`, diffgen refused 403, nothing persisted |
| Unparseable upload | Run reaches `FAILED` with `LOG_PARSE_FAILED`, not stuck in `RUNNING` |
