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

**It will not guess a threshold.** Safety thresholds live in
`backend/src/config/thresholds.ts` and ship **unset**. A rule whose threshold is
unset does not silently pass — it emits an `R1_THRESHOLD_UNSET` INFO finding and
is skipped, and diffgen refuses to run while any safety rule is unevaluated.

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

### 2. Threshold values

These are engineering judgment about your platforms, your fuel, and your
customers' hardware — and they are safety-critical:

| Threshold | Question |
| --- | --- |
| `leanAfrDelta` | How far leaner than commanded, for how long, above what load, before it is a blocker? |
| `krDegrees` | How much knock retard, sustained how long, is excessive? |
| `ectMaxC` / `iatMaxC` | Overtemp limits |
| `fuelPressDropPct` | What drop under demand indicates a delivery problem? |
| `surgeStftP2P` | Trim peak-to-peak during cruise that counts as surge |
| `mafMaxStepPct` | Maximum adjacent-bin change in a MAF correction |
| `mafMaxTotalPct` | Maximum single-pass correction before it needs a human |

Fill `thresholds.ts` and every rule turns on. Nothing else is blocked on this —
parsing, mapping, validation, evidence windows and the MAF math all work and are
tested without it.

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
| Wiring into `analyze` | Not yet — the route still serves fixtures |

The last row is deliberate: the engine is proven by its own tests first, and
swapped in behind the route once the thresholds are real. Flipping it on is a
one-line change in `jobs.routes.ts`.
