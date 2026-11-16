# DD84 readiness verification, 2026-11-16

## Changes prepared, not deployed
- Magic-link redemption claims an unused/unexpired token and creates its user/session in one transaction. Concurrent callbacks cannot both redeem a token; session failure rolls back the claim.
- Suggestion generation is bound to the exact upload whose run was analyzed, and its owner/job. A client cannot apply a safe log's verdict to another log. Missing provenance fails closed.
- Neither change alters owner review, export release, profile confirmation, prices or payment enablement. The first two fixes need no migration; durable onboarding below adds migration009.

## Local verification
- 235 backend unit tests passed with `node --import tsx --test $(find src -name '*.test.ts')` (tsx CLI's IPC pipe is blocked in this environment).
- Backend typecheck/build passed; frontend production build passed.
- Both integration scripts parse. Real PostgreSQL regressions were added for eight concurrent magic-link redemptions, transactional rollback/retry, and mismatched generation source. These database-backed tests have NOT been run in this environment (no local PostgreSQL).
- No actual Stripe sandbox charge/webhook delivery, email delivery, production authenticated storage flow, or calibration validation was performed. Synthetic events are not provider acceptance.

## Deployment differential
Observed live Render commit a49543048e28406337ff34c683ed97b08864c8f6; source base d3b389a1089607740a10f7d37b782354273bde8c.
The intervening six merged PRs (#44, #46, #47, #48, #49, #50) change desktop/Studio frontend, docs and CI (38 files), not backend source or migrations. A release should explicitly review this differential rather than assume main equals production. This document and fixes remain local until reviewed.

## Remaining acceptance gates
1. Run disposable PostgreSQL integration and existing pipeline tests, then CI.
2. Confirm correct DD84 Stripe sandbox. Connected Merry Market sandbox is unrelated and was not used. Intended live catalog account is Down Dirty 84 llc / acct_1QBl8ZINLKqe1c6g. No DD84 endpoint is currently configured there; the disabled old Ledger endpoint must remain untouched.
3. Approve and securely provision appropriate payment credentials and webhook only after sandbox acceptance. Payments remain disabled. Never paste secret values into reports.
4. Verify authenticated customer login, actual email delivery, private upload/storage and end-to-end customer flow with synthetic data and appropriate approval.
5. Pre-release proposal exposure is now fixed locally: customer responses include status metadata only until RELEASED; configured admins retain full review. HTTP E2E assertions still await CI.
6. Durable onboarding intent is now stored with each new paid job via migration009. Signed Stripe retry processes pending intent; failed mail/link returns503 without duplicating the job. Minting uses the same locked transaction, avoiding nested-pool deadlock. No historical backfill or retro-email. Delivery is at-least-once: provider acceptance followed by DB commit failure can duplicate mail. Retry window is finite; no independent sweeper exists, so pending rows still need operator recovery after provider retries end.
7. BOOSTED_GAS, NA_E85 and BOOSTED_E85 profiles still require engineering confirmation. No production tune or ECU-write acceptance performed.

Database ACTIVE_HEALTHY and API readiness alone are not paid-launch approval. Free-tier inactivity remains a risk; no paid plan, artificial keepalive or account change was made.

## Additional environment evidence / safest release path
Browser checkout E2E could not run: downloaded browser archive invalid (automatic retry cancelled); installed Chromium launch failed socket EPERM. Package-manager inspection for local PostgreSQL was permission-blocked even after escalation. Neither gate was bypassed.

Persist to a non-main feature branch and open a review PR to trigger existing CI with PostgreSQL16 and Chromium. Require all integration/migration/browser checks to pass. Keep payments disabled and manual release intact. Review migration009 (new empty table only), deploy exact reviewed commit during an approved window, and verify /ready plus synthetic authenticated flow. Do not merge merely to obtain CI: main auto-deploys. Do not activate live Stripe until separately validated/approved configuration is available.
