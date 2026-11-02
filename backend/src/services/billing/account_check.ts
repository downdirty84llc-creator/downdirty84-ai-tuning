import Stripe from "stripe";
import { EXPECTED_STRIPE_ACCOUNT } from "../../config/stripe_catalog.js";
import {
  classifyAccount,
  describeVerdict,
  blocksPayments,
  type AccountVerdict
} from "../../config/stripe_account.js";

type VerificationDependencies = {
  key: () => string | undefined;
  nodeEnv: () => string | undefined;
  retrieve: (key: string) => Promise<{ id?: string }>;
  now: () => number;
  report: (verdict: AccountVerdict) => void;
};

/**
 * Verify at boot, then cache the account identity for the lifetime of the key.
 * A failed lookup can retry on checkout/catalog access after one minute; health
 * polling never asks Stripe. Concurrent callers share one bounded request.
 */
export function createStripeAccountVerifier(deps: VerificationDependencies) {
  let verdict: AccountVerdict = { kind: "UNVERIFIED", reason: "not checked yet" };
  let pending: Promise<AccountVerdict> | null = null;
  let lastAttempt = -Infinity;
  const RETRY_DELAY_MS = 60_000;

  async function check(): Promise<AccountVerdict> {
    const key = deps.key()?.trim();
    if (!key) {
      verdict = { kind: "NOT_CONFIGURED" };
      return verdict;
    }
    try {
      const account = await deps.retrieve(key);
      verdict = classifyAccount({
        expected: EXPECTED_STRIPE_ACCOUNT,
        actual: account.id ?? null,
        // Stripe does not include livemode on Account; its key prefix identifies mode.
        livemode: key.startsWith("sk_live_") || key.startsWith("rk_live_"),
        nodeEnv: deps.nodeEnv()
      });
    } catch (err) {
      verdict = classifyAccount({
        expected: EXPECTED_STRIPE_ACCOUNT,
        actual: null,
        livemode: null,
        nodeEnv: deps.nodeEnv(),
        error: String((err as Error)?.message ?? err)
      });
    }
    deps.report(verdict);
    return verdict;
  }

  function verify(): Promise<AccountVerdict> {
    if (pending) return pending;
    lastAttempt = deps.now();
    pending = check().finally(() => { pending = null; });
    return pending;
  }

  function ensure(): Promise<AccountVerdict> {
    if (pending) return pending;
    if (verdict.kind === "UNVERIFIED" && deps.now() - lastAttempt >= RETRY_DELAY_MS) {
      return verify();
    }
    return Promise.resolve(verdict);
  }

  return { current: () => verdict, verify, ensure };
}

const verifier = createStripeAccountVerifier({
  key: () => process.env.STRIPE_SECRET_KEY,
  nodeEnv: () => process.env.NODE_ENV,
  retrieve: async (key) => {
    const stripe = new Stripe(key, {
      apiVersion: "2024-06-20",
      timeout: 10_000,
      maxNetworkRetries: 0
    });
    return stripe.accounts.retrieve();
  },
  now: Date.now,
  report: (verdict) => {
    if (blocksPayments(verdict)) {
      console.error(`[DD84] STRIPE MISCONFIGURED  ${describeVerdict(verdict)}`);
      console.error("[DD84] /ready and new checkout requests will report unavailable until this is fixed.");
    } else if (verdict.kind === "UNVERIFIED") {
      console.warn(`[DD84] WARNING  ${describeVerdict(verdict)}`);
    } else {
      console.log(`[DD84] ${describeVerdict(verdict)}`);
    }
  }
});

export const stripeAccountVerdict = verifier.current;
export const verifyStripeAccount = verifier.verify;
export const ensureStripeAccountVerified = verifier.ensure;
