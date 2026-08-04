-- Analysis runs and diffsets.
--
-- These previously lived in a process-local Map, which meant (a) every run was
-- lost on restart and incoherent across more than one instance, and (b) lookup
-- by id scanned every user's runs with no ownership check. Both are fixed by
-- persisting them with an owning user_id.

CREATE TABLE IF NOT EXISTS runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'QUEUED',      -- QUEUED | RUNNING | SUCCEEDED | FAILED | CANCELED
  progress_pct  integer NOT NULL DEFAULT 0,
  progress_stage text NOT NULL DEFAULT 'UPLOAD_VERIFIED',
  errors_json     jsonb NOT NULL DEFAULT '[]'::jsonb,
  validation_json jsonb NULL,
  findings_json   jsonb NULL,
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_runs_job ON runs(job_id);
CREATE INDEX IF NOT EXISTS idx_runs_user ON runs(user_id);
CREATE INDEX IF NOT EXISTS idx_runs_job_started ON runs(job_id, started_at DESC);

CREATE TABLE IF NOT EXISTS diffsets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  job_id        uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          text NULL,
  source        text NULL,
  generator     text NOT NULL,
  payload_json  jsonb NOT NULL,

  -- Owner-release gate. A diffset is a proposed calibration change; nothing
  -- reaches the customer until a human with admin rights releases it.
  -- DRAFT -> OWNER_REVIEW -> RELEASED, or -> REJECTED.
  release_status text NOT NULL DEFAULT 'OWNER_REVIEW',
  released_by   uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  released_at   timestamptz NULL,
  release_note  text NULL,

  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT diffsets_release_status_chk
    CHECK (release_status IN ('DRAFT', 'OWNER_REVIEW', 'RELEASED', 'REJECTED')),

  -- A release must record who and when. Prevents a partially-written release
  -- from ever looking like a valid one.
  CONSTRAINT diffsets_release_evidence_chk
    CHECK (
      (release_status <> 'RELEASED')
      OR (released_by IS NOT NULL AND released_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_diffsets_run ON diffsets(run_id);
CREATE INDEX IF NOT EXISTS idx_diffsets_job ON diffsets(job_id);
CREATE INDEX IF NOT EXISTS idx_diffsets_user ON diffsets(user_id);
CREATE INDEX IF NOT EXISTS idx_diffsets_release ON diffsets(release_status);
