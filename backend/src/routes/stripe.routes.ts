import { Router } from "express";
import Stripe from "stripe";
import { withTransaction } from "../db.js";
import { classifyCheckout, type CheckoutLine } from "../config/stripe_catalog.js";
import { normaliseFuel, normaliseInduction } from "../config/thresholds.profiles.js";
import { adminRecipients, notify } from "../services/notify/notifications.js";
import { getBrandProfile } from "../services/brand/brand_profile.js";
import { wrap } from "../util/http.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", { apiVersion: "2024-06-20" });
export const stripeRouter = Router();

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

stripeRouter.post("/webhook", wrap(async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!process.env.STRIPE_SECRET_KEY || !secret || !sig) {
    return res.status(500).send("Stripe not configured");
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig as string, secret);
  } catch (err: any) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type !== "checkout.session.completed") return res.json({ received: true });

  const session = event.data.object as Stripe.Checkout.Session;

  const email = (session.customer_details?.email || session.customer_email || "").toLowerCase();
  if (!email) {
    console.error(`[DD84] paid session with no email. session=${session.id}`);
    return res.json({ received: true });
  }

  // Expand price.product so classification can see product-level metadata and
  // recognise the other business lines on this account.
  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
    limit: 50,
    expand: ["data.price.product"]
  });
  const lines = lineItems.data.map(toCheckoutLine);
  const classification = classifyCheckout(lines);

  const amount = session.amount_total || 0;
  const currency = session.currency || "usd";

  // What the buyer told us about the car, if the checkout collected it. Left
  // null when absent — the analysis then measures against the strictest
  // thresholds and says so, rather than assuming NA gasoline.
  const meta = session.metadata ?? {};
  const fuel = normaliseFuel(meta.fuel);
  const induction = normaliseInduction(meta.induction);
  const platform = (meta.platform ?? "").trim().toUpperCase() || null;
  const vehicle = (meta.vehicle ?? "").trim() || null;

  const noteParts = [
    `Auto-created from Stripe payment ${session.id}`,
    classification.addons.length ? `Add-ons: ${classification.addons.join(", ")}` : null,
    classification.reason
  ].filter(Boolean);

  // The order insert and the job insert must land together or not at all. A
  // partial commit would leave a paid order whose retry is treated as a
  // duplicate, so the job would never be created and the payment would go
  // silently unfulfilled.
  const result = await withTransaction(async (tx) => {
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

    // The unique constraint on stripe_event_id is the idempotency guard for
    // the whole handler: zero rows back means this event was already
    // processed. Stripe retries on any non-2xx or timeout.
    const inserted = await tx.query<{ id: string }>(
      `
      INSERT INTO orders (user_id, stripe_event_id, stripe_session_id, customer_email, amount_total_cents, currency, items_json)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
      ON CONFLICT (stripe_event_id) DO NOTHING
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
      await alertOwner(email, amount, currency, classification.reason, session.id, "ADD_ON");
      return res.json({ received: true, jobCreated: false, reason: "ADDON_ONLY" });
    }
    console.error(
      `[DD84] UNCLASSIFIED PAID ORDER — no job created. session=${session.id} ` +
        `amount=${amount} reason=${classification.reason}`
    );
    await alertOwner(email, amount, currency, classification.reason, session.id, "UNCLASSIFIED");
    return res.json({ received: true, jobCreated: false, reason: "UNCLASSIFIED" });
  }

  return res.json({ received: true, jobCreated: true, jobId: result.jobId });
}));

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
  kind: "UNCLASSIFIED" | "ADD_ON"
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

  for (const admin of adminRecipients()) {
    await notify({ to: admin, subject, text: body });
  }
}
