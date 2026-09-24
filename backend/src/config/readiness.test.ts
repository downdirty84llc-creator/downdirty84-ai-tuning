import { test } from "node:test";
import assert from "node:assert/strict";
import { computeReadiness } from "./readiness.js";
import { classifyAccount } from "./stripe_account.js";
import type { EnvReport } from "./env.js";

const DD84 = "acct_1QBl8ZINLKqe1c6g";

function env(over: Partial<EnvReport> = {}): EnvReport {
  return {
    ok: true,
    errors: [],
    warnings: [],
    storage: "S3",
    payments: "CONFIGURED",
    email: "CONFIGURED",
    adminCount: 1,
    ...over
  };
}

const okAccount = classifyAccount({
  expected: DD84,
  actual: DD84,
  livemode: true,
  nodeEnv: "production"
});
const wrongAccount = classifyAccount({
  expected: DD84,
  actual: "acct_1SGHSjL9R5PTdFyY",
  livemode: true,
  nodeEnv: "production"
});
const testKeyInProd = classifyAccount({
  expected: DD84,
  actual: DD84,
  livemode: false,
  nodeEnv: "production"
});
const notConfigured = classifyAccount({
  expected: DD84,
  actual: null,
  livemode: null,
  nodeEnv: "production"
});
const unverified = classifyAccount({
  expected: DD84,
  actual: null,
  livemode: null,
  nodeEnv: "production",
  error: "connect ETIMEDOUT"
});

test("a healthy instance is ready", () => {
  assert.equal(computeReadiness(env(), okAccount).ready, true);
});

test("a key for the wrong Stripe account takes the instance out of rotation", () => {
  // The whole point of the account check. Such an instance would accept
  // webhooks and create no jobs from any of them.
  const r = computeReadiness(env(), wrongAccount);
  assert.equal(r.ready, false);
  assert.ok(r.configErrors.some((e) => e.includes("acct_1SGHSjL9R5PTdFyY")));
});

test("a test key in production takes the instance out of rotation", () => {
  const r = computeReadiness(env(), testKeyInProd);
  assert.equal(r.ready, false);
  assert.ok(r.configErrors.some((e) => /TEST key/.test(e)));
});

test("no Stripe key does not make an instance unready", () => {
  // Payments off is a legitimate deployment. checkEnv already warns about it,
  // and refusing traffic would take down an otherwise working install.
  assert.equal(computeReadiness(env(), notConfigured).ready, true);
});

test("an unreachable Stripe does not take a working instance down", () => {
  // A Stripe outage must not cascade into this app refusing all traffic. The
  // verdict is logged and reported; it does not gate readiness.
  const r = computeReadiness(env(), unverified);
  assert.equal(r.ready, true);
  assert.deepEqual(r.configErrors, []);
});

test("environment errors still block on their own", () => {
  const r = computeReadiness(env({ ok: false, errors: ["DATABASE_URL is not set."] }), okAccount);
  assert.equal(r.ready, false);
  assert.deepEqual(r.configErrors, ["DATABASE_URL is not set."]);
});

test("both kinds of problem are reported, not just the first", () => {
  // An instance can be wrong about more than one thing, and whoever reads
  // /ready needs all of it — fixing one and redeploying into the other is a
  // wasted cycle at the worst time.
  const r = computeReadiness(env({ ok: false, errors: ["RESEND_API_KEY is not set."] }), wrongAccount);
  assert.equal(r.ready, false);
  assert.equal(r.configErrors.length, 2);
  assert.ok(r.configErrors.some((e) => e.includes("RESEND_API_KEY")));
  assert.ok(r.configErrors.some((e) => e.includes("acct_1SGHSjL9R5PTdFyY")));
});
