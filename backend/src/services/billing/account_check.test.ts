import { test } from "node:test";
import assert from "node:assert/strict";
import { createStripeAccountVerifier } from "./account_check.js";
import { EXPECTED_STRIPE_ACCOUNT } from "../../config/stripe_catalog.js";

function fixture() {
  let now = 0, calls = 0, failed = false;
  let retrieve = async () => {
    calls++;
    if (failed) throw new Error("Synthetic timeout");
    return { id: EXPECTED_STRIPE_ACCOUNT };
  };
  const verifier = createStripeAccountVerifier({
    key: () => "sk_live_synthetic_not_a_credential",
    nodeEnv: () => "production",
    retrieve: () => retrieve(),
    now: () => now,
    report: () => {}
  });
  return { verifier, calls: () => calls, fail: () => { failed = true; }, recover: () => { failed = false; },
    advance: (ms: number) => { now += ms; }, setRetrieve: (fn: typeof retrieve) => { retrieve = fn; } };
}

test("account verification is single-flight across boot and concurrent checkout", async () => {
  const f = fixture();
  let finish!: (value: { id: string }) => void;
  let calls = 0;
  f.setRetrieve(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const first = f.verifier.verify();
  const second = f.verifier.ensure();
  const third = f.verifier.verify();
  assert.equal(calls, 1);
  assert.equal(f.verifier.current().kind, "UNVERIFIED");
  finish({ id: EXPECTED_STRIPE_ACCOUNT });
  assert.equal((await first).kind, "OK");
  assert.deepEqual(await second, await third);
});

test("unknown account recovers after a bounded cooldown without health-poll requests", async () => {
  const f = fixture();
  f.fail();
  assert.equal((await f.verifier.ensure()).kind, "UNVERIFIED");
  assert.equal(f.calls(), 1);
  f.recover();
  for (let i = 0; i < 3; i++) {
    assert.equal(f.verifier.current().kind, "UNVERIFIED");
    assert.equal((await f.verifier.ensure()).kind, "UNVERIFIED");
  }
  assert.equal(f.calls(), 1);
  f.advance(60_000);
  assert.equal((await f.verifier.ensure()).kind, "OK");
  assert.equal(f.calls(), 2);
  f.advance(60_000);
  assert.equal((await f.verifier.ensure()).kind, "OK");
  assert.equal(f.calls(), 2);
});

test("known wrong account remains blocked, not repeatedly retried", async () => {
  const f = fixture();
  let calls = 0;
  f.setRetrieve(async () => { calls++; return { id: "acct_wrong" }; });
  assert.equal((await f.verifier.ensure()).kind, "WRONG_ACCOUNT");
  f.advance(60_000);
  assert.equal((await f.verifier.ensure()).kind, "WRONG_ACCOUNT");
  assert.equal(calls, 1);
});

test("absent credentials do not contact Stripe", async () => {
  const verifier = createStripeAccountVerifier({
    key: () => "  ", nodeEnv: () => "production", now: () => 0, report: () => {},
    retrieve: async () => { throw new Error("Must not call provider"); }
  });
  assert.equal((await verifier.verify()).kind, "NOT_CONFIGURED");
});
