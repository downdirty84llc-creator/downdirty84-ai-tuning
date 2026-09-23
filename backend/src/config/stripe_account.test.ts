import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyAccount,
  describeVerdict,
  blocksPayments,
  type AccountFacts
} from "./stripe_account.js";

const DD84 = "acct_1QBl8ZINLKqe1c6g";

function facts(over: Partial<AccountFacts> = {}): AccountFacts {
  return {
    expected: DD84,
    actual: DD84,
    livemode: true,
    nodeEnv: "production",
    ...over
  };
}

test("the right account in live mode passes", () => {
  const v = classifyAccount(facts());
  assert.equal(v.kind, "OK");
  assert.equal(blocksPayments(v), false);
});

test("a key for a different account is caught", () => {
  // Four Stripe accounts are named "Down Dirty 84 llc". Picking the wrong one
  // means not a single price ID matches, so no payment ever becomes a job.
  const v = classifyAccount(facts({ actual: "acct_1SGHSjL9R5PTdFyY" }));
  assert.equal(v.kind, "WRONG_ACCOUNT");
  assert.equal(blocksPayments(v), true);
  assert.match(describeVerdict(v), /acct_1SGHSjL9R5PTdFyY/);
  assert.match(describeVerdict(v), /No payment would ever be classified/);
});

test("a test key in production is caught", () => {
  const v = classifyAccount(facts({ livemode: false }));
  assert.equal(v.kind, "WRONG_MODE");
  assert.equal(blocksPayments(v), true);
});

test("a test key outside production is fine", () => {
  // Otherwise every development machine reports a failure, and people learn to
  // ignore the one check that has to be believed.
  for (const nodeEnv of ["development", "test", undefined]) {
    const v = classifyAccount(facts({ livemode: false, nodeEnv }));
    assert.equal(v.kind, "OK", `nodeEnv=${nodeEnv}`);
  }
});

test("a live key outside production is not second-guessed", () => {
  const v = classifyAccount(facts({ livemode: true, nodeEnv: "development" }));
  assert.equal(v.kind, "OK");
});

test("wrong account beats wrong mode when both are true", () => {
  // Reporting "wrong mode" for a key that is also on the wrong account sends
  // someone to fix the lesser problem and think they are done.
  const v = classifyAccount(facts({ actual: "acct_other", livemode: false }));
  assert.equal(v.kind, "WRONG_ACCOUNT");
});

test("no key is its own state, not a mismatch", () => {
  const v = classifyAccount(facts({ actual: null, livemode: null }));
  assert.equal(v.kind, "NOT_CONFIGURED");
  assert.equal(blocksPayments(v), false);
});

test("an unreachable Stripe is never reported as OK", () => {
  // The failure this whole module exists to prevent is an unchecked thing
  // reading as a checked one.
  const v = classifyAccount(facts({ error: "connect ETIMEDOUT" }));
  assert.equal(v.kind, "UNVERIFIED");
  assert.match(describeVerdict(v), /ETIMEDOUT/);
});

test("an error wins even when the other facts look perfect", () => {
  const v = classifyAccount(facts({ error: "403 from a proxy" }));
  assert.equal(v.kind, "UNVERIFIED");
});

test("a missing account id is unverified, not OK", () => {
  const v = classifyAccount(facts({ actual: null, livemode: true }));
  assert.equal(v.kind, "UNVERIFIED");
});

test("a missing livemode flag on the right account is unverified", () => {
  const v = classifyAccount(facts({ livemode: null }));
  assert.equal(v.kind, "UNVERIFIED");
});

test("only the two mismatches block payments", () => {
  const blocking = [
    classifyAccount(facts({ actual: "acct_x" })),
    classifyAccount(facts({ livemode: false }))
  ];
  const notBlocking = [
    classifyAccount(facts()),
    classifyAccount(facts({ actual: null, livemode: null })),
    classifyAccount(facts({ error: "boom" }))
  ];
  for (const v of blocking) assert.equal(blocksPayments(v), true, v.kind);
  for (const v of notBlocking) assert.equal(blocksPayments(v), false, v.kind);
});

test("every verdict has a description that names the problem", () => {
  const all = [
    classifyAccount(facts()),
    classifyAccount(facts({ actual: "acct_x" })),
    classifyAccount(facts({ livemode: false })),
    classifyAccount(facts({ actual: null, livemode: null })),
    classifyAccount(facts({ error: "x" }))
  ];
  for (const v of all) {
    const text = describeVerdict(v);
    assert.ok(text.length > 20, `${v.kind} description is too thin: ${text}`);
  }
});
