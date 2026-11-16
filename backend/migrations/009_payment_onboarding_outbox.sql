-- New orders only: intentionally no historical backfill or automatic retro-email.
CREATE TABLE payment_onboarding_outbox (
  stripe_session_id text PRIMARY KEY,
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id),
  customer_email text NOT NULL,
  service_label text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);
-- Backend DB owner/service role only. Never expose customer intent via public
-- Supabase table APIs or default PUBLIC grants; no customer-facing policy.
ALTER TABLE payment_onboarding_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON payment_onboarding_outbox FROM PUBLIC;
CREATE INDEX payment_onboarding_pending_idx ON payment_onboarding_outbox(created_at)
  WHERE delivered_at IS NULL;
