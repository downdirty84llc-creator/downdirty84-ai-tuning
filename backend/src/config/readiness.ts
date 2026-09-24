import type { EnvReport } from "./env.js";
import { blocksPayments, describeVerdict, type AccountVerdict } from "./stripe_account.js";

/**
 * Whether this instance should be serving traffic.
 *
 * Extracted from the /ready handler so the decision can be tested without
 * booting a server or holding a Stripe key. The property that matters — a key
 * for the wrong Stripe account must take the instance out of the load
 * balancer — is the entire point of the account check, and it was previously
 * three inline lines with nothing asserting them.
 */
export function computeReadiness(
  env: EnvReport,
  stripe: AccountVerdict
): { ready: boolean; configErrors: string[] } {
  const stripeBlocks = blocksPayments(stripe);
  return {
    ready: env.ok && !stripeBlocks,
    // Appended rather than replacing: an instance can be wrong about more than
    // one thing, and whoever reads this needs all of it, not the first item.
    configErrors: stripeBlocks ? [...env.errors, describeVerdict(stripe)] : env.errors
  };
}
