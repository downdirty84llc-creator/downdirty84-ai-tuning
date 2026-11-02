# Stripe settlement and activation checklist

Code tests, a healthy API, and configured credentials are different milestones.
Do not turn on live checkout until the settlement repair, isolated acceptance
tests and explicit payment-activation approval are complete.

## Fulfillment contract

- Verify the signature against the raw request body before processing an event.
- Treat `checkout.session.completed` and
  `checkout.session.async_payment_succeeded` as notifications to inspect the
  current session, not proof that money settled. A payment-mode session must be
  complete and paid, and match the configured account and mode.
- Unpaid, failed, unsupported and mismatched events must not create orders,
  tuning jobs, sign-in tokens or payment-received emails. A delayed failure must
  not undo an already settled order.
- Retrieve every line item before classification. Preserve service/add-on and
  non-tuning business separation; never classify by amount alone.
- The database's unique session constraint and transaction protect **one order
  and at most one tuning job per Checkout Session**, including concurrent
  deliveries with different event IDs. A rolled-back attempt can be retried.
- Notification delivery remains a separate post-commit operation. This is not
  an exactly-once email or durable notification-queue guarantee. Reconcile a
  paid order with missing customer communication rather than generating a
  second order or job.

## Before deploying the session uniqueness migration

Use a read-only aggregate query against the intended database to count duplicate
`orders.stripe_session_id` values. The migration deliberately refuses to guess
which historical row is valid. If duplicates exist, stop and obtain a reviewed
reconciliation plan. Never delete orders or jobs just to make migration pass.
The migration runner must also pass on a fresh database and an idempotent rerun.

## Isolated acceptance, not production fixtures

Prefer a separate Stripe sandbox. First inspect existing sandbox resources;
creating a sandbox, credentials or webhook is a distinct authorized action.
Use a disposable local database, isolated uploads, and a mail capture transport.
Never use the hosted production database or send customer mail from a test.

The committed catalog contains live account-specific price IDs. Merely changing
the API key to a test key is not a complete test configuration. An isolated test
build must use an explicitly recorded sandbox account and matching test prices
for the four services and four add-ons. Keep that mapping out of the production
build; do not disable the account/mode guard to force a test through. A local
CLI forwarding secret is not the deployed endpoint's signing secret.

Acceptance evidence should cover:

1. Paid hosted checkout creates exactly one correctly classified order/job.
2. Delayed payment completion while unpaid creates nothing; later success
   creates the job once; delayed failure creates nothing.
3. Repeated and out-of-order notifications, including different event IDs for
   one session, create no duplicate job. Concurrent delivery and a transaction
   rollback followed by retry preserve the same invariant.
4. Invalid signatures, mismatched modes, incomplete/unknown payment states,
   unsupported session types and provider lookup failures create nothing.
5. Service plus add-ons is one job; add-on-only and other-business purchases are
   not new tuning jobs. Pagination cannot hide a later line item.
6. Checkout cancel/Back, failed availability refresh and repeat clicks are safe.
7. Captured sign-in mail, upload, owner-only review and delivery work without
   relaxing the manual-release or unconfirmed-profile gates.

Record which checks used a synthetic provider and which used real Stripe test
objects. Local/CI mocks are not evidence of a registered endpoint, matching
signing secret or actual provider delivery. Do not perform a live charge for
verification without separate explicit authorization.

## Secure production handoff

After access is restored, inspect the intended account, price objects and
existing endpoint before proposing mutations. Do not touch unrelated business
products or create a duplicate endpoint. The repaired endpoint needs
`checkout.session.completed`, `checkout.session.async_payment_succeeded` and
`checkout.session.async_payment_failed`; verify event API-version compatibility
with the deployed handler rather than upgrading blindly.

Prefer a dedicated restricted API key with only the permissions proven necessary
in the sandbox: account identity, prices/products and Checkout Session/line-item
reads, plus Checkout Session creation. Verify provider permission labels and
dependencies; do not request broad access by default or rotate another app's key.

Creating a persistent key, altering an endpoint, transferring credentials, and
deploying/activating live checkout each require the appropriate exact approval.
The owner should enter the API credential and endpoint signing secret directly
into the approved backend's secure settings. Never put them in chat, a PR,
source code, frontend variables or logs. A settings save/deploy can enable live
checkout immediately, so do not do it before the acceptance gates above.

The existing [portal handoff](PORTAL-REPAIR-HANDOFF.md) identifies the intended
production account and service. Tuning thresholds still require genuine
engineering validation; payment setup does not confirm them.

References: [Stripe fulfillment](https://docs.stripe.com/checkout/fulfillment),
[webhook signatures](https://docs.stripe.com/webhooks/signatures), and
[restricted keys](https://docs.stripe.com/keys#manage-your-api-keys).
