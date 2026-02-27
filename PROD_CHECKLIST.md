# Production Readiness Checklist

## 1) Environment
- Set `NODE_ENV=production`
- Set `DATABASE_URL` to a reachable Postgres instance
- Set `APP_BASE_URL` to public frontend URL
- Set `FRONTEND_ORIGIN` to exact frontend origin
- Set `ADMIN_EMAILS` (comma-separated)
- Configure magic-link email delivery:
  - Set `MAGICLINK_FROM_EMAIL`
  - Set either `SMTP_URL` or `SMTP_HOST` + `SMTP_PORT` (+ optional `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`)
- Set `MAGICLINK_TOKEN_TTL_MIN` and `SESSION_DAYS` to positive numbers
- Ensure `DEV_DEBUG_AUTH_START_TOKEN` is unset or `false`

## 2) Database
- Run migrations in order:
  - `001_auth.sql`
  - `002_jobs_uploads.sql`
  - `003_orders_admin.sql`
  - `004_runs.sql`
- Verify tables exist: `users`, `auth_tokens`, `sessions`, `jobs`, `uploads`, `orders`

## 3) Optional Integrations
- Stripe:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
- Object storage (S3/R2):
  - `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`

## 4) Runtime Verification
- Start API and check:
  - `GET /health` returns `{ ok: true }`
  - `GET /health/details` shows expected config flags
- Confirm no startup warnings for critical config

## 5) Security Verification
- Run ownership smoke test:
  - `npm run test:auth-boundary`
- Confirm intruder checks return `404` for protected resources

## 6) App Verification
- Frontend loads and can authenticate
- Customer flow succeeds: create job -> analyze -> validation/findings -> diffset -> exports
- Admin view works and runtime health card loads
- Upload/analyze constraints:
  - Upload at least one `LOG` file and one `TUNE` file on the same job
  - Confirm LOG-only analyze rejects `TUNE` upload IDs with `400 BAD_REQUEST`
  - Confirm LOG-only analyze accepts job-scoped `LOG` upload IDs and queues a run (`202`)

## 6.1) End-to-End Smoke Flow Verification (recommended)
- Start API with `DEV_DEBUG_AUTH_START_TOKEN=true` in a non-production environment only
- Run `./scripts/e2e-flow-smoke.ps1` (PowerShell)
- Confirm script output includes:
  - `tuneAnalyzeRejected: true`
  - `runStatus: SUCCEEDED`
  - `csvStatus: 200`

## 7) Pre-Launch Safeguards
- Ensure `DEV_DEBUG_AUTH_START_TOKEN` is disabled
- Ensure logs do not leak secrets
- Keep HTTPS enabled at edge/proxy
