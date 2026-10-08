import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiFetch, apiPost } from "./client";
import LinkConnection from "./LinkConnection";
import CaptureFileReview from "./CaptureFileReview";

type Device = {
  serial: string;
  hw_rev: string;
  fw_version: string;
  user_id: string;
};
type Session = {
  id: string;
  device_serial: string;
  controller_id: string;
  vin_hash: string;
  state: {
    activeSlot: string;
    originalBackup: string | null;
    lastKnownGood: string | null;
  };
};
type Overview = {
  admin: boolean;
  devices: Device[];
  sessions: Session[];
  logs: {
    id: string;
    session_id: string;
    sequence: number;
    sample_count: number;
  }[];
  packages: {
    id: string;
    session_id: string;
    revision: number;
    payload: { expiresAt: string };
  }[];
  events: { id: string; event: string; created_at: string }[];
};
const base = "/api/v1/dd84-link";
export default function DD84Link() {
  const [data, setData] = useState<Overview | null>(null);
  const [selected, setSelected] = useState("");
  const [serial, setSerial] = useState("");
  const [vin, setVin] = useState("");
  const [controller, setController] = useState("SIM-ECM-01");
  const [owner, setOwner] = useState("");
  const [newSerial, setNewSerial] = useState("");
  const [secret, setSecret] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [voltage, setVoltage] = useState("");
  const [speed, setSpeed] = useState("");
  const [engineOff, setEngineOff] = useState(false);
  const [stable, setStable] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [checks, setChecks] = useState<Record<string, boolean> | null>(null);
  const session = data?.sessions.find((s) => s.id === selected);
  const device = data?.devices.find((d) => d.serial === session?.device_serial);
  const packages =
    data?.packages.filter((p) => p.session_id === selected) ?? [];
  async function refresh() {
    const result = await apiGet<Overview>(base);
    setData(result);
    setSerial((old) => old || result.devices[0]?.serial || "");
    setSelected((old) => old || result.sessions[0]?.id || "");
  }
  useEffect(() => {
    refresh().catch((e) => setMessage(e.message));
  }, []);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    setChecks(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function install() {
    if (!session || !device || !packages[0]) return;
    if (!voltage.trim() || !speed.trim() || !vin.trim())
      throw new Error(
        "Enter VIN, voltage and vehicle speed before checking safety.",
      );
    const response = await apiFetch(`${base}/sessions/${session.id}/install`, {
      method: "POST",
      body: JSON.stringify({
        packageId: packages[0].id,
        state: {
          vin,
          controllerId: controller,
          batteryVoltage: Number(voltage),
          vehicleSpeedKph: Number(speed),
          engineRunning: !engineOff,
          transportStable: stable,
          backupCreated: !!session.state.originalBackup,
          hwRev: device.hw_rev,
          fwVersion: device.fw_version,
        },
      }),
    }).catch(async (e) => {
      // apiFetch throws on a blocked install; fetch the structured checks through
      // the shared API helper's error body when available.
      if ((e as any).details?.checks) {
        setChecks((e as any).details.checks);
        setMessage("Simulation blocked by safety checks.");
        return null;
      }
      throw e;
    });
    if (response) {
      const r = await response.json();
      setChecks(r.checks);
      setMessage("Calibration installed in simulation.");
    }
  }
  return (
    <main className="container">
      <nav className="nav">
        <strong className="brand">DD84 LINK</strong>
        <div className="row">
          <Link to="/dashboard">Dashboard</Link>
          {data?.admin && <Link to="/admin">Admin</Link>}
          <Link to="/login">Sign in</Link>
        </div>
      </nav>
      <section className="card">
        <h1>Rev-A device workspace</h1>
        <p>
          <strong>Simulation only.</strong> No real ECU writes. The displayed
          backups and slots represent simulator state.
        </p>
        <p className="small">
          Real controller support requires bench-tested interruption recovery.
        </p>
      </section>
      <p role="status" aria-live="polite">
        {busy ? "Working…" : message}
      </p>
      {!data ? (
        <p>Sign in to view your devices and sessions.</p>
      ) : (
        <>
          <LinkConnection />
          <CaptureFileReview />
          <button
            className="secondary"
            disabled={busy}
            onClick={() => run(refresh)}
          >
            Refresh status
          </button>
          {data.admin && (
            <section className="card link-section">
              <h2>Enroll device · tuner/admin</h2>
              <p className="small">
                Assign a Rev-A device to an existing customer account.
                Provisioning secret is displayed once.
              </p>
              <label>
                Device serial
                <input
                  value={newSerial}
                  onChange={(e) => setNewSerial(e.target.value)}
                  placeholder="DD84-LINK-A0-000001"
                />
              </label>
              <label>
                Customer account UUID
                <input
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                />
              </label>
              <button
                disabled={busy || !owner || !newSerial}
                onClick={() =>
                  run(async () => {
                    const r = await apiPost<{ secret: string }>(
                      `${base}/devices`,
                      {
                        serial: newSerial,
                        ownerId: owner,
                        hwRev: "A0",
                        fwVersion: "0.1.0-dev",
                      },
                    );
                    setSecret(r.secret);
                    setMessage(
                      "Device enrolled. Save the provisioning secret securely.",
                    );
                  })
                }
              >
                Enroll Rev-A device
              </button>
              {secret && (
                <div>
                  <p>
                    One-time device secret:{" "}
                    <code style={{ overflowWrap: "anywhere" }}>{secret}</code>
                  </p>
                  <button className="secondary" onClick={() => setSecret("")}>
                    Hide secret
                  </button>
                </div>
              )}
            </section>
          )}
          <section className="card link-section">
            <h2>Your devices</h2>
            {!data.devices.length && (
              <p>
                No devices assigned yet. Ask your tuner to enroll your device.
              </p>
            )}
            {data.devices.map((d) => (
              <p key={d.serial}>
                <strong>{d.serial}</strong> · {d.hw_rev} · {d.fw_version}
                {data.admin && (
                  <span className="small"> · Owner {d.user_id}</span>
                )}
              </p>
            ))}
          </section>
          <section className="card link-section">
            <h2>Vehicle session</h2>
            <label>
              Device
              <select
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
              >
                <option value="">Choose device</option>
                {data.devices.map((d) => (
                  <option key={d.serial}>{d.serial}</option>
                ))}
              </select>
            </label>
            <label>
              Vehicle VIN (also used for installation safety check)
              <input
                maxLength={17}
                value={vin}
                onChange={(e) => setVin(e.target.value.toUpperCase())}
              />
            </label>
            <label>
              Controller identity
              <input
                value={controller}
                onChange={(e) => setController(e.target.value)}
              />
            </label>
            <button
              disabled={busy || !serial || vin.length !== 17}
              onClick={() =>
                run(async () => {
                  const s = await apiPost<Session>(`${base}/vehicle/session`, {
                    serial,
                    vin,
                    controllerId: controller,
                  });
                  setSelected(s.id);
                  setMessage("Vehicle session created.");
                })
              }
            >
              Create simulation session
            </button>
            <label>
              Active session
              <select
                value={selected}
                onChange={(e) => {
                  setSelected(e.target.value);
                  setChecks(null);
                }}
              >
                <option value="">Choose session</option>
                {data.sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.device_serial} · {s.controller_id} · {s.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
            {session && (
              <p className="small">
                VIN hash:{" "}
                <span style={{ overflowWrap: "anywhere" }}>
                  {session.vin_hash}
                </span>
                <br />
                Active slot {session.state.activeSlot} · Original backup{" "}
                {session.state.originalBackup
                  ? "saved (simulation)"
                  : "missing"}
              </p>
            )}
          </section>
          {session && (
            <>
              <section className="card link-section">
                <h2>Telemetry logs</h2>
                <p className="small">
                  Upload a JSON array of numeric channel samples, for example [
                  {'{"t":0,"rpm":850}'}]. Maximum 10,000 samples / 1 MB.
                </p>
                <label>
                  Log JSON
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <button
                  disabled={busy || !file}
                  onClick={() =>
                    run(async () => {
                      if (!file) return;
                      if (file.size > 1_000_000)
                        throw new Error("Log must be 1 MB or smaller.");
                      const samples = JSON.parse(await file.text());
                      const sequence =
                        Math.max(
                          -1,
                          ...data.logs
                            .filter((l) => l.session_id === selected)
                            .map((l) => l.sequence),
                        ) + 1;
                      await apiPost(`${base}/logs`, {
                        vehicleSessionId: selected,
                        sequence,
                        samples,
                      });
                      setMessage(
                        "Log accepted and associated with this session.",
                      );
                    })
                  }
                >
                  Upload log
                </button>
                {data.logs
                  .filter((l) => l.session_id === selected)
                  .map((l) => (
                    <p key={l.id}>
                      Log #{l.sequence} · {l.sample_count} samples · Accepted
                    </p>
                  ))}
              </section>
              <section className="card link-section">
                <h2>Calibration and recovery</h2>
                <button
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await apiPost(`${base}/sessions/${selected}/backup`, {});
                      setMessage("Original simulator state preserved.");
                    })
                  }
                >
                  Save original simulation backup
                </button>
                {data.admin && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await apiPost(
                          `${base}/sessions/${selected}/calibrations`,
                          {},
                        );
                        setMessage("Signed simulation calibration released.");
                      })
                    }
                  >
                    Approve and sign simulation calibration
                  </button>
                )}
                {packages.map((p) => (
                  <p key={p.id}>
                    Revision {p.revision} · Signed and released · Expires{" "}
                    {new Date(p.payload.expiresAt).toLocaleString()}
                  </p>
                ))}
                {!packages.length && (
                  <p>Awaiting tuner/admin calibration release.</p>
                )}
                <label>
                  Battery voltage
                  <input
                    type="number"
                    step="0.1"
                    value={voltage}
                    onChange={(e) => setVoltage(e.target.value)}
                  />
                </label>
                <label>
                  Vehicle speed (km/h)
                  <input
                    type="number"
                    value={speed}
                    onChange={(e) => setSpeed(e.target.value)}
                  />
                </label>
                <label>
                  <input
                    className="link-checkbox"
                    type="checkbox"
                    checked={engineOff}
                    onChange={(e) => setEngineOff(e.target.checked)}
                  />{" "}
                  Engine is off
                </label>
                <label>
                  <input
                    className="link-checkbox"
                    type="checkbox"
                    checked={stable}
                    onChange={(e) => setStable(e.target.checked)}
                  />{" "}
                  Transport is stable
                </label>
                <div className="row">
                  <button
                    disabled={busy || !packages.length}
                    onClick={() => run(install)}
                  >
                    Check safety and simulate install
                  </button>
                  <button
                    className="secondary"
                    disabled={busy || !session.state.lastKnownGood}
                    onClick={() =>
                      run(async () => {
                        await apiPost(
                          `${base}/sessions/${selected}/recover`,
                          {},
                        );
                        setMessage("Recovered known-good simulation state.");
                      })
                    }
                  >
                    Recover known-good simulation
                  </button>
                </div>
                {checks && (
                  <ul>
                    {Object.entries(checks).map(([key, passed]) => (
                      <li key={key}>
                        {passed ? "Pass" : "BLOCKED"}: {key}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
          <section className="card link-section">
            <h2>Recent audit events</h2>
            {data.events.map((e) => (
              <p key={e.id}>
                {new Date(e.created_at).toLocaleString()} · {e.event}
              </p>
            ))}
            {!data.events.length && <p>No events yet.</p>}
          </section>
        </>
      )}
    </main>
  );
}
