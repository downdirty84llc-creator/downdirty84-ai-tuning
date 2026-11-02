import { Router } from "express";
import Stripe from "stripe";
import { withTransaction } from "../db.js";
import { classifyCheckout, type CheckoutLine } from "../config/stripe_catalog.js";
import {
  adminRecipients,
  notify,
  paymentReceivedEmail
} from "../services/notify/notifications.js";
import { mintMagicLink } from "../services/auth/auth.service.js";
import { SERVICE_PRICES, EXPECTED_STRIPE_ACCOUNT } from "../config/stripe_catalog.js";
import type { AccountVerdict } from "../config/stripe_account.js";
import { ensureStripeAccountVerified } from "../services/billing/account_check.js";
import { paymentCredentialsConfigured } from "../config/checkout_availability.js";
import { CHECKOUT_EVENTS, settledDetails, SettlementVerificationError } from "../services/billing/settlement.js";
import { getBrandProfile } from "../services/brand/brand_profile.js";
import { wrap } from "../util/http.js";

export type StripeWebhookClient = {
  webhooks: { constructEvent(body: Buffer, signature: string, secret: string): Stripe.Event };
  checkout: { sessions: {
    retrieve(id: string): Promise<Stripe.Checkout.Session>;
    listLineItems(id: string, params: Stripe.Checkout.SessionListLineItemsParams): Promise<{ data: Stripe.LineItem[]; has_more: boolean }>;
  } };
};

export type StripeWebhookDependencies = {
  stripe: StripeWebhookClient;
  account: () => Promise<AccountVerdict>;
  transaction: typeof withTransaction;
  mintLink: typeof mintMagicLink;
  send: typeof notify;
  recipients: () => string[];
  env: () => NodeJS.ProcessEnv;
};

/** Flatten a Stripe line item into what classification actually needs. */
function toCheckoutLine(li: Stripe.LineItem): CheckoutLine {
  const price = li.price ?? null;
  const product =
    price && typeof price.product === "object" && price.product && !("deleted" in price.product)
      ? (price.product as Stripe.Product)
      : null;

  return {
    priceId: price?.id ?? null,
    productId: product?.id ?? (typeof price?.product === "string" ? price.product : null),
    description: li.description ?? null,
    amountTotal: li.amount_total ?? null,
    quantity: li.quantity ?? null,
    // Price metadata wins over product metadata: it is the more specific of
    // the two, and it is where someone correcting a single price will put it.
    metadata: { ...(product?.metadata ?? {}), ...(price?.metadata ?? {}) }
  };
}

/** Injectable clients keep signature/HTTP/transaction tests entirely offline. */
export function createStripeRouter(overrides: Partial<StripeWebhookDependencies> = {}) {
  const stripe = overrides.stripe ?? new Stripe(process.env.STRIPE_SECRET_KEY?.trim() || "", {
    apiVersion: "2024-06-20", timeout: 10_000, maxNetworkRetries: 0
  });
  const account = overrides.account ?? ensureStripeAccountVerified;
  const transaction = overrides.transaction ?? withTransaction;
  const mintLink = overrides.mintLink ?? mintMagicLink;
  const send = overrides.send ?? notify;
  const env = overrides.env ?? (() => process.env);
  const recipients = overrides.recipients ?? (() => adminRecipients(env()));
  const stripeRouter = Router();

  stripeRouter.post("/webhook", wrap(async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const secret = env().STRIPE_WEBHOOK_SECRET?.trim();
    if (!paymentCredentialsConfigured(env()) || !secret) {
      return res.status(503).json({ error: "PAYMENTS_DISABLED" });
    }
    if (typeof sig !== "string" || !Buffer.isBuffer(req.body)) {
      return res.status(400).json({ error: "INVALID_SIGNATURE" });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, secret);
    } catch {
      return res.status(400).json({ error: "INVALID_SIGNATURE" });
    }
    if (!CHECKOUT_EVENTS.has(event.type)) return res.json({ received: true });

    const snapshot = (event.data?.object ?? {}) as Stripe.Checkout.Session;
    if (typeof event.id !== "string" || !event.id.startsWith("evt_") ||
        snapshot.object !== "checkout.session" || typeof snapshot.id !== "string" || !snapshot.id.startsWith("cs_")) {
      return res.status(400).json({ error: "INVALID_CHECKOUT_EVENT" });
    }
    const verified = await account();
    if (verified.kind !== "OK" || verified.accountId !== EXPECTED_STRIPE_ACCOUNT) {
      return res.status(503).json({ error: "PAYMENTS_UNVERIFIED" });
    }
    // Direct-account integration only. A Connect event must not be retrieved or
    // classified using another account's prices, even if its signature is valid.
    if ((event.account !== undefined && event.account !== verified.accountId) ||
        event.livemode !== verified.livemode || snapshot.livemode !== verified.livemode ||
        (env().NODE_ENV === "production" && !verified.livemode)) {
      return res.status(400).json({ error: "PAYMENT_ACCOUNT_MODE_MISMATCH" });
    }

    // Events may be duplicated or arrive out of order. The event type and its
    // embedded snapshot never authorize a job; fetch the current settled state.
    const session = await stripe.checkout.sessions.retrieve(snapshot.id);
    if (session.id !== snapshot.id || session.object !== "checkout.session" || session.livemode !== verified.livemode) {
      return res.status(503).json({ error: "PAYMENT_SESSION_MISMATCH" });
    }
    if (event.type === "checkout.session.async_payment_failed") {
      // Failure notifications never grant paid work, even when stale. A later
      // completed/succeeded notification will reconcile an authoritative paid
      // session; existing orders are neither revoked nor duplicated here.
      return res.json({
        received: true, jobCreated: false,
        reason: session.payment_status === "paid" ? "STALE_FAILURE" : "PAYMENT_FAILED"
      });
    }
    let details;
    try {
      details = settledDetails(session);
    } catch (error) {
      if (!(error instanceof SettlementVerificationError)) throw error;
      console.error(`[DD84] paid session requires review. session=${session.id}: ${error.message}`);
      return res.status(503).json({ error: "PAYMENT_REVIEW_REQUIRED" });
    }
    if (!details) {
      // A failed/unpaid notification is not a terminal idempotency marker: a
      // later settled event must still be able to create the order exactly once.
      const reason = session.mode !== "payment" ? "UNSUPPORTED_MODE" : "PAYMENT_NOT_PAID";
      return res.json({ received: true, jobCreated: false, reason });
    }
    const { email, amount, currency, fuel, induction, platform, vehicle } = details;

    // Fetch every page before classification or persistence. Never fulfill only
    // the first 50 items of a session. Bound pathological provider pagination.
    const lines: CheckoutLine[] = [];
    let cursor: string | undefined;
    const seenCursors = new Set<string>();
    for (let page = 0; ; page++) {
      if (page >= 10) throw new Error("Checkout line-item pagination exceeded its bound.");
      const batch = await stripe.checkout.sessions.listLineItems(session.id, {
        limit: 100, expand: ["data.price.product"], ...(cursor ? { starting_after: cursor } : {})
      });
      lines.push(...batch.data.map(toCheckoutLine));
      if (!batch.has_more) break;
      const next = batch.data.at(-1)?.id;
      if (!next || seenCursors.has(next)) throw new Error("Checkout line-item pagination did not advance.");
      seenCursors.add(next);
      cursor = next;
    }
    const classification = classifyCheckout(lines);

    const noteParts = [
      `Auto-created from Stripe payment ${session.id}`,
      classification.addons.length ? `Add-ons: ${classification.addons.join(", ")}` : null,
      classification.reason
    ].filter(Boolean);

    // The order insert and the job insert must land together or not at all. A
    // partial commit would leave a paid order whose retry is treated as a
    // duplicate, so the job would never be created and the payment would go
    // silently unfulfilled.
    const result = await transaction(async (tx) => {
      const users = await tx.query<{ id: string }>(
        `
        INSERT INTO users (email)
        VALUES ($1)
        ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
        RETURNING id
        `,
        [email]
      );
      const userId = users[0].id;

      // Migration 008 uniquely keys the Checkout Session as well as the event.
      // Distinct completed/async-success events must not create separate jobs.
      // ON CONFLICT without a target handles either identity atomically under
      // concurrent delivery; the losing transaction does not create a job.
      const inserted = await tx.query<{ id: string }>(
        `
        INSERT INTO orders (user_id, stripe_event_id, stripe_session_id, customer_email, amount_total_cents, currency, items_json)
        VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
        ON CONFLICT DO NOTHING
        RETURNING id
        `,
        [userId, event.id, session.id, email, amount, currency, JSON.stringify(lines)]
      );

      if (inserted.length === 0) return { duplicate: true as const };
      if (!classification.service) return { duplicate: false as const, jobId: null };

      const jobs = await tx.query<{ id: string }>(
        `
        INSERT INTO jobs (user_id, service_type, platform, engine_family, vehicle, ecu, notes, fuel, induction, status)
        VALUES ($1,$2,$3,NULL,$4,NULL,$5,$6,$7,'NEW')
        RETURNING id
        `,
        [userId, classification.service, platform, vehicle, noteParts.join(" | "), fuel, induction]
      );

      return { duplicate: false as const, jobId: jobs[0].id };
    });

    if (result.duplicate) {
      // Already handled. Ack so Stripe stops retrying.
      return res.json({ received: true, duplicate: true });
    }

    if (!result.jobId) {
      // No job, for one of three very different reasons. Only one needs a human,
      // and conflating them is how a genuinely stuck payment gets ignored among
      // routine noise.
      if (classification.nonTuning) {
        return res.json({ received: true, jobCreated: false, reason: "NON_TUNING" });
      }
      if (classification.addons.length > 0 && classification.unrecognised.length === 0) {
        console.log(`[DD84] add-on purchase by ${email}: ${classification.addons.join(", ")}`);
        await alertOwner(email, amount, currency, classification.reason, session.id, "ADD_ON", send, recipients());
        return res.json({ received: true, jobCreated: false, reason: "ADDON_ONLY" });
      }
      console.error(
        `[DD84] UNCLASSIFIED PAID ORDER — no job created. session=${session.id} ` +
          `amount=${amount} reason=${classification.reason}`
      );
      await alertOwner(email, amount, currency, classification.reason, session.id, "UNCLASSIFIED", send, recipients());
      return res.json({ received: true, jobCreated: false, reason: "UNCLASSIFIED" });
    }

    // Confirm the payment and hand them the way in. Without this the customer
    // pays and hears nothing at all: no receipt, no route into the app, and no
    // idea what to do next. Bundling the sign-in link removes the step people
    // abandon — going to find a login page and requesting one.
    //
    // After the transaction committed, so a mail failure cannot undo a paid job.
    // A job only exists when a service was recognised, but that is two branches
    // back — narrow it here rather than asserting, so a future edit that changes
    // the invariant fails to compile instead of emailing "undefined".
    const { service } = classification;
    const label = service
      ? Object.values(SERVICE_PRICES).find((e) => e.service === service)?.label ?? service
      : "your order";

    const link = await mintLink(email);
    if (link) {
      await send(
        paymentReceivedEmail({
          to: email,
          serviceLabel: label,
          amountCents: amount,
          currency,
          signInUrl: link.url,
          ttlMinutes: link.ttlMinutes
        })
      );
    }

    return res.json({ received: true, jobCreated: true, jobId: result.jobId });
  }));

  return stripeRouter;
}

export const stripeRouter = createStripeRouter();

/**
 * A paid order that produced no job needs a person, now.
 *
 * The customer has been charged, so the clock is running on work nobody has
 * been told to do. Logging it is not enough — nobody reads logs on a Sunday.
 */
async function alertOwner(
  email: string,
  amountCents: number,
  currency: string,
  reason: string,
  sessionId: string,
  kind: "UNCLASSIFIED" | "ADD_ON",
  send: typeof notify,
  recipients: string[]
): Promise<void> {
  const brand = getBrandProfile();
  const money = `${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  const subject =
    kind === "UNCLASSIFIED"
      ? `${brand.brandName} — PAID ORDER WITH NO JOB (${money})`
      : `${brand.brandName} — add-on purchased (${money})`;

  const body =
    kind === "UNCLASSIFIED"
      ? [
          `${email} paid ${money} and no job was created.`,
          "",
          `Reason: ${reason}`,
          `Stripe session: ${sessionId}`,
          "",
          "They are waiting on work nobody has been queued for. Either create the",
          "job by hand, or add the price to backend/src/config/stripe_catalog.ts",
          "(or set dd84_service metadata on it in Stripe, which needs no deploy).",
          "",
          `— ${brand.brandName}`
        ].join("\n")
      : [
          `${email} paid ${money} for an add-on.`,
          "",
          `${reason}`,
          `Stripe session: ${sessionId}`,
          "",
          "No new job was created, which is correct — an add-on applies to work",
          "that already exists. Apply it to their open job.",
          "",
          `— ${brand.brandName}`
        ].join("\n");

  for (const admin of recipients) {
    await send({ to: admin, subject, text: body });
  }
}
