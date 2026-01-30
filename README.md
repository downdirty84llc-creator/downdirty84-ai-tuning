# Down Dirty 84 — AI Tuning MVP Backend (Stub)

## Prereqs
- Node 18+

## Install
```bash
cd backend
npm i
```

## Run
```bash
npm run dev
```

Server: http://localhost:8080

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
