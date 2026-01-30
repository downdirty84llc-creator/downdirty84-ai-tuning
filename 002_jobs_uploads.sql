-- Jobs + Uploads for DD84 MVP
CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_type text NOT NULL, -- LOG_REVIEW | STAGE1_NA | STAGE1_BOOST | OTHER
  platform text NOT NULL,     -- GM | FORD | DODGE
  engine_family text NULL,    -- LS | LT | COYOTE | etc
  vehicle text NULL,          -- free text
  ecu text NULL,              -- P01/P59/Copperhead/GPEC...
  notes text NULL,
  status text NOT NULL DEFAULT 'NEW', -- NEW | FILES_RECEIVED | ANALYZING | COMPLETE
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at);

CREATE TABLE IF NOT EXISTS uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id uuid NULL REFERENCES jobs(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'LOG', -- LOG | TUNE | OTHER
  filename text NOT NULL,
  mime_type text NULL,
  size_bytes bigint NULL,
  storage_provider text NOT NULL, -- S3 | LOCAL
  storage_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uploads_user ON uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_uploads_job ON uploads(job_id);
