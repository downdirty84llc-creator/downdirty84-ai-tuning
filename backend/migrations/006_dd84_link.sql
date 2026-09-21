CREATE TABLE dd84_link_devices (
  serial text PRIMARY KEY,
  secret_encrypted jsonb NOT NULL,
  hw_rev text NOT NULL,
  fw_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE dd84_link_ownership (
  device_serial text PRIMARY KEY REFERENCES dd84_link_devices(serial),
  user_id uuid NOT NULL REFERENCES users(id),
  assigned_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dd84_link_owner_idx ON dd84_link_ownership(user_id);
CREATE TABLE dd84_link_challenges (
  device_serial text PRIMARY KEY REFERENCES dd84_link_devices(serial),
  nonce text NOT NULL, issued_at text NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE dd84_link_auth (
  token_hash text PRIMARY KEY,
  device_serial text NOT NULL REFERENCES dd84_link_devices(serial),
  expires_at timestamptz NOT NULL
);
CREATE TABLE dd84_link_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_serial text NOT NULL REFERENCES dd84_link_devices(serial),
  vin_hash text NOT NULL, controller_id text NOT NULL,
  UNIQUE(device_serial, vin_hash, controller_id)
);
CREATE TABLE dd84_link_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_serial text NOT NULL REFERENCES dd84_link_devices(serial),
  vehicle_id uuid NOT NULL REFERENCES dd84_link_vehicles(id),
  protocol text NOT NULL,
  state jsonb NOT NULL DEFAULT '{"activeSlot":"A","slotA":"factory","slotB":null,"originalBackup":null,"lastKnownGood":null}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE dd84_link_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES dd84_link_sessions(id),
  sequence integer NOT NULL CHECK (sequence >= 0),
  samples jsonb NOT NULL CHECK(jsonb_typeof(samples) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, sequence)
);
CREATE TABLE dd84_link_packages (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES dd84_link_sessions(id),
  revision integer NOT NULL CHECK(revision > 0),
  envelope jsonb NOT NULL,
  released_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(envelope->'payload'->>'writeStrategy' = 'SIMULATION_ONLY'),
  UNIQUE(session_id, revision)
);
CREATE TABLE dd84_link_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_serial text NOT NULL REFERENCES dd84_link_devices(serial),
  session_id uuid REFERENCES dd84_link_sessions(id),
  event text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dd84_link_events_device_idx ON dd84_link_events(device_serial, id);
