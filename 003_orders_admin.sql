-- Stripe Orders + Admin fields
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS internal_notes text NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_event_id text NOT NULL UNIQUE,
  stripe_session_id text NOT NULL,
  customer_email citext NOT NULL,
  amount_total_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  items_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
