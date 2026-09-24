# Down Dirty 84 — AI Tuning

> **Status: production-ready.** The full pipeline runs — payment creates a job,
> the customer uploads a log, it is parsed, validated, checked against safety
> and drivability rules, and MAF suggestions are computed from wideband data.
> The owner releases; the customer gets a branded change list. No route serves
> a fixture.

## What runs without you

```
customer visits /buy ──▶ picks a service, says what the car is
Stripe checkout      ──▶ pays; card details never touch this app
payment webhook      ──▶ job created, receipt + sign-in link emailed
customer uploads log ──▶ parsed, validated, channel-mapped
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

## Before taking real work

Run the doctor. It does not check that a value is *present* — it checks that it
*works*, which is a different question and the one that matters:

```bash
cd backend && npm run doctor
```

```
✓ Database        PostgreSQL 16.13, all 5 core tables present.
✗ Email           Key works, but no verified sending domain (1 pending).
                  → Verify downdirty84llc.com in Resend → Domains.
!  Payments       Stripe is not configured.
```

It connects to Postgres and checks migrations ran, calls Resend and checks your
sending domain is verified, heads the S3 bucket with your credentials, and reads
your Stripe account. Read-only — nothing is created, charged or sent. Exits
non-zero on a blocking problem, so it works as a deploy gate.

It also distinguishes **"your credential is wrong"** from **"nothing reached the
provider"**, which look identical if you only read the status code — a proxy or
network policy can answer 403 to a request that never left your network. Being
told to revoke a working key is worse than being told nothing, so the check
names who actually answered before blaming a credential.

To prove delivery end to end — the one thing no API probe can tell you:

```bash
npm run doctor -- --send-test you@example.com
```

The only part of the doctor that is not read-only, which is why it is opt-in.

The two things it cannot do for you:

1. **`RESEND_API_KEY`** — sign-in is a magic link, so with no email transport
   nobody can log in, not a customer and not you. Sign up at resend.com, verify
   your sending domain, set the key and `EMAIL_FROM`.
2. **`S3_*`** — without it uploads go to local disk, which is wiped on every
   deploy.

The server refuses to start in production without either, on purpose. Neither
blocks development: without a key, sign-in links print to your terminal.

## Safety thresholds

Thresholds are per **profile**, chosen from the job's fuel and induction:

| Profile | Status |
| --- | --- |
| Naturally aspirated, gasoline | **Owner-confirmed** |
| Forced induction, gasoline | Starting values — reports say unconfirmed |
| Naturally aspirated, E85 | Starting values — reports say unconfirmed |
| Forced induction, E85 | Starting values — reports say unconfirmed |

One global set of numbers was wrong for this shop. A 0.8 AFR lean margin is a
reasonable NA-gasoline heuristic and a dangerous one on boost, and on E85 it
does not even mean the same thing — stoich is ~9.77 rather than ~14.7, so the
same AFR delta is half again as far lean:

```
0.8 AFR on gasoline  →  0.8 / 14.70 = 5.4% lean
0.8 AFR on E85       →  0.8 /  9.77 = 8.2% lean   ← much further out
```

**If a job does not record fuel and induction**, it is judged against the
strictest value across every profile and reported as unconfirmed. It is never
quietly judged by the confirmed profile — that would put a boosted E85 truck
under gasoline thresholds with your signature on it and no warning on the
report. There is a CI guardrail on exactly that.

To confirm another profile: write its values into `OWNER_OVERRIDES` in
`backend/src/config/thresholds.ts` and set its flag in
`OWNER_CONFIRMED_PROFILES`. Do both — a flag without values claims the starting
numbers were reviewed. See `docs/ANALYSIS-ENGINE.md`.

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
  Buy.tsx           /buy — the shop; prices read live from Stripe
  Paid.tsx          /paid — Stripe's return page, works signed-out
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
| `npm run doctor` | Check every service actually works, not just that a value is set |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests |
| `npm run test:e2e` | Full pipeline against a running API + Postgres |

### Dependencies

CI fails the build on any **high** advisory in production dependencies
(`npm audit --omit=dev --audit-level=high`), so an advisory published after a
green merge turns the next run red rather than sitting unnoticed.

`package.json` carries one override:

```json
"overrides": { "qs": "^6.16.0" }
```

Express 4.22.2 — the latest 4.x — still pins `qs@6.15.3`, which is the top of a
vulnerable range. The override lifts the whole tree to 6.16.0, a same-major
security release. The alternative was Express 5, a breaking upgrade on a live
payments path for two moderate advisories. Remove the override once Express 4
ships a build that pins 6.16.0 itself.

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
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | for billing | Webhook at `POST /api/v1/stripe/webhook`. See **Payments** below |

## Payments

Payments are classified by **Stripe price ID**, never by amount. Checked against
the live account, amount matching was wrong four separate ways:

| | |
| --- | --- |
| Priority Log Review is **$99**, the code matched **$79** | every purchase produced no job — customer paid, nothing happened |
| **$79** is really the Extra Revision add-on | buying a revision created a whole new job |
| **$99** is both Priority Log Review *and* Rush Fee | a rush fee alone created a Priority job |
| **$39** is both Log Review *and* a Georgia Opportunity Ledger tier | a newsletter subscriber got a tuning job, monthly |

Amounts change; price IDs do not. The catalogue lives in
`backend/src/config/stripe_catalog.ts`.

**All eight live prices are tagged** with `dd84_service` or `dd84_addon`
metadata, so Stripe is now the source of truth and a new product needs no
deploy — just the tag. The table in the repo stays as a fallback.

Because metadata *overrides* the table at runtime, a mistyped tag in the Stripe
dashboard silently changes what a payment creates: an add-on tagged
`dd84_service` starts making a job on every rush fee, and a service tagged
`dd84_addon` stops making them at all. Neither the code nor Stripe can notice
that alone, so `npm run doctor` compares the two and fails on any disagreement.
Untagged is only a warning — the table still covers it.

Three outcomes produce no job, and they are kept distinct because only one
needs you:

- **Add-on bought alone** — correct. A rush fee applies to work that exists.
  You get an email so you can apply it.
- **Another business line** — correct, and silent.
- **Unrecognised price** — a paid order with nobody queued to do it. You get an
  email immediately, because logs do not get read on a Sunday.

The shop is **`/buy`** — also the site root. Amounts are read live from Stripe
on every load (cached 5 minutes) and are **never committed to the repo**: a page
advertising a price Stripe will not charge is the same drift bug that broke the
webhook, aimed at customers. If Stripe cannot be reached the card says "price
shown at checkout" rather than inventing a number or rendering `null` as free.

### Which Stripe account

Price IDs are minted per account — an identical product on a different account
has entirely different ones. So a key for the wrong account does not classify
payments *badly*, it classifies **none of them**.

That is not hypothetical: there are now four Stripe accounts named
**"Down Dirty 84 llc"**. `EXPECTED_STRIPE_ACCOUNT` in `stripe_catalog.ts`
records which one the price IDs came from, and the server asks Stripe at boot
which account its key actually belongs to.

A mismatch — wrong account, or a test key with `NODE_ENV=production` — makes
`/ready` return 503, so the instance leaves the load balancer instead of
accepting webhooks it can do nothing with. `npm run doctor` reports the same
thing before you deploy at all.

Two states are deliberately *not* failures: **no key** (payments are simply
off) and **Stripe unreachable** (an outage must not cascade into this app
refusing all traffic). Neither is ever reported as OK.

Starting a payment: `POST /api/v1/checkout` with `{ service, addons?, vehicle?,
platform?, fuel?, induction? }`. **The client names a service, never a price** —
otherwise a browser could check out against any price on the account, including
the $1-minimum donation, and the webhook would create a full-price job for it.
`GET /api/v1/catalog` returns what is for sale so the frontend keeps no second
copy of the price list.

Fuel and induction collected at checkout flow onto the job, which is what
selects the safety-threshold profile.

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

## DD84 LINK Rev-A

Customer and tuner/admin simulation workflows are available at /dd84-link. See [local setup, safety limits and checks](products/dd84-link/README.md) and [the integrated API contract](products/dd84-link/docs/INTEGRATED_API.md). All ECU writes remain disabled; install/recovery operates on persisted simulation slots only.
