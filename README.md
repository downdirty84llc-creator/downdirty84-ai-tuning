# Down Dirty 84 — AI Tuning

> **Status: production-ready.** The full pipeline runs — payment creates a job,
> the customer uploads a log, it is parsed, validated, checked against safety
> and drivability rules, and MAF suggestions are computed from wideband data.
> The owner releases; the customer gets a branded change list. No route serves
> a fixture.

## What runs without you

```
Stripe payment ──▶ job created automatically
customer upload ──▶ parsed, validated, channel-mapped
                └─▶ safety + drivability rules, evidence windows
                └─▶ MAF suggestions with per-bin confidence
                     │
                     ▼
        ┌────────────────────────────┐
        │  YOU: approve or reject     │  ← the only manual step
        │  GET /api/v1/admin/queue    │
        └────────────────────────────┘
                     │
                     ▼
        branded summary + CSV to the customer
```

Everything above and below that box is automated. The box is one decision per
job, with the change size, confidence, safety verdict and anything deserving a
second look already assembled — see **The one manual step** below.

## Two things to do before taking real work

1. **Confirm the safety thresholds.** The engine runs on conservative defaults
   biased toward over-flagging. Every report says `R3_THRESHOLDS_UNCONFIRMED`
   until you review them. Fill `OWNER_OVERRIDES` in
   `backend/src/config/thresholds.ts` and set `OWNER_CONFIRMED_THRESHOLDS`.
2. **Set `S3_*`.** Without it uploads go to local disk, which is wiped on every
   deploy. The server refuses to start in production without it, on purpose.

Neither blocks development. See `docs/ANALYSIS-ENGINE.md`.

## Layout

```
backend/          API — Express + Postgres
  src/
    routes/       HTTP layer
    middleware/   session + admin
    services/     auth, jobs, uploads, admin, analyze, brand, diffgen, render
    util/
  migrations/     numbered SQL, applied in order
src/              Frontend — React + Vite
docs/api/examples/  Sample payloads kept as contract documentation
openapi.yaml      API contract
```

## Prereqs
- Node 18+
- Postgres 14+ (needs `pgcrypto` and `citext`)

## Install and run

```bash
# API
cd backend && npm i
createdb dd84
DATABASE_URL=postgresql://localhost/dd84 npm run migrate
DATABASE_URL=postgresql://localhost/dd84 npm run dev     # http://localhost:8080

# Frontend (separate terminal, from the repo root)
npm i && npm run dev                                     # http://localhost:5173
```

## Backend scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Watch-mode API |
| `npm run build` | Compile to `dist/` |
| `npm start` | Migrate, then run the compiled server (what deploys use) |
| `npm run migrate` | Apply pending migrations; idempotent, safe on every deploy |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests |
| `npm run test:e2e` | Full pipeline against a running API + Postgres |

## Environment

| Var | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string |
| `ADMIN_EMAILS` | for admin + release | Comma-separated. Deliberately env-only, so admin rights cannot be granted by anything the app can write to |
| `APP_BASE_URL` | for magic links | Base URL used in the emailed link |
| `FRONTEND_ORIGIN` | for CORS | Origin allowed to send credentialed requests |
| `SESSION_DAYS` | no | Session lifetime, default 14 |
| `MAGICLINK_TOKEN_TTL_MIN` | no | Magic-link TTL, default 15 |
| `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | for durable uploads | Without these, uploads fall back to local disk — **ephemeral on Render/Heroku** |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | for billing | Webhook at `POST /api/v1/stripe/webhook` |

## The one manual step

A calibration change is a proposal until a person accepts it. That gate is not
removable — it is what stands between a wrong multiplier and a customer's
engine, and your own operating spec requires it ("AI may not independently
release a calibration").

What *is* removable is the work around the decision, and it has been. One call
returns everything waiting on you, with the decision pre-assembled:

```bash
GET /api/v1/admin/queue
```

```json
{
  "counts": { "awaitingRelease": 3, "oldestWaitingHours": 2.4, "failedRuns24h": 0 },
  "items": [{
    "customerEmail": "...", "vehicle": "2008 2500 6.0", "waitingHours": 2.4,
    "summary": { "itemCount": 6, "largestChangePct": 5.2, "lowestConfidence": 0.71 },
    "safety":  { "blockers": 0, "warnings": 0, "thresholdsConfirmed": false },
    "attention": ["Analysed against unconfirmed default thresholds"]
  }]
}
```

Then one call to decide:

```bash
POST /api/v1/diffsets/:id/release   { "decision": "RELEASE", "note": "reviewed" }
```

Immutable once made, records who and when, 409 on a repeat. Reject with
`"decision": "REJECT"`.

**Nothing else needs you.** Payment, job creation, file intake, parsing,
validation, safety checks, the MAF math, export and delivery all run on their
own. Approving is seconds per job.

---

## Deploy

`render.yaml` provisions the API, the static frontend and Postgres in one step.
Copy `.env.example`, fill it in, and push — `npm start` runs migrations before
serving, and the runner is idempotent.

Health endpoints: `/health` for liveness (touches nothing else, so a database
blip cannot get a healthy process killed) and `/ready` for readiness (checks
Postgres and configuration, so a misconfigured instance is pulled from the load
balancer rather than returning errors to customers).
