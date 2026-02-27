# Down Dirty 84 — AI Tuning MVP Backend (Stub)

Production deployment checklist: see `PROD_CHECKLIST.md`.
Release notes: see `RELEASE_NOTES.md`.

## Recent changes (2026-02-27)
- Upload handling: client now preserves proper multipart behavior for `FormData` uploads (no forced JSON content type).
- Job dashboard UX:
  - Added upload kind selector (`LOG`/`TUNE`) during upload.
  - Added upload selection checkboxes, select/clear all toggle, and selected count.
  - Analyze now uses selected `LOG` uploads only; non-`LOG` files are visually marked and not selectable for analyze.
- Backend enforcement:
  - `POST /api/v1/jobs/:jobId/analyze` now validates `logUploadIds` as job-scoped, user-owned `LOG` uploads (LOG-only analyze).
- Smoke tests:
  - `scripts/e2e-flow-smoke.ps1` now uploads `LOG` + `TUNE`, asserts `TUNE` analyze rejection (`400`), and verifies `LOG` analyze success.
- Docs/contracts:
  - Quick flow and OpenAPI descriptions updated to reflect real upload-first flow and `LOG`-only analyze constraints.

## Prereqs
- Node 18+

## Install
```bash
npm i
```

## Environment
- Copy `.env.example` to `.env` and fill values for your environment.

## Run
```bash
npm run dev
```

Backend API only:
```bash
npm run api:dev
```

Build + start compiled backend:
```bash
npm run api:build
npm run api:start
```

Server: http://localhost:8080

Health endpoints:
- `GET /health` basic liveness
- `GET /health/details` liveness + safe runtime config flags (no secrets)

## Fixtures
These must exist:
- validation.pass.gm_ls.json
- findings.gm_ls.sample.json
- diffset.gm_ls_maf.sample.json

## Quick test flow
1) Brand profile
```bash
curl http://localhost:8080/api/v1/brand/profile
```

2) Upload at least one LOG file for the job
```bash
curl -X POST http://localhost:8080/api/v1/uploads \
  -F "jobId=11111111-1111-1111-1111-111111111111" \
  -F "kind=LOG" \
  -F "file=@validation.pass.gm_ls.json"
```
Take `uploadId` from response.

3) Start analyze
```bash
curl -X POST http://localhost:8080/api/v1/jobs/11111111-1111-1111-1111-111111111111/analyze \
  -H "Content-Type: application/json" \
  -d '{"logUploadIds":["<uploadId-from-LOG-upload>"]}'
```
Take runId from response.

4) Run status
```bash
curl http://localhost:8080/api/v1/runs/<runId>
```

5) Validation + Findings
```bash
curl "http://localhost:8080/api/v1/jobs/11111111-1111-1111-1111-111111111111/validation?runId=<runId>"
curl "http://localhost:8080/api/v1/jobs/11111111-1111-1111-1111-111111111111/findings?runId=<runId>"
```

6) Generate diffset
```bash
curl -X POST http://localhost:8080/api/v1/jobs/11111111-1111-1111-1111-111111111111/diffsets/generate \
  -H "Content-Type: application/json" \
  -d '{"runId":"<runId>","generator":"GM_LS_MAF_V1","options":{"mode":"AUTO"}}'
```
Take diffSetId from response.

7) Export summary + CSV
```bash
curl -X POST http://localhost:8080/api/v1/diffsets/<diffSetId>/export/summary \
  -H "Content-Type: application/json" -d '{}'

curl -X POST http://localhost:8080/api/v1/diffsets/<diffSetId>/export/csv \
  -H "Content-Type: application/json" -d '{"includeSuggested":false,"minConfidence":0.45}'
```


## Auth (Magic Link)
- Run migrations in this repo root in order: `001_auth.sql`, `002_jobs_uploads.sql`, `003_orders_admin.sql`, `004_runs.sql`.
- In dev, if SMTP is not configured, magic links are printed to API logs.
- In production, configure SMTP plus `MAGICLINK_FROM_EMAIL` for email delivery.
- SMTP config options:
  - `SMTP_URL` (single connection string), or
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`
- `debugToken` is returned by `/api/v1/auth/start` only when `DEV_DEBUG_AUTH_START_TOKEN=true` (non-production only).

Startup config warnings:
- API now logs non-fatal warnings if critical auth/security env vars are missing or risky.
- Set `APP_BASE_URL` and `FRONTEND_ORIGIN` in production.
- Ensure `MAGICLINK_TOKEN_TTL_MIN` and `SESSION_DAYS` are positive numbers.

Endpoints:
- POST /api/v1/auth/start { email }
- POST /api/v1/auth/verify { token }
- POST /api/v1/auth/logout
- GET /api/v1/me

Local end-to-end smoke helper note:
- `scripts/e2e-flow-smoke.ps1` expects `DEV_DEBUG_AUTH_START_TOKEN=true` on the backend process.
- It verifies both cases: `TUNE` upload ID is rejected by analyze (`400`), and `LOG` upload ID succeeds.

Run e2e flow smoke (Windows PowerShell):
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
./scripts/e2e-flow-smoke.ps1
```


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

## Auth boundary smoke test
Use this to verify ownership enforcement for runs/diffsets/exports with two sessions.

Required env vars:
- OWNER_COOKIE (cookie header value for resource owner session)
- INTRUDER_COOKIE (cookie header value for different user session)
- OWNER_RUN_ID
- OWNER_DIFFSET_ID

Optional:
- BASE_URL (default: http://localhost:8080)
- OWNER_JOB_ID (enables additional checks for /jobs/:jobId/runs, /jobs/:jobId/diffsets, /jobs/:jobId/validation, /jobs/:jobId/findings)

Run:
```bash
npm run test:auth-boundary
```

PowerShell helper (Windows):
```powershell
./scripts/run-auth-boundary-smoke.ps1 `
  -OwnerCookie "dd84_session=..." `
  -IntruderCookie "dd84_session=..." `
  -OwnerRunId "<run-id>" `
  -OwnerDiffSetId "<diffset-id>" `
  -OwnerJobId "<job-id>" `
  -BaseUrl "http://localhost:8080"
```
