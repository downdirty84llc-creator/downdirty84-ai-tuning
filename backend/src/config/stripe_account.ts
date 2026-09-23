/**
 * Is this key pointing at the right Stripe account, in the right mode?
 *
 * The price IDs in stripe_catalog.ts belong to exactly one account. They are
 * not names — they are opaque handles minted by Stripe, and an identical
 * product on a different account has entirely different ones. So a key for the
 * wrong account does not classify payments *badly*; it classifies **none of
 * them**, because not one ID matches.
 *
 * That stopped being hypothetical: the Stripe connector now lists four
 * accounts named "Down Dirty 84 llc", three of them created after this
 * catalogue was written. Picking the wrong one is a plausible mistake to make
 * at 11pm, and the symptom — every payment "unclassified" — looks like a code
 * bug rather than a misconfiguration.
 *
 * The same applies to mode. A test key in production takes no real money but
 * happily accepts test webhooks, and its price IDs never match the live ones.
 *
 * The existing design catches both eventually: every payment emails the owner
 * "UNCLASSIFIED PAID ORDER". But eventually is after a customer has paid. This
 * catches it at boot, before anyone can.
 */

export type AccountVerdict =
  /** Right account, right mode. */
  | { kind: "OK"; accountId: string; livemode: boolean }
  /** The key belongs to a different account. Nothing will ever classify. */
  | { kind: "WRONG_ACCOUNT"; expected: string; actual: string }
  /** Right account, wrong mode — test price IDs do not match live ones. */
  | { kind: "WRONG_MODE"; accountId: string; keyLivemode: boolean; nodeEnv: string }
  /** No key configured. Payments are simply off; not an error by itself. */
  | { kind: "NOT_CONFIGURED" }
  /** Could not ask Stripe. Never report this as OK. */
  | { kind: "UNVERIFIED"; reason: string };

export type AccountFacts = {
  /** The account the catalogue's price IDs belong to. */
  expected: string;
  /** The account the configured key actually belongs to, per Stripe. */
  actual: string | null;
  /** Whether the key is a live key, per Stripe. */
  livemode: boolean | null;
  nodeEnv: string | undefined;
  /** Set when Stripe could not be reached or refused. */
  error?: string | null;
};

/**
 * Pure, so the decision is testable without a Stripe key — which matters here
 * more than usual, because the branch that must never be wrong is the one
 * declaring a mismatched account acceptable.
 */
export function classifyAccount(facts: AccountFacts): AccountVerdict {
  if (facts.error) return { kind: "UNVERIFIED", reason: facts.error };

  // No key at all is a separate, legitimate state: payments are off, and
  // checkEnv already warns about it. Conflating it with a mismatch would make
  // every development machine look broken.
  if (facts.actual === null && facts.livemode === null) return { kind: "NOT_CONFIGURED" };

  if (facts.actual === null) {
    return { kind: "UNVERIFIED", reason: "Stripe did not return an account id." };
  }

  // Account first. A wrong account is unrecoverable for classification, and
  // saying "wrong mode" about a key that is also on the wrong account would
  // send someone to fix the lesser of two problems.
  if (facts.actual !== facts.expected) {
    return { kind: "WRONG_ACCOUNT", expected: facts.expected, actual: facts.actual };
  }

  if (facts.livemode === null) {
    return { kind: "UNVERIFIED", reason: "Stripe did not say whether the key is live." };
  }

  // Only production is opinionated about mode. A live key in development is
  // the operator's business — and warning about it here would train people to
  // ignore this check, which is the one that has to be believed.
  if (facts.nodeEnv === "production" && !facts.livemode) {
    return {
      kind: "WRONG_MODE",
      accountId: facts.actual,
      keyLivemode: false,
      nodeEnv: "production"
    };
  }

  return { kind: "OK", accountId: facts.actual, livemode: facts.livemode };
}

/** One line, written for whoever is staring at a log at the wrong hour. */
export function describeVerdict(v: AccountVerdict): string {
  switch (v.kind) {
    case "OK":
      return `Stripe account ${v.accountId} (${v.livemode ? "live" : "test"} mode).`;
    case "WRONG_ACCOUNT":
      return (
        `STRIPE_SECRET_KEY belongs to ${v.actual}, but every price ID in the ` +
        `catalogue belongs to ${v.expected}. No payment would ever be classified, ` +
        `so no job would ever be created.`
      );
    case "WRONG_MODE":
      return (
        `STRIPE_SECRET_KEY is a TEST key but NODE_ENV=production. Test price IDs ` +
        `do not match the live ones in the catalogue, so no payment would be classified.`
      );
    case "NOT_CONFIGURED":
      return "Stripe is not configured; payments are off.";
    case "UNVERIFIED":
      return `Could not verify the Stripe account: ${v.reason}`;
  }
}

/** True when the verdict means this instance must not serve payment traffic. */
export function blocksPayments(v: AccountVerdict): boolean {
  return v.kind === "WRONG_ACCOUNT" || v.kind === "WRONG_MODE";
}
