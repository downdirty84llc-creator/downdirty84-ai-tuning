// Run against a disposable database with all migrations applied. No external services.
import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import express from "express";
import cookieParser from "cookie-parser";
import { pool } from "../dist/db.js";
import { loadUserFromSession } from "../dist/middleware/session.js";
import { dd84LinkRouter } from "../dist/routes/dd84-link.routes.js";
import { sha256, deviceProof } from "../dist/services/dd84-link/protocol.js";
process.env.ADMIN_EMAILS = "link-admin@dd84.test";
process.env.DD84_LINK_SIGNING_PRIVATE_KEY = generateKeyPairSync(
  "ed25519",
).privateKey.export({ type: "pkcs8", format: "pem" });
process.env.DD84_LINK_DEVICE_KEY = randomBytes(32).toString("hex");
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(loadUserFromSession);
app.use("/api/v1/dd84-link", dd84LinkRouter);
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "internal" });
});
const server = await new Promise((resolve) => {
  const s = app.listen(0, "127.0.0.1", () => resolve(s));
});
const base = `http://127.0.0.1:${server.address().port}/api/v1/dd84-link`;
const users = [];
let serial;
async function call(path, { method = "POST", cookie, token, body } = {}) {
  const r = await fetch(base + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie: `dd84_session=${cookie}` } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}
try {
  for (const email of [
    "link-admin@dd84.test",
    `link-owner-${randomUUID()}@dd84.test`,
    `link-other-${randomUUID()}@dd84.test`,
  ]) {
    const {
      rows: [u],
    } = await pool.query(
      "INSERT INTO users(email) VALUES($1) ON CONFLICT(email) DO UPDATE SET email=EXCLUDED.email RETURNING id",
      [email],
    );
    const token = randomBytes(32).toString("hex");
    await pool.query(
      "INSERT INTO sessions(user_id,session_hash,expires_at) VALUES($1,$2,now()+interval '1 day')",
      [u.id, sha256(token)],
    );
    users.push({ ...u, token });
  }
  const [admin, owner, other] = users;
  assert.equal((await call("", { method: "GET" })).status, 401);
  assert.equal(
    (await call("/devices", { cookie: owner.token, body: {} })).status,
    403,
  );
  serial = `DD84-${randomBytes(8).toString("hex").toUpperCase()}`;
  const enrollment = await call("/devices", {
    cookie: admin.token,
    body: { serial, ownerId: owner.id, hwRev: "A0", fwVersion: "0.1.0-dev" },
  });
  assert.equal(enrollment.status, 201, JSON.stringify(enrollment));
  const secret = enrollment.body.secret;
  const {
    rows: [stored],
  } = await pool.query(
    "SELECT secret_encrypted FROM dd84_link_devices WHERE serial=$1",
    [serial],
  );
  assert.ok(!JSON.stringify(stored).includes(secret));
  const c = await call("/device/challenge", { body: { serial } });
  assert.equal(c.status, 200);
  assert.equal(
    (await call("/device/challenge", { body: { serial } })).status,
    429,
  );
  const authBody = {
    serial,
    proof: deviceProof(secret, serial, c.body),
    device: { hwRev: "A0", fwVersion: "0.1.0-dev" },
  };
  const auth = await call("/device/authenticate", { body: authBody });
  assert.equal(auth.status, 200);
  assert.equal(
    (await call("/device/authenticate", { body: authBody })).status,
    401,
  );
  const token = auth.body.token;
  assert.equal(
    (
      await call("/sessions/" + randomUUID() + "/calibrations", {
        token,
        body: {},
      })
    ).status,
    401,
  );
  const vin = "1GCHK23U05F123456",
    controllerId = "SIM-ECM-01";
  assert.equal(
    (
      await call("/vehicle/session", {
        cookie: other.token,
        body: { serial, vin, controllerId },
      })
    ).status,
    404,
  );
  const opened = await call("/vehicle/session", {
    token,
    body: { vin, controllerId },
  });
  assert.equal(opened.status, 201, JSON.stringify(opened));
  const sessionId = opened.body.id;
  const path = `/sessions/${sessionId}`;
  assert.equal(
    (
      await call("/logs", {
        cookie: other.token,
        body: {
          vehicleSessionId: sessionId,
          sequence: 0,
          samples: [{ rpm: 850 }],
        },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await call("/logs", {
        token,
        body: {
          vehicleSessionId: sessionId,
          sequence: 0,
          samples: [{ rpm: 850, t: 0 }],
        },
      })
    ).status,
    202,
  );
  assert.equal(
    (
      await call("/logs", {
        token,
        body: {
          vehicleSessionId: sessionId,
          sequence: 0,
          samples: [{ rpm: 850 }],
        },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call("/logs", {
        token,
        body: {
          vehicleSessionId: sessionId,
          sequence: 1,
          samples: [{ rpm: "bad" }],
        },
      })
    ).status,
    400,
  );
  assert.equal(
    (await call(path + "/calibrations", { cookie: owner.token, body: {} }))
      .status,
    403,
  );
  const released = await call(path + "/calibrations", {
    cookie: admin.token,
    body: {},
  });
  assert.equal(released.status, 201);
  const envelope = released.body,
    packageId = envelope.payload.calibrationId;
  const state = {
    vin,
    controllerId,
    batteryVoltage: 13.5,
    engineRunning: false,
    vehicleSpeedKph: 0,
    backupCreated: true,
    transportStable: true,
    hwRev: "A0",
    fwVersion: "0.1.0-dev",
  };
  const install = (patch = {}) =>
    call(path + "/install", { token, body: { packageId, state, ...patch } });
  assert.equal((await install()).status, 409, "missing persisted backup");
  assert.equal(
    (await call(path + "/recover", { token, body: {} })).status,
    409,
  );
  assert.equal((await call(path + "/backup", { token, body: {} })).status, 200);
  for (const patch of [
    { batteryVoltage: 11 },
    { vehicleSpeedKph: null },
    { engineRunning: true },
    { vin: "1GCHK23U05F123457" },
    { controllerId: "other" },
    { transportStable: false },
    { fwVersion: "unknown" },
    { hwRev: "B" },
  ])
    assert.equal(
      (await install({ state: { ...state, ...patch } })).status,
      409,
      JSON.stringify(patch),
    );
  const tampered = structuredClone(envelope);
  tampered.payload.controllerId = "other";
  assert.equal((await install({ envelope: tampered })).status, 409);
  assert.equal(
    (await install({ envelope: { payload: envelope.payload } })).status,
    409,
  );
  const installed = await install();
  assert.equal(installed.status, 200);
  assert.equal(installed.body.state.activeSlot, "B");
  const recovered = await call(path + "/recover", { token, body: {} });
  assert.equal(recovered.status, 200);
  assert.equal(recovered.body.state.activeSlot, "A");
  assert.equal(recovered.body.state.slotA, "factory");
  assert.equal(recovered.body.state.originalBackup, "factory");
  const overview = await call("", { method: "GET", cookie: owner.token });
  assert.equal(overview.status, 200);
  assert.equal(overview.body.logs.length, 1);
  assert.equal(overview.body.packages.length, 1);
  assert.ok(overview.body.events.some((e) => e.event === "flash_blocked"));
  assert.ok(overview.body.events.some((e) => e.event === "recovery_simulated"));
  assert.ok(!JSON.stringify(overview.body).includes(secret));
  assert.equal(overview.body.packages[0].envelope, undefined);
  const hidden = await call("", { method: "GET", cookie: other.token });
  assert.equal(hidden.body.devices.length, 0);
  assert.equal(hidden.body.sessions.length, 0);
  await pool.query(
    "UPDATE dd84_link_auth SET expires_at=now()-interval '1 second' WHERE device_serial=$1",
    [serial],
  );
  assert.equal(
    (
      await call("/logs", {
        token,
        body: {
          vehicleSessionId: sessionId,
          sequence: 2,
          samples: [{ rpm: 800 }],
        },
      })
    ).status,
    401,
  );
  // Expired challenge and invalid proofs are consumed even though auth fails.
  const expired = await call("/device/challenge", { body: { serial } });
  assert.equal(expired.status, 200);
  await pool.query(
    "UPDATE dd84_link_challenges SET expires_at=now()-interval '1 second' WHERE device_serial=$1",
    [serial],
  );
  assert.equal(
    (
      await call("/device/authenticate", {
        body: { ...authBody, proof: deviceProof(secret, serial, expired.body) },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT 1 FROM dd84_link_challenges WHERE device_serial=$1",
        [serial],
      )
    ).rowCount,
    0,
  );
  console.log(
    "DD84 LINK integration: enrollment, authentication, replay/expiry, ownership, logs, admin signing, tamper/safety rejection, A/B install, recovery, audit and metadata privacy PASS",
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
}
