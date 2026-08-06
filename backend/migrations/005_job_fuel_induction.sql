-- What the car actually is, so the analysis can pick the right thresholds.
--
-- Before this, every log was judged against one set of numbers written for
-- naturally-aspirated gasoline. A 0.8 AFR lean margin is reasonable there and
-- dangerous on boost, and on E85 it does not even mean the same thing —
-- stoich is ~9.77 rather than ~14.7, so the same AFR delta is half again as
-- far lean.
--
-- Both columns are nullable on purpose. Existing jobs genuinely do not know,
-- and a NULL is honest: the engine falls back to the strictest values across
-- all profiles and reports the run as unconfirmed. Backfilling a guess would
-- turn "we do not know" into "we checked", which is the failure mode this
-- whole system is built to avoid.

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS fuel      text NULL;  -- GASOLINE | E85
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS induction text NULL;  -- NA | FORCED

-- Reject anything outside the known values rather than storing it and
-- silently failing to match a profile later.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_fuel_check') THEN
    ALTER TABLE jobs ADD CONSTRAINT jobs_fuel_check
      CHECK (fuel IS NULL OR fuel IN ('GASOLINE', 'E85'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_induction_check') THEN
    ALTER TABLE jobs ADD CONSTRAINT jobs_induction_check
      CHECK (induction IS NULL OR induction IN ('NA', 'FORCED'));
  END IF;
END $$;
