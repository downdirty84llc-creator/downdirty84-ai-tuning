import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type Stripe from "stripe";
import { createCheckoutRouter } from "./checkout.routes.js";
import type { AccountVerdict } from "../config/stripe_account.js";
import { SERVICE_PRICES, ADDON_PRICES, EXPECTED_STRIPE_ACCOUNT } from "../config/stripe_catalog.js";

const configured = {
  STRIPE_SECRET_KEY: "synthetic-secret",
  STRIPE_WEBHOOK_SECRET: "synthetic-webhook-secret",
  APP_BASE_URL: "https://app.example.test"
};
const verified: AccountVerdict = { kind: "OK", accountId: EXPECTED_STRIPE_ACCOUNT, livemode: true };

async function fixture(
  options: { env?: NodeJS.ProcessEnv; account?: AccountVerdict } = {}
) {
  const calls: Stripe.Checkout.SessionCreateParams[] = [];
  let accountCalls = 0, priceCalls = 0, failPrices = false, now = 0;
  const app = express();
  app.use(express.json());
  app.use("/api/v1", createCheckoutRouter({
    env: () => options.env ?? configured,
    account: async () => { accountCalls++; return options.account ?? verified; },
    now: () => now,
    stripe: {
      prices: { retrieve: async (id) => {
        priceCalls++;
        if (failPrices) throw new Error("Synthetic provider outage");
        return { id, unit_amount: 3900, currency: "usd" };
      } },
      checkout: { sessions: { create: async (params) => {
        calls.push(params);
        return { id: "cs_synthetic", url: "https://checkout.example.test/synthetic" };
      } } }
    }
  }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api/v1`;
  return {
    calls,
    counters: () => ({ accountCalls, priceCalls }),
    expirePrices: () => { now = 5 * 60_000; failPrices = true; },
    catalog: () => fetch(`${base}/catalog`),
    checkout: (body: unknown) => fetch(`${base}/checkout`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    }),
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

for (const [name, env] of [
  ["both credentials absent", {}],
  ["webhook credential absent", { ...configured, STRIPE_WEBHOOK_SECRET: undefined }],
  ["API credential absent", { ...configured, STRIPE_SECRET_KEY: undefined }],
  ["whitespace-only webhook credential", { ...configured, STRIPE_WEBHOOK_SECRET: "  \n " }],
  ["whitespace-only API credential", { ...configured, STRIPE_SECRET_KEY: " \t " }]
] as const) {
  test(`catalog and checkout fail closed with ${name}`, async () => {
    const f = await fixture({ env });
    try {
      const catalog = await (await f.catalog()).json();
      assert.equal(catalog.checkout.enabled, false);
      assert.equal(catalog.checkout.code, "PAYMENTS_DISABLED");
      assert.equal(catalog.pricesLive, false);
      assert.equal(catalog.services.length, 4);
      assert(catalog.services.every((service: { unitAmount: number | null }) => service.unitAmount === null));
      const response = await f.checkout({ service: "LOG_REVIEW" });
      assert.equal(response.status, 503);
      assert.equal((await response.json()).error, "PAYMENTS_DISABLED");
      assert.deepEqual(f.calls, []);
      assert.deepEqual(f.counters(), { accountCalls: 0, priceCalls: 0 });
    } finally { await f.close(); }
  });
}

for (const account of [
  { kind: "WRONG_ACCOUNT", expected: EXPECTED_STRIPE_ACCOUNT, actual: "acct_wrong" },
  { kind: "WRONG_MODE", accountId: EXPECTED_STRIPE_ACCOUNT, keyLivemode: false, nodeEnv: "production" },
  { kind: "UNVERIFIED", reason: "not checked yet" },
  { kind: "UNVERIFIED", reason: "Synthetic provider timeout" },
  { kind: "NOT_CONFIGURED" }
] as AccountVerdict[]) {
  test(`checkout enforces ${account.kind} without relying on load-balancer readiness`, async () => {
    const f = await fixture({ account });
    try {
      const response = await f.checkout({ service: "LOG_REVIEW" });
      assert.equal(response.status, 503);
      const body = await response.json();
      const expected = account.kind === "WRONG_ACCOUNT" || account.kind === "WRONG_MODE"
        ? "PAYMENTS_MISCONFIGURED" : "PAYMENTS_UNVERIFIED";
      assert.equal(body.error, expected);
      assert(!JSON.stringify(body).includes("acct_wrong"));
      const catalog = await (await f.catalog()).json();
      assert.equal(catalog.checkout.code, expected);
      assert.equal(catalog.checkout.enabled, false);
      assert.equal(f.counters().priceCalls, 0);
      assert.deepEqual(f.calls, []);
    } finally { await f.close(); }
  });
}

test("bad requests are rejected before configuration or provider lookup", async () => {
  const f = await fixture({ env: {} });
  try {
    for (const body of [{ service: "invalid" }, { service: "LOG_REVIEW", addons: "RUSH" }, { service: "LOG_REVIEW", addons: ["INVALID"] }]) {
      assert.equal((await f.checkout(body)).status, 400);
    }
    assert.deepEqual(f.calls, []);
    assert.equal(f.counters().accountCalls, 0);
  } finally { await f.close(); }
});

test("verified checkout keeps server price mapping and vehicle metadata", async () => {
  const f = await fixture();
  try {
    const response = await f.checkout({ service: "log_review", priceId: "price_attacker", addons: ["RUSH"], fuel: "E85", induction: "BOOSTED", vehicle: "Synthetic vehicle" });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).sessionId, "cs_synthetic");
    assert.equal(f.calls.length, 1);
    const params = f.calls[0];
    assert.deepEqual(params.line_items, [
      { price: Object.entries(SERVICE_PRICES).find(([, value]) => value.service === "LOG_REVIEW")?.[0], quantity: 1 },
      { price: Object.entries(ADDON_PRICES).find(([, value]) => value.addon === "RUSH")?.[0], quantity: 1 }
    ]);
    assert.equal(params.metadata?.fuel, "E85");
    assert.equal(params.metadata?.induction, "FORCED");
    assert.equal(params.success_url, "https://app.example.test/paid?session={CHECKOUT_SESSION_ID}");
    assert.equal(params.cancel_url, "https://app.example.test/buy?checkout=cancelled");
  } finally { await f.close(); }
});

test("expired cached prices are never presented as live after a failed refresh", async () => {
  const f = await fixture();
  try {
    const first = await (await f.catalog()).json();
    assert.equal(first.pricesLive, true);
    assert.equal(first.checkout.enabled, true);
    assert.equal(first.services[0].unitAmount, 3900);
    const callCount = f.counters().priceCalls;
    assert.equal((await (await f.catalog()).json()).pricesLive, true);
    assert.equal(f.counters().priceCalls, callCount);
    f.expirePrices();
    const expired = await (await f.catalog()).json();
    assert.equal(expired.pricesLive, false);
    assert.equal(expired.checkout.enabled, true);
    assert(expired.services.every((service: { unitAmount: number | null }) => service.unitAmount === null));
  } finally { await f.close(); }
});
