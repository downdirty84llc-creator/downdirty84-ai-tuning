import type { AccountVerdict } from "./stripe_account.js";

export type CheckoutAvailability = {
  enabled: boolean;
  code: "READY" | "PAYMENTS_DISABLED" | "PAYMENTS_MISCONFIGURED" | "PAYMENTS_UNVERIFIED";
  message: string;
};

export function paymentCredentialsConfigured(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.STRIPE_SECRET_KEY?.trim() && env.STRIPE_WEBHOOK_SECRET?.trim());
}

/** General API readiness does not establish that a new payment is safe to take. */
export function checkoutAvailability(
  env: NodeJS.ProcessEnv,
  account: AccountVerdict
): CheckoutAvailability {
  if (!paymentCredentialsConfigured(env)) {
    return {
      enabled: false,
      code: "PAYMENTS_DISABLED",
      message: "Online payments are not switched on. Contact the shop to arrange service."
    };
  }
  if (account.kind === "WRONG_ACCOUNT" || account.kind === "WRONG_MODE") {
    return {
      enabled: false,
      code: "PAYMENTS_MISCONFIGURED",
      message: "Online payments are unavailable while the shop checks its payment setup."
    };
  }
  if (account.kind !== "OK") {
    return {
      enabled: false,
      code: "PAYMENTS_UNVERIFIED",
      message: "Online payments could not be verified. Please try again shortly or contact the shop."
    };
  }
  return { enabled: true, code: "READY", message: "Online checkout is available." };
}
