-- Immutable, explicitly shared operator evidence. These records never release a tune.
CREATE TABLE IF NOT EXISTS troubleshooting_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  submitted_by uuid NOT NULL REFERENCES users(id),
  request_id uuid NOT NULL,
  report jsonb NOT NULL CHECK (jsonb_typeof(report) = 'object'),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, request_id)
);
CREATE INDEX IF NOT EXISTS idx_troubleshooting_job_history
  ON troubleshooting_cases(job_id, created_at DESC, id DESC);
-- Access is through authenticated backend routes. No direct browser/PostgREST policy.
ALTER TABLE troubleshooting_cases ENABLE ROW LEVEL SECURITY;
