# Free deployment: Render + Supabase + Resend

The default `render.yaml` uses a Free Render API and static frontend, with an external PostgreSQL database. It creates no paid Render database. `render.paid.yaml` preserves the previous paid configuration as an explicit alternative. Do not apply that alternative for a zero-cost deployment.

## Prepare Supabase Free

1. Create a dedicated Free project. Disable its Data API in project settings before applying app migrations: this application uses Express authorization and direct PostgreSQL, not public PostgREST access. Do not expose the application's public-schema tables to anonymous or authenticated Supabase clients.
2. Copy the **session pooler** connection string (port 5432), which supports IPv4 and session-level advisory locks used by migrations. Do not use the transaction pooler on port 6543. URL-encode the database password. Configure TLS with certificate verification using Supabase's documented CA/connection settings; do not disable verification to resolve connection failures.
3. Create a **private** `dd84-uploads` Storage bucket. Enable S3 access and obtain server-only S3 credentials. These credentials bypass Storage RLS; keep them exclusively in the API environment, never in frontend variables.
4. Set `S3_ENDPOINT` to the S3 endpoint shown by Supabase, including `/storage/v1/s3`, and `S3_REGION` to the project's actual region. The application and doctor use path-style S3 addressing.

## Prepare Resend Free

Use a verified sending domain you already control, and configure its DNS records. Set `RESEND_API_KEY` and `EMAIL_FROM`. Domain purchase is not included in free hosting. Resend's test sender is not a substitute for customer sign-in delivery. Keep payment integration disabled until its existing account verification passes; Stripe transaction processing is not free hosting.

## Deploy the default Render blueprint

Select this repository and `main`, using `render.yaml`. Confirm the API plan is **Free** and no paid database is in the plan. Free-tier quotas and provider terms can change; do not enable paid upgrades or enter billing information to proceed without the owner's approval.

Set API environment values:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Supabase session pooler connection string with verified TLS |
| `ADMIN_EMAILS` | Owner-approved admin email addresses |
| `APP_BASE_URL`, `FRONTEND_ORIGIN` | Actual frontend HTTPS origin |
| `RESEND_API_KEY`, `EMAIL_FROM` | Verified Resend sender configuration |
| `S3_BUCKET` | Private bucket name |
| `S3_ENDPOINT`, `S3_REGION` | Values from Supabase S3 settings |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Server-only Supabase S3 credentials |
| `DD84_LINK_DEVICE_KEY` | Stable 64-character hexadecimal encryption key |
| `DD84_LINK_SIGNING_PRIVATE_KEY` | Stable Ed25519 PKCS8 private PEM, escaped newlines accepted |

Generate LINK keys once with `node products/dd84-link/scripts/generate-keys.mjs` in a private terminal; save them directly into the API's secret settings and a secure backup. Never commit them. Keep them stable across deployments.

Keep frontend `VITE_API_BASE_URL` empty and rebuild so browser requests use the frontend origin. The `/api/*` rewrite must precede the SPA fallback and target the actual API HTTPS hostname (the supplied blueprint uses `dd84-api.onrender.com`). Update that rewrite if Render assigns another hostname. Separate `onrender.com` hosts are cross-site: calling the API directly prevents the `HttpOnly; Secure; SameSite=Lax` session from persisting. Do not relax cookie security to work around this. If service URLs are assigned only after creation, update the API origin settings and rewrite destination before accepting users. `npm start` applies all pending migrations before serving.

For Supabase certificate-chain errors, download the CA linked from the project's Database Settings, save it as a Render secret file named `supabase-ca.crt`, and set `NODE_EXTRA_CA_CERTS=/etc/secrets/supabase-ca.crt`. Retain `sslmode=verify-full` in the database URL. This trusts the provider CA without disabling TLS verification.

## Verify before use

- Check deployment logs for successful migrations and startup, then `/health` and `/ready`.
- Run the read-only `npm run doctor` against the deployment configuration from a trusted environment. Do not run destructive end-to-end fixtures on the hosted database.
- Verify sign-in email delivery, admin authorization, private upload/read, and the DD84 LINK simulation workflow. Confirm unsafe conditions reject install and recovery preserves known-good state.
- All real ECU writes remain disabled. Free hosting does not change those gates.

## Limits

Render Free services sleep after inactivity and have usage quotas. Supabase Free has database/storage quotas and may pause inactive projects; maintain backups. Resend Free has daily/monthly sending limits. This is suitable for testing and light usage, not an always-available service guarantee. No keep-alive traffic is configured to evade provider limits.

References: [Render Free](https://render.com/docs/free), [Supabase plans](https://supabase.com/pricing), [database connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [S3 credentials](https://supabase.com/docs/guides/storage/s3/authentication), [Resend plans](https://resend.com/pricing).
