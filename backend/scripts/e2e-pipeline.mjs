// Full-pipeline check: upload a real CSV, analyse it, generate suggestions,
// release, export. Asserts the output came from the engine, not fixtures.
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { makeSyntheticLog } from "../dist/services/analyze/log/synthetic.js";

// Config via env so this can point at any running instance.
const API = process.env.E2E_API || "http://127.0.0.1:8080";
const PGHOST = process.env.E2E_PGHOST || "/tmp/pgtest";
const PGPORT = process.env.E2E_PGPORT || "55432";
const PGDB = process.env.E2E_PGDB || "dd84";
const psql = (sql) =>
  execFileSync("psql", ["-h", PGHOST, "-p", PGPORT, "-U", "postgres", "-d", PGDB, "-qtAc", sql], {
    encoding: "utf8"
  }).trim().split("\n")[0].trim();

let pass = 0, fail = 0;
const ok = (m) => { console.log(`  PASS  ${m}`); pass++; };
const bad = (m, d) => { console.log(`  FAIL  ${m} -- ${d}`); fail++; };
const check = (m, got, want) => (String(got) === String(want) ? ok(m) : bad(m, `expected ${want}, got ${got}`));

const req = async (method, path, { token, body, form } = {}) => {
  const headers = {};
  if (token) headers.Cookie = `dd84_session=${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  const res = await fetch(API + path, { method, headers, body: payload });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, text, json };
};

const poll = async (runId, token) => {
  for (let i = 0; i < 60; i++) {
    const r = await req("GET", `/api/v1/runs/${runId}`, { token });
    if (r.json && r.json.status !== "QUEUED" && r.json.status !== "RUNNING") return r.json;
    await new Promise((s) => setTimeout(s, 250));
  }
  return null;
};

const upload = async (token, jobId, filename, content) => {
  const fd = new FormData();
  fd.append("file", new Blob([content], { type: "text/csv" }), filename);
  fd.append("jobId", jobId);
  fd.append("kind", "LOG");
  const res = await fetch(`${API}/api/v1/uploads`, {
    method: "POST",
    headers: { Cookie: `dd84_session=${token}` },
    body: fd
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};

// ---------------------------------------------------------------- seed --
psql("TRUNCATE diffsets, runs, uploads, orders, jobs, sessions, auth_tokens, users CASCADE;");
psql("INSERT INTO users (email) VALUES ('owner@dd84.test'),('admin@dd84.test');");
const uidOwner = psql("SELECT id FROM users WHERE email='owner@dd84.test';");
const uidAdmin = psql("SELECT id FROM users WHERE email='admin@dd84.test';");
const mk = (u, raw) =>
  psql(`INSERT INTO sessions (user_id, session_hash, expires_at) VALUES ('${u}','${crypto.createHash("sha256").update(raw).digest("hex")}', now()+interval '1 day');`);
mk(uidOwner, "tok_owner"); mk(uidAdmin, "tok_admin");
const OWNER = "tok_owner", ADMIN = "tok_admin";

const jobId = psql(`INSERT INTO jobs (user_id,service_type,platform) VALUES ('${uidOwner}','LOG_REVIEW','GM') RETURNING id;`);

/* ══════════════ 1. CLEAN LOG: analyse → suggest → release → export ══════ */
console.log("── clean log with a known 4% MAF error");

const cleanCsv = makeSyntheticLog({ mafErrorAt: () => 0.04, noise: 0.2 });
const up = await upload(OWNER, jobId, "clean.csv", cleanCsv);
check("upload accepted (multipart works)", up.status, 200);
const uploadId = up.json?.uploadId;
uploadId ? ok(`upload stored (${uploadId})`) : bad("upload stored", JSON.stringify(up.json));

const started = await req("POST", `/api/v1/jobs/${jobId}/analyze`, { token: OWNER, body: { logUploadIds: [uploadId] } });
check("analyze accepted", started.status, 202);
const run = await poll(started.json.runId, OWNER);
check("run reached SUCCEEDED", run?.status, "SUCCEEDED");

const findings = await req("GET", `/api/v1/jobs/${jobId}/findings?runId=${started.json.runId}`, { token: OWNER });
const codes = (findings.json?.items ?? []).map((f) => f.code);
ok(`findings from engine: ${codes.join(", ") || "(none)"}`);
check("reports unconfirmed thresholds", codes.includes("R3_THRESHOLDS_UNCONFIRMED"), true);
check("no safety blockers on a clean log", findings.json?.summary?.blockers, 0);
check("diffgen allowed", findings.json?.diffgen?.allowed, true);

const validation = await req("GET", `/api/v1/jobs/${jobId}/validation?runId=${started.json.runId}`, { token: OWNER });
check("validation PASS", validation.json?.status, "PASS");
check("wideband OK", validation.json?.wbStatus, "OK");
check("records which upload was analysed", validation.json?.analyzedUploadId, uploadId);
check("not a fixture: platform is null, not 'GM'", validation.json?.vehicleProfileDetected?.platform, null);

const gen = await req("POST", `/api/v1/jobs/${jobId}/diffsets/generate`, {
  token: OWNER,
  body: { runId: started.json.runId, generator: "GM_LS_MAF_V1", uploadId }
});
check("diffset generated", gen.status, 201);
const dsId = gen.json?.diffSetId;

const items = gen.json?.items ?? [];
ok(`generated ${items.length} MAF curve points`);
const near = items.filter((i) => Math.abs(i.after - 1.04) < 0.015);
check("multipliers match the injected 4% error", near.length === items.length && items.length > 0, true);
check("not the fixture diffset id", gen.json?.diffSetId !== "00000000-0000-0000-0000-000000000000", true);
check("carries real provenance", typeof items[0]?.provenance?.samples === "number", true);

check("export blocked before release", (await req("POST", `/api/v1/diffsets/${dsId}/export/csv`, { token: OWNER, body: {} })).status, 403);
check("admin releases", (await req("POST", `/api/v1/diffsets/${dsId}/release`, { token: ADMIN, body: { decision: "RELEASE", note: "reviewed" } })).status, 200);

const csvRes = await req("POST", `/api/v1/diffsets/${dsId}/export/csv`, { token: OWNER, body: {} });
check("export works after release", csvRes.status, 200);
csvRes.text.includes("${") ? bad("csv clean", "template leak") : ok("csv has no template-literal leak");
check("csv rows carry the real diffSetId", csvRes.text.split("\n")[1].startsWith(dsId), true);
console.log("       " + csvRes.text.split("\n")[1]);

/* ══════════════ 2. UNSAFE LOG: blocker must stop diffgen ═══════════════ */
console.log("── log with a sustained lean event under load");

const job2 = psql(`INSERT INTO jobs (user_id,service_type,platform) VALUES ('${uidOwner}','LOG_REVIEW','GM') RETURNING id;`);
const leanCsv = makeSyntheticLog({
  plateaus: [{ hz: 3000, rpm: 4200, tps: 80, seconds: 60 }],
  mafErrorAt: () => 0.02,
  noise: 0.2,
  overrides: (_i, t) => (t >= 20 && t <= 32 ? { WBAFR: 16.4 } : undefined)
});
const up2 = await upload(OWNER, job2, "lean.csv", leanCsv);
const s2 = await req("POST", `/api/v1/jobs/${job2}/analyze`, { token: OWNER, body: { logUploadIds: [up2.json.uploadId] } });
const run2 = await poll(s2.json.runId, OWNER);
check("run succeeded", run2?.status, "SUCCEEDED");

const f2 = await req("GET", `/api/v1/jobs/${job2}/findings?runId=${s2.json.runId}`, { token: OWNER });
const codes2 = (f2.json?.items ?? []).map((f) => f.code);
check("detected S1_LEAN_UNDER_LOAD", codes2.includes("S1_LEAN_UNDER_LOAD"), true);
const lean = (f2.json?.items ?? []).find((f) => f.code === "S1_LEAN_UNDER_LOAD");
check("blocker severity", lean?.severity, "BLOCKER");
ok(`evidence window: ${JSON.stringify(lean?.evidence?.ranges?.[0])}`);
check("diffgen refused", f2.json?.diffgen?.allowed, false);

const gen2 = await req("POST", `/api/v1/jobs/${job2}/diffsets/generate`, {
  token: OWNER, body: { runId: s2.json.runId, generator: "GM_LS_MAF_V1", uploadId: up2.json.uploadId }
});
check("generate refused on unsafe log -> 403", gen2.status, 403);
check("nothing persisted for the unsafe run", psql(`SELECT count(*) FROM diffsets WHERE run_id='${s2.json.runId}';`), 0);

/* ══════════════ 3. BAD LOG: failure is reported, not swallowed ═════════ */
console.log("── unparseable upload");

const job3 = psql(`INSERT INTO jobs (user_id,service_type,platform) VALUES ('${uidOwner}','LOG_REVIEW','GM') RETURNING id;`);
const up3 = await upload(OWNER, job3, "junk.csv", "this is not a datalog\n");
const s3 = await req("POST", `/api/v1/jobs/${job3}/analyze`, { token: OWNER, body: { logUploadIds: [up3.json.uploadId] } });
const run3 = await poll(s3.json.runId, OWNER);
check("run reached FAILED, not stuck", run3?.status, "FAILED");
check("failure has a reason", (run3?.errors?.length ?? 0) > 0, true);
ok(`reason: ${run3?.errors?.[0]?.code}`);

console.log(`\n═══ pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
