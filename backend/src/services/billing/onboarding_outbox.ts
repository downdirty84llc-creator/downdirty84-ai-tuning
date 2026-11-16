import { withTransaction } from "../../db.js";
import { mintMagicLink } from "../auth/auth.service.js";
import { notify, paymentReceivedEmail } from "../notify/notifications.js";

/** Intent has no bearer token. A fresh short-lived link is minted per attempt. */
export async function deliverOnboarding(sessionId: string, deps: {
  transaction: typeof withTransaction;
  mintLink: typeof mintMagicLink;
  send: typeof notify;
}): Promise<void> {
  await deps.transaction(async tx => {
    // Serialize duplicate callbacks until delivery commits. An error rolls back
    // delivered_at but never the separately committed paid order/job/intent.
    const rows = await tx.query<{
      customer_email: string; service_label: string; amount_cents: number;
      currency: string; delivered_at: string | null;
    }>(`SELECT customer_email, service_label, amount_cents, currency, delivered_at
        FROM payment_onboarding_outbox WHERE stripe_session_id=$1 FOR UPDATE`, [sessionId]);
    const intent = rows[0];
    // Historical orders deliberately have no intent. Do not backfill on retries.
    if (!intent || intent.delivered_at) return;
    const link = await deps.mintLink(intent.customer_email, tx.query);
    if (!link) throw new Error("ONBOARDING_LINK_UNAVAILABLE");
    const sent = await deps.send(paymentReceivedEmail({
      to: intent.customer_email, serviceLabel: intent.service_label,
      amountCents: intent.amount_cents, currency: intent.currency,
      signInUrl: link.url, ttlMinutes: link.ttlMinutes
    }));
    if (!sent.ok) throw new Error("ONBOARDING_DELIVERY_FAILED");
    // At-least-once: a crash after the provider accepts mail but before commit
    // can send another message. Never claim exactly-once external delivery.
    await tx.query(`UPDATE payment_onboarding_outbox SET delivered_at=now()
                    WHERE stripe_session_id=$1`, [sessionId]);
  });
}
