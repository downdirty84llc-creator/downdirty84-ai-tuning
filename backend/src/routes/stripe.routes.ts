import { Router } from "express";
import Stripe from "stripe";
import { withTransaction } from "../db.js";
import { wrap } from "../util/http.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", { apiVersion: "2024-06-20" });
export const stripeRouter = Router();

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

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    const email = (session.customer_details?.email || session.customer_email || "").toLowerCase();
    if (!email) return res.json({ received: true });

    // line items help classify service
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 });
    const items = lineItems.data.map((li) => ({
      description: li.description,
      amount_total: li.amount_total,
      quantity: li.quantity
    }));

    const amount = session.amount_total || 0;
    const currency = session.currency || "usd";
    const serviceType = classifyService(amount, items);

    // The order insert and the job insert must land together or not at all.
    // A partial commit would leave a paid order whose retry is treated as a
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
      // processed. Stripe retries on any non-2xx or timeout, and previously
      // every retry created another duplicate job.
      const inserted = await tx.query<{ id: string }>(
        `
        INSERT INTO orders (user_id, stripe_event_id, stripe_session_id, customer_email, amount_total_cents, currency, items_json)
        VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
        ON CONFLICT (stripe_event_id) DO NOTHING
        RETURNING id
        `,
        [userId, event.id, session.id, email, amount, currency, jsonb(items)]
      );

      if (inserted.length === 0) return { duplicate: true as const };

      if (!serviceType) return { duplicate: false as const, jobCreated: false as const };

      await tx.query(
        `
        INSERT INTO jobs (user_id, service_type, platform, engine_family, vehicle, ecu, notes, status)
        VALUES ($1,$2,'GM',NULL,NULL,NULL,'Auto-created from Stripe payment', 'NEW')
        `,
        [userId, serviceType]
      );

      return { duplicate: false as const, jobCreated: true as const };
    });

    if (result.duplicate) {
      // Already handled. Ack so Stripe stops retrying.
      return res.json({ received: true, duplicate: true });
    }

    if (!result.jobCreated) {
      // Payment recorded but we could not tell what was bought. This needs a
      // human — it is a paid order with no work item attached to it.
      console.error(
        `[DD84] UNCLASSIFIED PAID ORDER — no job created. session=${session.id} amount=${amount} items=${jsonb(items)}`
      );
      return res.json({ received: true, jobCreated: false });
    }

    if (process.env.NODE_ENV !== "production") {
      console.log(`[DD84] Created job for ${email} service=${serviceType} session=${session.id}`);
    }
  }

  return res.json({ received: true });
}));

/**
 * Budget MVP classification by amount, then description.
 *
 * NOTE: these amounts are hardcoded and will silently stop matching the day a
 * price changes in Stripe — the failure mode is an unclassified paid order.
 * Replace with Stripe Price/Product IDs, or a price book lookup, before this
 * carries real volume.
 */
function classifyService(
  amount: number,
  items: Array<{ description?: string | null; amount_total?: number | null }>
): string | null {
  const desc = (items.map((i) => i.description).join(" | ") || "").toLowerCase();

  // Checked most-specific first. The original wrote these as sequential ifs
  // without else, so on an ambiguous match the LAST one won; the order here is
  // reversed to preserve that precedence now that each branch returns.
  if (
    amount === 39900 ||
    (desc.includes("stage 1") && (desc.includes("boost") || desc.includes("boosted")))
  ) {
    return "STAGE1_BOOST";
  }
  if (amount === 24900 || (desc.includes("stage 1") && desc.includes("na"))) return "STAGE1_NA";
  if (amount === 7900 || desc.includes("priority log")) return "PRIORITY_LOG_REVIEW";
  if (amount === 3900 || (desc.includes("log review") && !desc.includes("priority"))) {
    return "LOG_REVIEW";
  }

  const amounts = items.map((i) => i.amount_total || 0);
  if (amounts.includes(24900)) return "STAGE1_NA";
  if (amounts.includes(39900)) return "STAGE1_BOOST";
  if (amounts.includes(7900)) return "PRIORITY_LOG_REVIEW";
  if (amounts.includes(3900)) return "LOG_REVIEW";

  return null;
}

// Helper to safely stringify for jsonb parameter
function jsonb(v: any) {
  return JSON.stringify(v ?? []);
}
