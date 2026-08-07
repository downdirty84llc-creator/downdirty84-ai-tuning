import { Router } from "express";
import Stripe from "stripe";
import {
  SERVICE_PRICES,
  ADDON_PRICES,
  type AddonType,
  type ServiceType
} from "../config/stripe_catalog.js";
import { normaliseFuel, normaliseInduction } from "../config/thresholds.profiles.js";
import { badRequest, wrap } from "../util/http.js";

/**
 * Starting a payment.
 *
 * Until this existed the webhook could handle a completed checkout but nothing
 * could create one, so the app had no way to take money at all — you had to
 * send someone a Stripe Payment Link by hand.
 *
 * The rule that shapes this file: **the client never names a price.** It names
 * a service, and the server looks up which Stripe price that is. Accepting a
 * price ID from the browser would let anyone check out against any price on
 * the account — including the $1-minimum Performance Lab Fund price, or a
 * price from a different business line — and the webhook would then dutifully
 * create a $399 job for it.
 */

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", { apiVersion: "2024-06-20" });
export const checkoutRouter = Router();

/** Reverse index: service → the price that sells it. */
const PRICE_FOR_SERVICE = new Map<ServiceType, string>(
  Object.entries(SERVICE_PRICES).map(([priceId, e]) => [e.service, priceId])
);
const PRICE_FOR_ADDON = new Map<AddonType, string>(
  Object.entries(ADDON_PRICES).map(([priceId, e]) => [e.addon, priceId])
);

/**
 * Live amounts, read from Stripe and cached briefly.
 *
 * The amounts are deliberately NOT stored in the repo. A hardcoded price list
 * is the same bug that made the webhook mis-classify payments for months, only
 * pointed at customers: a page advertising $79 while Stripe charges $99 is a
 * complaint, a chargeback, or a refund, and it drifts silently the moment a
 * price changes in the dashboard.
 *
 * When Stripe cannot be reached the amount is omitted rather than guessed. The
 * page then says the price is unavailable, which is recoverable. Showing a
 * stale number is not.
 */
type PriceInfo = { unitAmount: number | null; currency: string };
let priceCache: { at: number; prices: Record<string, PriceInfo> } | null = null;
const PRICE_TTL_MS = 5 * 60_000;

async function livePrices(): Promise<Record<string, PriceInfo> | null> {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (priceCache && Date.now() - priceCache.at < PRICE_TTL_MS) return priceCache.prices;

  try {
    const wanted = [...Object.keys(SERVICE_PRICES), ...Object.keys(ADDON_PRICES)];
    const fetched = await Promise.all(wanted.map((id) => stripe.prices.retrieve(id)));
    const prices: Record<string, PriceInfo> = {};
    for (const p of fetched) {
      prices[p.id] = { unitAmount: p.unit_amount, currency: p.currency };
    }
    priceCache = { at: Date.now(), prices };
    return prices;
  } catch (err) {
    console.error(`[DD84] could not read prices from Stripe: ${(err as Error)?.message ?? err}`);
    // Serve a stale cache rather than nothing — it was correct minutes ago,
    // and an empty catalogue looks like the business is closed.
    return priceCache?.prices ?? null;
  }
}

/**
 * GET /api/v1/catalog
 *
 * What is for sale, so the frontend does not hardcode a second copy of the
 * price list that can drift from the one the webhook trusts.
 */
checkoutRouter.get("/catalog", wrap(async (_req, res) => {
  const prices = await livePrices();
  const decorate = (priceId: string) => {
    const p = prices?.[priceId];
    return {
      priceId,
      // null means "we could not confirm this with Stripe just now", which the
      // page must render as unavailable rather than as free.
      unitAmount: p?.unitAmount ?? null,
      currency: p?.currency ?? "usd"
    };
  };

  return res.json({
    pricesLive: prices !== null,
    services: Object.entries(SERVICE_PRICES).map(([priceId, e]) => ({
      service: e.service,
      label: e.label,
      ...decorate(priceId)
    })),
    addons: Object.entries(ADDON_PRICES).map(([priceId, e]) => ({
      addon: e.addon,
      label: e.label,
      ...decorate(priceId)
    }))
  });
}));

/**
 * POST /api/v1/checkout
 * body: { service, addons?, vehicle?, platform?, fuel?, induction?, email? }
 *
 * Deliberately open to anonymous callers: the customer pays first and the
 * webhook creates their account from the email Stripe collected. Requiring a
 * login before payment adds a step that loses sales and buys nothing — the
 * money is what proves intent, not a session cookie.
 */
checkoutRouter.post("/checkout", wrap(async (req, res) => {
  // Validate before checking configuration, not after.
  //
  // The other order means a malformed request returns 503 on a deployment
  // without Stripe and 400 on one with it — so the validation branches are
  // only ever exercised where Stripe happens to be configured, which is not
  // CI. A bad request is a bad request regardless of what this instance can
  // fulfil.
  const body = req.body ?? {};
  const service = String(body.service ?? "").trim().toUpperCase() as ServiceType;
  const priceId = PRICE_FOR_SERVICE.get(service);
  if (!priceId) {
    return badRequest(res, "Unknown service.", {
      service: body.service ?? null,
      allowed: [...PRICE_FOR_SERVICE.keys()]
    });
  }

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    { price: priceId, quantity: 1 }
  ];

  // Add-ons are looked up the same way, and anything unrecognised is refused
  // rather than dropped — a customer who thought they were buying a rush fee
  // must not silently get a checkout without one.
  const requested: unknown = body.addons;
  if (requested !== undefined) {
    if (!Array.isArray(requested)) return badRequest(res, "addons must be an array.");
    for (const raw of requested) {
      const addon = String(raw).trim().toUpperCase() as AddonType;
      const addonPrice = PRICE_FOR_ADDON.get(addon);
      if (!addonPrice) {
        return badRequest(res, "Unknown add-on.", {
          addon: raw,
          allowed: [...PRICE_FOR_ADDON.keys()]
        });
      }
      lineItems.push({ price: addonPrice, quantity: 1 });
    }
  }

  // The request is well-formed. Only now does it matter whether this instance
  // can actually take money.
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(503).json({
      error: "PAYMENTS_DISABLED",
      message: "Payments are not configured on this deployment."
    });
  }

  const appBase = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");

  // Carried into the webhook, which writes them onto the job. Fuel and
  // induction pick the safety-threshold profile, so collecting them here is
  // what keeps a boosted E85 build from being judged as NA gasoline.
  const metadata: Record<string, string> = {};
  const fuel = normaliseFuel(body.fuel);
  const induction = normaliseInduction(body.induction);
  if (fuel) metadata.fuel = fuel;
  if (induction) metadata.induction = induction;
  if (body.platform) metadata.platform = String(body.platform).trim().toUpperCase().slice(0, 40);
  if (body.vehicle) metadata.vehicle = String(body.vehicle).trim().slice(0, 200);

  const email =
    req.user?.email ?? (typeof body.email === "string" && body.email.includes("@") ? body.email : undefined);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: lineItems,
    customer_email: email,
    // Stripe collects the email when we do not already know it. The webhook
    // keys the customer account off it, so it is not optional.
    // Not /dashboard: the buyer is not signed in yet, so that page would greet
    // a successful payment with "You are not logged in".
    success_url: `${appBase}/paid?session={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appBase}/buy?checkout=cancelled`,
    metadata,
    // Same metadata on the PaymentIntent, so it is visible on the payment in
    // the Stripe dashboard and not only on the session.
    payment_intent_data: { metadata }
  });

  return res.json({ checkoutUrl: session.url, sessionId: session.id });
}));
