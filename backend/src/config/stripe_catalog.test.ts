import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyCheckout,
  SERVICE_PRICES,
  ADDON_PRICES,
  type CheckoutLine
} from "./stripe_catalog.js";

function line(over: Partial<CheckoutLine> = {}): CheckoutLine {
  return {
    priceId: null,
    productId: null,
    description: null,
    amountTotal: null,
    quantity: 1,
    metadata: {},
    ...over
  };
}

/* ── The four bugs found against the live account ─────────────────────── */

test("Priority Log Review is recognised (it is $99, the old code matched $79)", () => {
  // The most expensive of the four: every Priority Log Review purchase was
  // unclassified, so the customer paid and no job was ever created.
  const r = classifyCheckout([
    line({ priceId: "price_1Sv1PwINLKqe1c6goAyNDScR", amountTotal: 9900 })
  ]);
  assert.equal(r.service, "PRIORITY_LOG_REVIEW");
});

test("an Extra Revision does not become a Priority Log Review job", () => {
  // $79 is the Extra Revision add-on. Amount matching turned it into a job.
  const r = classifyCheckout([
    line({ priceId: "price_1Sv1UHINLKqe1c6gijk0TkGU", amountTotal: 7900 })
  ]);
  assert.equal(r.service, null);
  assert.deepEqual(r.addons, ["EXTRA_REVISION"]);
  assert.match(r.reason, /existing job/);
});

test("Rush Fee and Priority Log Review are both $99 and must not be confused", () => {
  // No amount can separate these two. Price ID can.
  const rush = classifyCheckout([
    line({ priceId: "price_1Sv1SrINLKqe1c6gfB6r7cHn", amountTotal: 9900 })
  ]);
  assert.equal(rush.service, null);
  assert.deepEqual(rush.addons, ["RUSH"]);

  const priority = classifyCheckout([
    line({ priceId: "price_1Sv1PwINLKqe1c6goAyNDScR", amountTotal: 9900 })
  ]);
  assert.equal(priority.service, "PRIORITY_LOG_REVIEW");
});

test("a Georgia Opportunity Ledger subscription never creates a tuning job", () => {
  // Same Stripe account, different business. Its $39/mo tier collides exactly
  // with Log Review's $39, so amount matching billed a newsletter subscriber
  // a tuning job every month.
  const r = classifyCheckout([
    line({
      priceId: "price_1TzEOAINLKqe1c6ggOvRN5VP",
      productId: "prod_UzCmNJIUP1kEgY",
      amountTotal: 3900,
      description: "Detailed — monthly"
    })
  ]);
  assert.equal(r.service, null);
  assert.equal(r.nonTuning, true);
  assert.match(r.reason, /another DD84 business line/);
});

/* ── Normal operation ─────────────────────────────────────────────────── */

test("every catalogued service price maps to a job", () => {
  for (const [priceId, entry] of Object.entries(SERVICE_PRICES)) {
    const r = classifyCheckout([line({ priceId })]);
    assert.equal(r.service, entry.service, `${entry.label} (${priceId})`);
  }
});

test("every catalogued add-on price maps to an add-on and no job", () => {
  for (const [priceId, entry] of Object.entries(ADDON_PRICES)) {
    const r = classifyCheckout([line({ priceId })]);
    assert.equal(r.service, null, `${entry.label} must not create a job`);
    assert.deepEqual(r.addons, [entry.addon]);
  }
});

test("a service bought with add-ons creates one job and records the add-ons", () => {
  const r = classifyCheckout([
    line({ priceId: "price_1Sv1QfINLKqe1c6gckbURtNx" }), // Stage 1 NA
    line({ priceId: "price_1Sv1SrINLKqe1c6gfB6r7cHn" }), // Rush
    line({ priceId: "price_1T8MoxINLKqe1c6ggu6lQRMn" }) // Travel
  ]);
  assert.equal(r.service, "STAGE1_NA");
  assert.deepEqual(r.addons.sort(), ["RUSH", "TRAVEL"]);
});

test("a cart with two services takes the larger and says so", () => {
  const r = classifyCheckout([
    line({ priceId: "price_1Sv1NzINLKqe1c6gaCcSA90s" }), // Log Review
    line({ priceId: "price_1Sv1RMINLKqe1c6gWBxwWuqH" }) // Stage 1 Boosted
  ]);
  assert.equal(r.service, "STAGE1_BOOST");
  assert.match(r.reason, /Multiple services/);
});

/* ── Refusing to guess ────────────────────────────────────────────────── */

test("an unknown price is reported, never forced into the nearest match", () => {
  // The cost of a wrong guess is a customer charged for one thing and queued
  // for another. Being unclassified is recoverable; being wrong is not.
  const r = classifyCheckout([
    line({ priceId: "price_brand_new", description: "Stage 2 Turbo", amountTotal: 59900 })
  ]);
  assert.equal(r.service, null);
  assert.equal(r.nonTuning, false);
  assert.equal(r.unrecognised.length, 1);
  assert.match(r.reason, /Unrecognised/);
});

test("a description that looks like a service is not enough on its own", () => {
  // Free-text matching is how the old classifier drifted. A customer typing
  // "stage 1" into a custom amount must not conjure a $399 job.
  const r = classifyCheckout([
    line({ description: "stage 1 boosted please", amountTotal: 100 })
  ]);
  assert.equal(r.service, null);
});

test("an empty checkout is reported rather than silently ignored", () => {
  const r = classifyCheckout([]);
  assert.equal(r.service, null);
  assert.match(r.reason, /no line items/);
});

/* ── Metadata override, so Stripe can lead without a deploy ───────────── */

test("price metadata can name a service the table has never seen", () => {
  const r = classifyCheckout([
    line({ priceId: "price_added_yesterday", metadata: { dd84_service: "stage1_na" } })
  ]);
  assert.equal(r.service, "STAGE1_NA");
});

test("metadata can name an add-on too", () => {
  const r = classifyCheckout([
    line({ priceId: "price_added_yesterday", metadata: { dd84_addon: "rush" } })
  ]);
  assert.equal(r.service, null);
  assert.deepEqual(r.addons, ["RUSH"]);
});

test("metadata naming a service that does not exist is not honoured", () => {
  // Otherwise a typo in the Stripe dashboard becomes a job of a type the
  // pipeline cannot handle.
  const r = classifyCheckout([
    line({ priceId: "price_x", metadata: { dd84_service: "STAGE_9_NITROUS" } })
  ]);
  assert.equal(r.service, null);
  assert.equal(r.unrecognised.length, 1);
});

test("metadata beats the static table when they disagree", () => {
  // The owner changed what a price means in Stripe; Stripe is the newer truth.
  const r = classifyCheckout([
    line({
      priceId: "price_1Sv1NzINLKqe1c6gaCcSA90s", // table says LOG_REVIEW
      metadata: { dd84_service: "STAGE1_BOOST" }
    })
  ]);
  assert.equal(r.service, "STAGE1_BOOST");
});
