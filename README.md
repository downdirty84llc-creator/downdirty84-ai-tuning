# Down Dirty 84 — AI Tuning

> **Status: production-ready.** The full pipeline runs — payment creates a job,
> the customer uploads a log, it is parsed, validated, checked against safety
> and drivability rules, and MAF suggestions are computed from wideband data.
> The owner releases; the customer gets a branded change list. No route serves
> a fixture.

## What runs without you

```
customer signs in ──▶ magic link emailed automatically
Stripe payment   ──▶ job created automatically
customer upload  ──▶ parsed, validated, channel-mapped
                 └─▶ safety + drivability rules, evidence windows
                 └─▶ MAF suggestions with per-bin confidence
                 └─▶ you are emailed that it is waiting, with the numbers
                      │
                      ▼
        ┌─────────────────────────────┐
        │  YOU: approve or reject      │  ← the only manual step
        │  GET /api/v1/admin/queue     │
        └─────────────────────────────┘
                      │
                      ▼
   customer emailed automatically; branded summary + CSV on their page
```

Everything above and below that box is automated. The box is one decision per
job, with the change size, confidence, safety verdict and anything deserving a
second look already assembled — see **The one manual step** below.

## Three things to do before taking real work

1. **Confirm the safety thresholds.** The engine runs on conservative defaults
   biased toward over-flagging. Every report says `R3_THRESHOLDS_UNCONFIRMED`
   until you review them. Fill `OWNER_OVERRIDES` in
   `backend/src/config/thresholds.ts` and set `OWNER_CONFIRMED_THRESHOLDS`.
2. **Set `RESEND_API_KEY`.** Sign-in is a magic link, so with no email
   transport nobody can log in — not a customer, not you. Sign up at
   resend.com, verify your sending domain, set the key and `EMAIL_FROM`.
3. **Set `S3_*`.** Without it uploads go to local disk, which is wiped on every
   deploy.

The server refuses to start in production without 2 or 3, on purpose. None of
them block development: without a key, sign-in links print to your terminal.
See `docs/ANALYSIS-ENGINE.md`.

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
  ReviewQueue.tsx   /admin/queue — the owner's one decision
  DiffSetView.tsx   /diffsets/:id — what the customer's email opens
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
| `RESEND_API_KEY` | yes in production | Sends magic links and "your change list is ready". Without it nobody can sign in; the server refuses to start |
| `EMAIL_FROM` | no | Sender, default `Down Dirty 84 <noreply@downdirty84llc.com>`. Must be on a domain verified with your provider |
| `SESSION_DAYS` | no | Session lifetime, default 14 |
| `MAGICLINK_TOKEN_TTL_MIN` | no | Magic-link TTL, default 15 |
| `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | for durable uploads | Without these, uploads fall back to local disk — **ephemeral on Render/Heroku** |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | for billing | Webhook at `POST /api/v1/stripe/webhook` |

## The one manual step

A calibration change is a proposal until a person accepts it. That gate is not
removable — it is what stands between a wrong multiplier and a customer's
engine, and your own operating spec requires it ("AI may not independently
release a calibration").

What *is* removable is the work around the decision, and it has been.

**In the app:** `/admin/queue` — one card per waiting job showing the change
size, lowest confidence, safety verdict and anything worth a second look, with
Release and Reject on the card. This is the screen the "waiting for release"
email links to, and it is the only screen you need to run the business.

**Or over the API**, if you would rather script it. One call returns everything
waiting on you, with the decision pre-assembled:

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

The response includes `customerNotified`. `true` means the customer has already
been emailed and there is nothing left to do; `false` means the release stands
but the email did not go out and you need to follow up. It is `null` on a
rejection, where no message was meant to be sent — a check that did not run
must never read as a check that passed.

**Nothing else needs you.** Sign-in emails, payment, job creation, file intake,
parsing, validation, safety checks, the MAF math, the "it's ready" email,
export and delivery all run on their own. You are emailed when something is
waiting, with the change size, confidence and safety verdict in the message —
most jobs can be decided from a phone. Approving is seconds per job.

---

## Deploy

`render.yaml` provisions the API, the static frontend and Postgres in one step.
Copy `.env.example`, fill it in, and push — `npm start` runs migrations before
serving, and the runner is idempotent.

Health endpoints: `/health` for liveness (touches nothing else, so a database
blip cannot get a healthy process killed) and `/ready` for readiness (checks
Postgres and configuration, so a misconfigured instance is pulled from the load
balancer rather than returning errors to customers).
