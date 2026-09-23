import Stripe from "stripe";
import { EXPECTED_STRIPE_ACCOUNT } from "../../config/stripe_catalog.js";
import {
  classifyAccount,
  describeVerdict,
  blocksPayments,
  type AccountVerdict
} from "../../config/stripe_account.js";

/**
 * Ask Stripe which account this key belongs to, once, at boot.
 *
 * Deliberately *not* part of assertEnvOrExit: that is synchronous and must
 * stay that way, and blocking a deploy on a third-party HTTP call means a
 * Stripe outage stops you shipping. This runs after the port is bound and
 * records its answer for /ready, which is the existing way a misconfigured
 * instance removes itself from the load balancer.
 *
 * The verdict is cached rather than re-checked per request: the account a key
 * belongs to cannot change under a running process, and /ready is polled often
 * enough that re-asking would be a self-inflicted rate limit.
 */

let verdict: AccountVerdict = { kind: "UNVERIFIED", reason: "not checked yet" };

export function stripeAccountVerdict(): AccountVerdict {
  return verdict;
}

export async function verifyStripeAccount(): Promise<AccountVerdict> {
  const key = process.env.STRIPE_SECRET_KEY?.trim();

  if (!key) {
    verdict = classifyAccount({
      expected: EXPECTED_STRIPE_ACCOUNT,
      actual: null,
      livemode: null,
      nodeEnv: process.env.NODE_ENV
    });
    return verdict;
  }

  try {
    const stripe = new Stripe(key, { apiVersion: "2024-06-20" });
    const account = await stripe.accounts.retrieve();

    verdict = classifyAccount({
      expected: EXPECTED_STRIPE_ACCOUNT,
      actual: account.id ?? null,
      // Stripe does not put livemode on the account object, but the key's
      // prefix is authoritative and set by Stripe itself.
      livemode: key.startsWith("sk_live") || key.startsWith("rk_live"),
      nodeEnv: process.env.NODE_ENV
    });
  } catch (err) {
    // A network failure is not a mismatch. Saying otherwise would send someone
    // hunting for the wrong key during a Stripe outage.
    verdict = classifyAccount({
      expected: EXPECTED_STRIPE_ACCOUNT,
      actual: null,
      livemode: null,
      nodeEnv: process.env.NODE_ENV,
      error: String((err as Error)?.message ?? err)
    });
  }

  if (blocksPayments(verdict)) {
    console.error(`[DD84] STRIPE MISCONFIGURED  ${describeVerdict(verdict)}`);
    console.error("[DD84] /ready will report not-ready until this is fixed.");
  } else if (verdict.kind === "UNVERIFIED") {
    console.warn(`[DD84] WARNING  ${describeVerdict(verdict)}`);
  } else {
    console.log(`[DD84] ${describeVerdict(verdict)}`);
  }

  return verdict;
}
