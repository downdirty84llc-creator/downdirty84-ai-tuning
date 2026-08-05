# Down Dirty 84 — AI Tuning MVP

> **Status:** the analysis pipeline is live. `POST /jobs/:id/analyze` reads the
> customer's uploaded log, parses it, validates it, runs the safety and
> drivability rules, and persists real findings. MAF suggestions are computed
> from wideband data. No route serves fixtures.
>
> It runs on **conservative default thresholds** that have not been confirmed
> against a specific platform. Every report says so via
> `R3_THRESHOLDS_UNCONFIRMED`, and a clean result under defaults is not a
> clearance. See `docs/ANALYSIS-ENGINE.md`.

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
docs/api/examples/  Fixtures the analyze stub serves
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
for f in migrations/*.sql; do psql -d dd84 -v ON_ERROR_STOP=1 -f "$f"; done
DATABASE_URL=postgresql://localhost/dd84 npm run dev     # http://localhost:8080

# Frontend (separate terminal, from the repo root)
npm i && npm run dev                                     # http://localhost:5173
```

## Backend scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Watch-mode API |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run the compiled server (what the Procfile uses) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests |

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

## The owner-release gate

A diffset is a **proposed** calibration change. Generating one leaves it in
`OWNER_REVIEW`, and both export paths return **403** until an admin releases it:

```bash
POST /api/v1/diffsets/:diffSetId/release   { "decision": "RELEASE", "note": "..." }
```

The decision records who and when, and is immutable — a second call returns 409.
Nothing reaches a customer without a named human accepting it.

## Fixtures
These must exist:
- docs/api/examples/validation.pass.gm_ls.json
- docs/api/examples/findings.gm_ls.sample.json
- docs/api/examples/diffset.gm_ls_maf.sample.json

## Quick test flow
1) Brand profile
```bash
curl http://localhost:8080/api/v1/brand/profile
```

2) Start analyze
```bash
curl -X POST http://localhost:8080/api/v1/jobs/11111111-1111-1111-1111-111111111111/analyze \
  -H "Content-Type: application/json" \
  -d '{"logUploadIds":["b7d6f00b-11cc-4cf5-b4f7-6d3c7d8343d8"]}'
```
Take runId from response.

3) Run status
```bash
curl http://localhost:8080/api/v1/runs/<runId>
```

4) Validation + Findings
```bash
curl "http://localhost:8080/api/v1/jobs/11111111-1111-1111-1111-111111111111/validation?runId=<runId>"
curl "http://localhost:8080/api/v1/jobs/11111111-1111-1111-1111-111111111111/findings?runId=<runId>"
```

5) Generate diffset
```bash
curl -X POST http://localhost:8080/api/v1/jobs/11111111-1111-1111-1111-111111111111/diffsets/generate \
  -H "Content-Type: application/json" \
  -d '{"runId":"<runId>","generator":"GM_LS_MAF_V1","options":{"mode":"AUTO"}}'
```
Take diffSetId from response.

6) Export summary + CSV
```bash
curl -X POST http://localhost:8080/api/v1/diffsets/<diffSetId>/export/summary \
  -H "Content-Type: application/json" -d '{}'

curl -X POST http://localhost:8080/api/v1/diffsets/<diffSetId>/export/csv \
  -H "Content-Type: application/json" -d '{"includeSuggested":false,"minConfidence":0.45}'
```


## Auth (Magic Link)
- Run migrations in `backend/migrations/` on your Postgres.
- In dev, magic links are printed to API logs.

Endpoints:
- POST /api/v1/auth/start { email }
- POST /api/v1/auth/verify { token }
- POST /api/v1/auth/logout
- GET /api/v1/me


## File storage (optional)
Set these env vars to store uploads in S3/R2:
- S3_BUCKET
- S3_ENDPOINT (R2 or S3 endpoint)
- S3_REGION (use `auto` for R2)
- S3_ACCESS_KEY_ID
- S3_SECRET_ACCESS_KEY

If not set, uploads store locally for development.


## Stripe webhook (optional automation)
Env vars:
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET
- ADMIN_EMAILS (comma-separated list of admin emails)

Webhook endpoint:
- POST /api/v1/stripe/webhook

Notes:
- MVP classifies services by amount/description.
