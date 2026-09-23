/**
 * What DD84 sells, keyed by Stripe price ID.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  The previous version matched on the *amount paid*. Checked against the live
 *  account, that was wrong in four separate ways — every one of them costing
 *  either a lost job or a fabricated one:
 *
 *   1. Priority Log Review is $99. The code matched $79, so every Priority Log
 *      Review purchase was unclassified and no job was ever created. The
 *      customer paid and nothing happened.
 *
 *   2. $79 is a real price — the Extra Revision add-on. So buying a revision
 *      created a whole new Priority Log Review job.
 *
 *   3. $99 is ambiguous: Priority Log Review and Rush Fee are both $99. An
 *      amount cannot tell them apart, so a Rush Fee bought on its own created
 *      a Priority Log Review job.
 *
 *   4. $39 is ambiguous across business lines: Log Review is $39, and so is
 *      the Georgia Opportunity Ledger "Detailed — monthly" subscription on the
 *      same Stripe account. A newsletter subscriber would have had a tuning
 *      job created for them, every month.
 *
 *  Amounts change; price IDs do not. Nothing here matches on money.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Price IDs are not secrets — they appear in client-side checkout code — so
 * they belong in the repo where a review can see them change.
 *
 * To add a product without a deploy: set metadata `dd84_service` (for a
 * billable service) or `dd84_addon` (for an add-on) on the Stripe price or its
 * product. Metadata wins over this table, so Stripe stays the source of truth
 * once the owner starts using it.
 */

/**
 * The Stripe account every price ID below belongs to.
 *
 * Kept here rather than in env: it is not configuration, it is a property of
 * the IDs in this file. They were minted by this account and are meaningless
 * against any other, so the two have to move together or not at all.
 *
 * Checked at boot against the configured key — see stripe_account.ts. The
 * connector currently lists four accounts named "Down Dirty 84 llc", so
 * "surely it is the right one" is not a safe assumption to leave unchecked.
 */
export const EXPECTED_STRIPE_ACCOUNT = "acct_1QBl8ZINLKqe1c6g";

/** The four things that create a job. */
export type ServiceType =
  | "LOG_REVIEW"
  | "PRIORITY_LOG_REVIEW"
  | "STAGE1_NA"
  | "STAGE1_BOOST";

/** Things bought alongside a service. They never create a job on their own. */
export type AddonType = "RUSH" | "EXTRA_REVISION" | "REVISION_PACK" | "TRAVEL";

export const SERVICE_PRICES: Record<string, { service: ServiceType; label: string }> = {
  price_1Sv1NzINLKqe1c6gaCcSA90s: { service: "LOG_REVIEW", label: "Log Review" },
  price_1Sv1PwINLKqe1c6goAyNDScR: { service: "PRIORITY_LOG_REVIEW", label: "Priority Log Review" },
  price_1Sv1QfINLKqe1c6gckbURtNx: { service: "STAGE1_NA", label: "Stage 1 NA" },
  price_1Sv1RMINLKqe1c6gWBxwWuqH: { service: "STAGE1_BOOST", label: "Stage 1 Boosted" }
};

export const ADDON_PRICES: Record<string, { addon: AddonType; label: string }> = {
  price_1Sv1SrINLKqe1c6gfB6r7cHn: { addon: "RUSH", label: "Rush Fee" },
  price_1Sv1UHINLKqe1c6gijk0TkGU: { addon: "EXTRA_REVISION", label: "Extra Revision" },
  price_1Sv1W1INLKqe1c6gBHjDTx0x: { addon: "REVISION_PACK", label: "Revision Pack" },
  price_1T8MoxINLKqe1c6ggu6lQRMn: { addon: "TRAVEL", label: "Travel fee" }
};

/**
 * Other business lines on the same Stripe account.
 *
 * Listed explicitly so a payment for one of these is recognised as
 * deliberately-not-tuning rather than as something that failed to classify.
 * The difference matters: one is normal, the other should page the owner.
 */
export const NON_TUNING_PRODUCTS = new Set<string>([
  "prod_UzCm77hAdOM052", // Georgia Opportunity Ledger — Premium
  "prod_UzCmNJIUP1kEgY", // Georgia Opportunity Ledger — Detailed
  "prod_UzCmnGDe4j595N", // Georgia Opportunity Ledger — Weekly
  "prod_UzCmUxNZwISwan", // Georgia Opportunity Ledger — Free Preview
  "prod_Uqz9iKCMKDYlvE" // DD84 Performance Lab Fund Contribution
]);

/** Services ranked by how much work they are. The largest wins a mixed cart. */
const SERVICE_RANK: Record<ServiceType, number> = {
  STAGE1_BOOST: 4,
  STAGE1_NA: 3,
  PRIORITY_LOG_REVIEW: 2,
  LOG_REVIEW: 1
};

export type CheckoutLine = {
  priceId: string | null;
  productId: string | null;
  description: string | null;
  amountTotal: number | null;
  quantity: number | null;
  /** Merged metadata from the price and its product. */
  metadata: Record<string, string>;
};

export type Classification = {
  /** The job to create. Null means no job — see `reason`. */
  service: ServiceType | null;
  addons: AddonType[];
  /** Lines that are neither a known service, a known add-on, nor another line. */
  unrecognised: CheckoutLine[];
  /** True when every line belongs to a different business line. */
  nonTuning: boolean;
  reason: string;
};

function serviceFromLine(line: CheckoutLine): ServiceType | null {
  // Metadata first, so Stripe can override the table without a deploy.
  const tagged = line.metadata.dd84_service?.trim().toUpperCase();
  if (tagged && tagged in SERVICE_RANK) return tagged as ServiceType;
  if (line.priceId && SERVICE_PRICES[line.priceId]) return SERVICE_PRICES[line.priceId].service;
  return null;
}

function addonFromLine(line: CheckoutLine): AddonType | null {
  const tagged = line.metadata.dd84_addon?.trim().toUpperCase();
  const known: AddonType[] = ["RUSH", "EXTRA_REVISION", "REVISION_PACK", "TRAVEL"];
  if (tagged && (known as string[]).includes(tagged)) return tagged as AddonType;
  if (line.priceId && ADDON_PRICES[line.priceId]) return ADDON_PRICES[line.priceId].addon;
  return null;
}

/**
 * Decide what was bought.
 *
 * Never guesses. A line it does not recognise is reported as unrecognised
 * rather than being forced into the nearest match, because the cost of a wrong
 * guess here is a customer charged for one thing and queued for another.
 */
export function classifyCheckout(lines: CheckoutLine[]): Classification {
  const services: ServiceType[] = [];
  const addons: AddonType[] = [];
  const unrecognised: CheckoutLine[] = [];
  let nonTuningLines = 0;

  for (const line of lines) {
    const service = serviceFromLine(line);
    if (service) {
      services.push(service);
      continue;
    }
    const addon = addonFromLine(line);
    if (addon) {
      addons.push(addon);
      continue;
    }
    if (line.productId && NON_TUNING_PRODUCTS.has(line.productId)) {
      nonTuningLines++;
      continue;
    }
    unrecognised.push(line);
  }

  if (services.length === 0) {
    if (nonTuningLines > 0 && unrecognised.length === 0) {
      return {
        service: null,
        addons,
        unrecognised,
        nonTuning: true,
        reason: "Payment is for another DD84 business line, not tuning. No job expected."
      };
    }
    if (addons.length > 0 && unrecognised.length === 0) {
      // Buying a rush fee or a revision on its own is legitimate — it applies
      // to work that already exists. Creating a second job for it would bill
      // the customer once and queue them twice.
      return {
        service: null,
        addons,
        unrecognised,
        nonTuning: false,
        reason: `Add-on purchase (${addons.join(", ")}) with no service. Applies to an existing job.`
      };
    }
    return {
      service: null,
      addons,
      unrecognised,
      nonTuning: false,
      reason:
        unrecognised.length > 0
          ? `Unrecognised line item(s): ${unrecognised
              .map((l) => l.description ?? l.priceId ?? "unknown")
              .join(", ")}`
          : "Checkout contained no line items."
    };
  }

  // A cart with more than one service is unusual but legitimate. Take the
  // largest so the job reflects the most work owed, and say so.
  const service = services.sort((a, b) => SERVICE_RANK[b] - SERVICE_RANK[a])[0];
  return {
    service,
    addons,
    unrecognised,
    nonTuning: false,
    reason:
      services.length > 1
        ? `Multiple services purchased (${services.join(", ")}); job created for the largest.`
        : `Recognised ${service}.`
  };
}
