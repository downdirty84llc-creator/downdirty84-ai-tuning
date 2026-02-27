CREATE TABLE IF NOT EXISTS runs (
  run_id uuid PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status text NOT NULL,
  progress_json jsonb NOT NULL DEFAULT '{"pct":0,"stage":"QUEUED"}'::jsonb,
  errors_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  validation_json jsonb NULL,
  findings_json jsonb NULL,
  diffsets_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz NULL,
  finished_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_runs_job_created ON runs(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_job_started ON runs(job_id, started_at DESC);
