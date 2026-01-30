import { Router } from "express";
import Stripe from "stripe";
import { query } from "../db.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", { apiVersion: "2024-06-20" });
export const stripeRouter = Router();

stripeRouter.post("/webhook", async (req, res) => {
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

    // ensure user exists
    const users = await query<{ id: string }>(
      `
      INSERT INTO users (email)
      VALUES ($1)
      ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
      RETURNING id
      `,
      [email]
    );
    const userId = users[0].id;

    // line items help classify service
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 });
    const items = lineItems.data.map((li) => ({
      description: li.description,
      amount_total: li.amount_total,
      quantity: li.quantity
    }));

    const amount = session.amount_total || 0;
    const currency = session.currency || "usd";

    await query(
      `
      INSERT INTO orders (user_id, stripe_event_id, stripe_session_id, customer_email, amount_total_cents, currency, items_json)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
      ON CONFLICT (stripe_event_id) DO NOTHING
      `,
      [userId, event.id, session.id, email, amount, currency, jsonb(items)]
    );

    const desc = (items.map((i) => i.description).join(" | ") || "").toLowerCase();
    let serviceType: string | null = null;

    // Budget MVP: classify by amount/description
    if (amount == 3900 || (desc.includes("log review") && !desc.includes("priority"))) serviceType = "LOG_REVIEW";
    if (amount == 7900 || desc.includes("priority log")) serviceType = "PRIORITY_LOG_REVIEW";
    if (amount == 24900 || (desc.includes("stage 1") && desc.includes("na"))) serviceType = "STAGE1_NA";
    if (amount == 39900 || (desc.includes("stage 1") && (desc.includes("boost") || desc.includes("boosted"))))
      serviceType = "STAGE1_BOOST";

    if (!serviceType) {
      const amounts = items.map((i) => i.amount_total || 0);
      if (amounts.includes(24900)) serviceType = "STAGE1_NA";
      else if (amounts.includes(39900)) serviceType = "STAGE1_BOOST";
      else if (amounts.includes(7900)) serviceType = "PRIORITY_LOG_REVIEW";
      else if (amounts.includes(3900)) serviceType = "LOG_REVIEW";
    }

    if (!serviceType) return res.json({ received: true });

    await query(
      `
      INSERT INTO jobs (user_id, service_type, platform, engine_family, vehicle, ecu, notes, status)
      VALUES ($1,$2,'GM',NULL,NULL,NULL,'Auto-created from Stripe payment', 'NEW')
      `,
      [userId, serviceType]
    );

    if (process.env.NODE_ENV !== "production") {
      console.log(`[DD84] Created job for ${email} service=${serviceType} session=${session.id}`);
    }
  }

  return res.json({ received: true });
});

// Helper to safely stringify for jsonb parameter
function jsonb(v: any) {
  return JSON.stringify(v ?? []);
}
