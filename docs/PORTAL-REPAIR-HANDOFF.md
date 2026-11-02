# Portal repair: code is not payment activation

## Implemented safeguards

- The catalogue explicitly reports whether a new checkout is available. Missing configuration no longer looks like a temporary price-fetch problem.
- Checkout requires both Stripe credentials plus verification of the catalogue's Stripe account and production mode. A secret key without the webhook signing secret must not create a payment session.
- A failed account lookup can retry after one minute; concurrent calls share the same bounded request. General health polling does not call Stripe.
- An expired price cache is not labelled live after a failed refresh.
- Customers can retry an availability check without losing entered vehicle details. Repeated clicks do not submit concurrent checkout requests.
- Profile confirmation requires the existing approval flag and explicit finite values for every field. This validates completeness only, not engineering safety. No numbers or approval flags are changed.

## Still required before accepting online payments

This code change does not configure or activate production payments. Complete the [settlement and isolated acceptance checklist](STRIPE-ACCEPTANCE.md) before enabling checkout.

1. Obtain explicit approval for the target account and secure credential configuration. The committed price IDs belong to Stripe account **`acct_1QBl8ZINLKqe1c6g`**; a similarly named account is not interchangeable. Verify that this is the intended tuning account rather than a Ledger account.
2. In the approved account, inspect the existing webhook endpoint before creating a duplicate. The application expects **`POST https://dd84-api.onrender.com/api/v1/stripe/webhook`**, receiving **`checkout.session.completed`**, **`checkout.session.async_payment_succeeded`** and **`checkout.session.async_payment_failed`** after the settlement handler repair is deployed. Verify the actual deployment hostname before changing anything. The endpoint-specific signing secret is distinct from an API key and from a local CLI forwarding secret.
3. After action-time approval, the owner should enter the matching live `STRIPE_SECRET_KEY` and endpoint `STRIPE_WEBHOOK_SECRET` directly into the **dd84-api** server's secure Render Environment settings (`srv-daqifo0473hc7389f9dg`, workspace `tea-d5ubn0qqcgvc739j2de0`). Never paste values into chat, source files, a PR or frontend variables. Do not rotate existing keys merely because this app is unconfigured.
4. A settings save may deploy. Approve the exact code merge/deployment and activation separately; preserve the Free plan and existing database/storage/email/security settings. Do not use `render.paid.yaml`.
5. After the approved deployment, inspect `/ready` for database/configuration health and `stripeAccount: OK`, and `/api/v1/catalog` for `checkout.enabled: true`. Run the read-only doctor in a trusted environment and verify actual service/add-on price IDs, metadata, currency and availability. A green readiness response does not prove the webhook endpoint is registered or that its secret matches.
6. Complete an authorized end-to-end payment-to-job, sign-in, upload, review and delivery acceptance test. Use an isolated nonproduction setup with matching test-account catalogue IDs and test webhook secret; the committed live price IDs are not automatically usable in test mode. Do not switch production to test mode or perform a live charge without separate explicit approval. Do not run destructive fixture scripts on the hosted database.

If setup is performed by the owner, confirm only that each value was saved and the deployment ID; do not return the values. If agent configuration is desired, obtain specific action-time permission for transferring those two credentials to that exact Render service through a supported secure tool. No such transfer is part of this repair.

Provider references: [Stripe webhook signature verification](https://docs.stripe.com/webhooks/signatures) and [Render environment-variable save/deploy options](https://render.com/docs/configure-environment-variables). The account, route and variable names above are this repository's actual contract, not inferred from a generic Stripe setup.

## Three profiles still need real validation

`BOOSTED_GAS`, `NA_E85` and `BOOSTED_E85` remain unconfirmed. Keep their current conservative starting values and the manual-release gate. For each profile, an appropriately qualified reviewer must supply approved values for all 10 safety, 6 drivability and 4 diff-generation fields, with the actual hardware/platform, fuel assumptions, sensor calibration/units, representative logs, acceptance criteria and review provenance. See [analysis-engine confirmation requirements](ANALYSIS-ENGINE.md).

Setting a flag to hide the warning, completing a form or passing synthetic tests is not calibration validation. No automatic tuning or ECU-writing enablement is included.
