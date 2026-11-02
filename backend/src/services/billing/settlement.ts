import type Stripe from "stripe";
import { normaliseFuel, normaliseInduction } from "../../config/thresholds.profiles.js";

export const CHECKOUT_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed"
]);

export class SettlementVerificationError extends Error {}

export type SettledDetails = {
  email: string;
  amount: number;
  currency: string;
  fuel: ReturnType<typeof normaliseFuel>;
  induction: ReturnType<typeof normaliseInduction>;
  platform: string;
  vehicle: string | null;
};

/**
 * A webhook event is a notification, not proof of settlement. These facts must
 * come from a fresh Session retrieval using the verified account's API key.
 * Missing fuel/induction stays unknown; malformed supplied metadata never
 * silently becomes an owner-confirmed profile.
 */
export function settledDetails(session: Stripe.Checkout.Session): SettledDetails | null {
  if (!["payment", "subscription", "setup"].includes(session.mode)) {
    throw new SettlementVerificationError("Checkout Session has an unknown mode.");
  }
  if (session.mode !== "payment") return null;
  if (!["paid", "unpaid", "no_payment_required"].includes(session.payment_status)) {
    throw new SettlementVerificationError("Checkout Session has an unknown payment status.");
  }
  if (!["open", "complete", "expired"].includes(session.status ?? "")) {
    throw new SettlementVerificationError("Checkout Session has an unknown lifecycle status.");
  }
  if (session.payment_status !== "paid") return null;
  if (session.status !== "complete") {
    throw new SettlementVerificationError("Paid Checkout Session is not complete.");
  }

  const email = (session.customer_details?.email ?? session.customer_email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new SettlementVerificationError("Paid Checkout Session has no usable customer email.");
  }
  const amount = session.amount_total;
  if (amount === null || !Number.isSafeInteger(amount) || amount <= 0 || amount > 2_147_483_647) {
    throw new SettlementVerificationError("Paid Checkout Session has an unsupported total.");
  }
  const currency = session.currency;
  if (typeof currency !== "string" || !/^[a-z]{3}$/.test(currency)) {
    throw new SettlementVerificationError("Paid Checkout Session has an unsupported currency.");
  }

  const metadata = session.metadata ?? {};
  if (typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new SettlementVerificationError("Paid Checkout Session has invalid metadata.");
  }
  const field = (name: string, maximum: number) => {
    const value = metadata[name];
    if (value === undefined || value === "") return null;
    if (typeof value !== "string" || value.trim().length > maximum) {
      throw new SettlementVerificationError(`Paid Checkout Session has invalid ${name} metadata.`);
    }
    return value.trim() || null;
  };
  const rawFuel = field("fuel", 40);
  const rawInduction = field("induction", 40);
  const fuel = normaliseFuel(rawFuel);
  const induction = normaliseInduction(rawInduction);
  if ((rawFuel && !fuel) || (rawInduction && !induction)) {
    throw new SettlementVerificationError("Paid Checkout Session has unsupported fuel/induction metadata.");
  }
  return {
    email, amount, currency, fuel, induction,
    // jobs.platform is NOT NULL; UNKNOWN states the absence rather than
    // guessing a controller. Fuel/induction remain null and unconfirmed.
    platform: field("platform", 40)?.toUpperCase() ?? "UNKNOWN",
    vehicle: field("vehicle", 200)
  };
}
