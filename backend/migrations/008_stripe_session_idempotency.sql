-- A Checkout Session can emit distinct completed / async-success events.
-- One paid session must create at most one order and its associated job.
-- Never delete or silently merge historical orders to force this invariant.
DO $$
BEGIN
  IF EXISTS (
    SELECT stripe_session_id
    FROM orders
    GROUP BY stripe_session_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Cannot enforce Stripe session idempotency: duplicate orders already exist.',
      HINT = 'Review SELECT stripe_session_id, count(*) FROM orders GROUP BY stripe_session_id HAVING count(*) > 1; reconcile affected orders and jobs manually before retrying. No rows were changed.';
  END IF;
END
$$;

CREATE UNIQUE INDEX orders_stripe_session_id_unique ON orders(stripe_session_id);
