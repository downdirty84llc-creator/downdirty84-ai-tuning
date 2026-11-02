import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import Stripe from "stripe";
import { createStripeRouter, type StripeWebhookDependencies } from "./stripe.routes.js";
import { EXPECTED_STRIPE_ACCOUNT, SERVICE_PRICES, ADDON_PRICES, NON_TUNING_PRODUCTS } from "../config/stripe_catalog.js";
import type { AccountVerdict } from "../config/stripe_account.js";

// Local signature generation/verification only. This SDK instance never calls Stripe.
const signatureSDK = new Stripe("sk_test_synthetic_no_provider_access", { apiVersion: "2024-06-20" });
const secret = "whsec_synthetic_local_signature_only";
const okAccount: AccountVerdict = { kind: "OK", accountId: EXPECTED_STRIPE_ACCOUNT, livemode: false };
const serviceId = Object.keys(SERVICE_PRICES)[0];
function session(overrides: Partial<Stripe.Checkout.Session> = {}) {
  return {
    id: "cs_test_synthetic", object: "checkout.session", livemode: false,
    mode: "payment", status: "complete", payment_status: "paid", amount_total: 3900,
    currency: "usd", customer_email: "customer@example.test", customer_details: null,
    metadata: { fuel: "E85", induction: "BOOSTED", vehicle: "Synthetic vehicle" },
    ...overrides
  } as Stripe.Checkout.Session;
}
function line(priceId = serviceId, productId = "prod_synthetic") {
  return {
    id: `li_${priceId}`, quantity: 1, amount_total: 3900, description: "Synthetic item",
    price: { id: priceId, metadata: {}, product: { id: productId, metadata: {} } }
  } as Stripe.LineItem;
}
function event(type: Stripe.Event.Type = "checkout.session.completed", overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_synthetic", object: "event", type, livemode: false, data: { object: session() },
    ...overrides
  };
}

async function fixture(options: {
  current?: Stripe.Checkout.Session;
  account?: AccountVerdict;
  lines?: Stripe.LineItem[];
  pages?: { data: Stripe.LineItem[]; has_more: boolean }[];
  retrievalFailure?: boolean;
  notificationFailure?: boolean;
  mintFailure?: boolean;
  env?: NodeJS.ProcessEnv;
} = {}) {
  const state = {
    current: options.current ?? session(), retrieves: 0, accountChecks: 0,
    lineRequests: [] as Stripe.Checkout.SessionListLineItemsParams[],
    transactions: 0, orders: [] as unknown[][], jobs: [] as unknown[][],
    notifications: [] as { to: string; subject: string; text: string }[], minted: [] as string[]
  };
  const dependencies: StripeWebhookDependencies = {
    stripe: {
      webhooks: { constructEvent: (body, sig, signingSecret) => signatureSDK.webhooks.constructEvent(body, sig, signingSecret) },
      checkout: { sessions: {
        retrieve: async () => {
          state.retrieves++;
          if (options.retrievalFailure) throw new Error("Synthetic provider outage");
          return state.current;
        },
        listLineItems: async (_id, params) => {
          state.lineRequests.push(params);
          return options.pages?.[state.lineRequests.length - 1] ?? { data: options.lines ?? [line()], has_more: false };
        }
      } }
    },
    account: async () => { state.accountChecks++; return options.account ?? okAccount; },
    env: () => options.env ?? { NODE_ENV: "test", STRIPE_SECRET_KEY: "sk_test_synthetic_no_provider_access", STRIPE_WEBHOOK_SECRET: secret },
    transaction: async fn => {
      state.transactions++;
      return fn({ query: async <T>(sql: string, values: unknown[] = []) => {
        if (sql.includes("INSERT INTO users")) return [{ id: "user_synthetic" }] as T[];
        if (sql.includes("INSERT INTO orders")) {
          assert(sql.includes("ON CONFLICT DO NOTHING"));
          if (state.orders.some(row => row[1] === values[1] || row[2] === values[2])) return [];
          state.orders.push(values);
          return [{ id: "order_synthetic" }] as T[];
        }
        if (sql.includes("INSERT INTO jobs")) { state.jobs.push(values); return [{ id: "job_synthetic" }] as T[]; }
        throw new Error(`Unexpected test SQL: ${sql}`);
      } });
    },
    mintLink: async email => {
      state.minted.push(email);
      if (options.mintFailure) throw new Error("Synthetic post-commit token failure");
      return { url: "https://example.test/synthetic-sign-in", ttlMinutes: 15 };
    },
    send: async message => {
      state.notifications.push(message);
      if (options.notificationFailure) return { ok: false, transport: "NONE", error: "Synthetic mail failure" };
      return { ok: true, transport: "CONSOLE", id: null };
    },
    recipients: () => ["owner@example.test"]
  };
  const app = express();
  app.use("/api/v1/stripe", express.raw({ type: "application/json" }), createStripeRouter(dependencies));
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: "SYNTHETIC_ERROR_BOUNDARY", message: error.message });
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  return {
    state,
    async post(payload: unknown, signature: "valid" | "invalid" | "absent" = "valid") {
      const body = JSON.stringify(payload);
      const sig = signatureSDK.webhooks.generateTestHeaderString({ payload: body, secret });
      const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/stripe/webhook`, {
        method: "POST", body, headers: { "Content-Type": "application/json", ...(signature === "absent" ? {} : { "Stripe-Signature": signature === "valid" ? sig : "invalid" }) }
      });
      return { status: response.status, body: await response.json() };
    },
    close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  };
}

for (const signature of ["invalid", "absent"] as const) {
  test(`${signature} signature causes no provider lookup or side effects`, async () => {
    const f = await fixture();
    try {
      assert.equal((await f.post(event(), signature)).status, 400);
      assert.equal(f.state.retrieves, 0);
      assert.equal(f.state.accountChecks, 0);
      assert.equal(f.state.transactions, 0);
      assert.deepEqual(f.state.notifications, []);
    } finally { await f.close(); }
  });
}

test("irrelevant signed events are acknowledged without fulfillment", async () => {
  const f = await fixture();
  try {
    assert.deepEqual((await f.post(event("customer.created"))).body, { received: true });
    assert.equal(f.state.retrieves, 0);
  } finally { await f.close(); }
});

for (const type of ["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed"] as const) {
  test(`${type} never fulfills an authoritative unpaid session`, async () => {
    const f = await fixture({ current: session({ payment_status: "unpaid" }) });
    try {
      const r = await f.post(event(type)); // Event snapshot misleadingly says paid.
      assert.equal(r.status, 200);
      assert.equal(r.body.jobCreated, false);
      assert.equal(f.state.retrieves, 1);
      assert.equal(f.state.transactions, 0);
      assert.deepEqual(f.state.lineRequests, []);
      assert.deepEqual(f.state.notifications, []);
    } finally { await f.close(); }
  });
}

test("late async success creates one job after unpaid completion and failure", async () => {
  const f = await fixture({ current: session({ payment_status: "unpaid" }) });
  try {
    await f.post(event());
    await f.post(event("checkout.session.async_payment_failed", { id: "evt_failed" }));
    f.state.current = session();
    const r = await f.post(event("checkout.session.async_payment_succeeded", { id: "evt_settled", data: { object: session({ payment_status: "unpaid" }) } }));
    assert.equal(r.body.jobCreated, true);
    assert.equal(f.state.orders.length, 1);
    assert.equal(f.state.jobs.length, 1);
    assert.equal(f.state.jobs[0][5], "E85");
    assert.equal(f.state.jobs[0][6], "FORCED");
    assert.equal(f.state.notifications.length, 1);
    assert.equal(f.state.notifications[0].to, "customer@example.test");
  } finally { await f.close(); }
});

test("stale failure never creates or revokes paid work; distinct success events remain idempotent", async () => {
  const f = await fixture();
  try {
    assert.equal((await f.post(event("checkout.session.async_payment_failed"))).body.jobCreated, false);
    assert.equal(f.state.orders.length, 0);
    assert.equal((await f.post(event("checkout.session.async_payment_succeeded", { id: "evt_settled" }))).body.jobCreated, true);
    assert.equal((await f.post(event("checkout.session.async_payment_failed", { id: "evt_late_failed" }))).body.jobCreated, false);
    const duplicate = await f.post(event("checkout.session.async_payment_succeeded", { id: "evt_distinct" }));
    assert.equal(duplicate.body.duplicate, true);
    assert.equal((await f.post(event())).body.duplicate, true);
    assert.equal(f.state.orders.length, 1);
    assert.equal(f.state.jobs.length, 1);
    assert.equal(f.state.notifications.length, 1);
  } finally { await f.close(); }
});

for (const current of [
  session({ payment_status: "no_payment_required", amount_total: 0 }),
  session({ mode: "subscription" }),
  session({ mode: "setup" })
]) {
  test(`unsupported ${current.mode}/${current.payment_status} cannot create paid work`, async () => {
    const f = await fixture({ current });
    try {
      const r = await f.post(event());
      assert.equal(r.status, 200);
      assert.equal(r.body.jobCreated, false);
      assert.equal(f.state.transactions, 0);
    } finally { await f.close(); }
  });
}

for (const [label, current] of [
  ["not complete", session({ status: "open" })],
  ["missing lifecycle status", session({ status: null })],
  ["unknown payment status", session({ payment_status: "unknown" as Stripe.Checkout.Session.PaymentStatus })],
  ["unknown mode", session({ mode: "unknown" as Stripe.Checkout.Session.Mode })],
  ["zero amount", session({ amount_total: 0 })],
  ["negative amount", session({ amount_total: -1 })],
  ["no email", session({ customer_email: null })],
  ["unknown currency", session({ currency: null })],
  ["unsupported fuel", session({ metadata: { fuel: "diesel" } })],
  ["unsupported induction", session({ metadata: { induction: "guess" } })]
] as const) {
  test(`paid session requiring review (${label}) is not silently fulfilled`, async () => {
    const f = await fixture({ current });
    try {
      const r = await f.post(event());
      assert.equal(r.status, 503);
      assert.equal(r.body.error, "PAYMENT_REVIEW_REQUIRED");
      assert.equal(f.state.transactions, 0);
      assert.equal(f.state.notifications.length, 0);
    } finally { await f.close(); }
  });
}

for (const overrides of [{ account: "acct_other" }, { livemode: true }, { data: { object: session({ livemode: true }) } }]) {
  test(`signed event account/mode mismatch is rejected: ${JSON.stringify(overrides)}`, async () => {
    const f = await fixture();
    try {
      assert.equal((await f.post(event("checkout.session.completed", overrides))).status, 400);
      assert.equal(f.state.retrieves, 0);
      assert.equal(f.state.transactions, 0);
    } finally { await f.close(); }
  });
}

test("unverified Stripe account keeps delivery retryable without provider fulfillment lookup", async () => {
  const f = await fixture({ account: { kind: "UNVERIFIED", reason: "Synthetic outage" } });
  try {
    assert.equal((await f.post(event())).status, 503);
    assert.equal(f.state.retrieves, 0);
    assert.equal(f.state.transactions, 0);
  } finally { await f.close(); }
});

test("provider retrieval error cannot create an order from the event snapshot", async () => {
  const f = await fixture({ retrievalFailure: true });
  try {
    assert.equal((await f.post(event())).status, 500);
    assert.equal(f.state.transactions, 0);
  } finally { await f.close(); }
});

test("retrieved session identity and mode must match the verified event", async () => {
  for (const current of [session({ id: "cs_other" }), session({ livemode: true })]) {
    const f = await fixture({ current });
    try {
      assert.equal((await f.post(event())).body.error, "PAYMENT_SESSION_MISMATCH");
      assert.equal(f.state.transactions, 0);
    } finally { await f.close(); }
  }
});

test("classification uses every line-item page", async () => {
  const f = await fixture({ pages: [
    { data: [line(Object.keys(ADDON_PRICES)[0])], has_more: true },
    { data: [line(serviceId)], has_more: false }
  ] });
  try {
    assert.equal((await f.post(event())).body.jobCreated, true);
    assert.equal(f.state.lineRequests.length, 2);
    assert.equal(f.state.lineRequests[1].starting_after, `li_${Object.keys(ADDON_PRICES)[0]}`);
    assert.equal(JSON.parse(f.state.orders[0][6] as string).length, 2);
  } finally { await f.close(); }
});

for (const [label, lines, reason, messages] of [
  ["non-tuning", [line("price_non_tuning", [...NON_TUNING_PRODUCTS][0])], "NON_TUNING", 0],
  ["add-on only", [line(Object.keys(ADDON_PRICES)[0])], "ADDON_ONLY", 1],
  ["unclassified", [line("price_unknown")], "UNCLASSIFIED", 1]
] as const) {
  test(`${label} classification is preserved without a tuning job`, async () => {
    const f = await fixture({ lines: [...lines] });
    try {
      assert.equal((await f.post(event())).body.reason, reason);
      assert.equal(f.state.orders.length, 1);
      assert.equal(f.state.jobs.length, 0);
      assert.equal(f.state.notifications.length, messages);
      assert.equal(f.state.minted.length, 0);
    } finally { await f.close(); }
  });
}


test("missing optional vehicle metadata stays explicitly unknown without violating jobs schema", async () => {
  const f = await fixture({ current: session({ metadata: null }) });
  try {
    assert.equal((await f.post(event())).body.jobCreated, true);
    assert.equal(f.state.jobs[0][2], "UNKNOWN");
    assert.equal(f.state.jobs[0][5], null);
    assert.equal(f.state.jobs[0][6], null);
  } finally { await f.close(); }
});

test("missing webhook configuration fails before signature or provider processing", async () => {
  const f = await fixture({ env: { NODE_ENV: "test", STRIPE_SECRET_KEY: "sk_test_synthetic" } });
  try {
    assert.equal((await f.post(event())).status, 503);
    assert.equal(f.state.accountChecks, 0);
    assert.equal(f.state.retrieves, 0);
    assert.equal(f.state.transactions, 0);
  } finally { await f.close(); }
});

test("production rejects a test-mode account even when the event matches it", async () => {
  const f = await fixture({ env: { NODE_ENV: "production", STRIPE_SECRET_KEY: "sk_test_synthetic", STRIPE_WEBHOOK_SECRET: secret } });
  try {
    assert.equal((await f.post(event())).status, 400);
    assert.equal(f.state.retrieves, 0);
  } finally { await f.close(); }
});

test("signed malformed checkout reference is rejected before account or provider lookup", async () => {
  const f = await fixture();
  try {
    for (const payload of [event("checkout.session.completed", {data:{object:null}}), event("checkout.session.completed", {id:null})]) {
      assert.equal((await f.post(payload)).status, 400);
    }
    assert.equal(f.state.accountChecks, 0);
  } finally { await f.close(); }
});

test("nonadvancing provider pagination cannot partially fulfill an order", async () => {
  const f = await fixture({ pages: [
    {data:[line()],has_more:true}, {data:[line()],has_more:true}
  ] });
  try {
    assert.equal((await f.post(event())).status, 500);
    assert.equal(f.state.transactions, 0);
    assert.equal(f.state.notifications.length, 0);
  } finally { await f.close(); }
});


for (const [label, options, firstStatus] of [
  ["notification", { notificationFailure: true }, 200],
  ["magic-link persistence", { mintFailure: true }, 500]
] as const) {
  test(`post-commit ${label} failure cannot duplicate order/job on retry`, async () => {
    const f = await fixture(options);
    try {
      assert.equal((await f.post(event())).status, firstStatus);
      assert.equal((await f.post(event())).body.duplicate, true);
      assert.equal((await f.post(event("checkout.session.async_payment_succeeded", {id:"evt_retry_distinct"}))).body.duplicate, true);
      assert.equal(f.state.orders.length, 1);
      assert.equal(f.state.jobs.length, 1);
      // Notification retries/outbox are intentionally not claimed by the
      // order/job exactly-once invariant; post-commit delivery is separate.
    } finally { await f.close(); }
  });
}
