#!/usr/bin/env node
/**
 * Setup doctor: `npm run doctor`
 *
 * checkEnv() answers "is a value present". This answers the question that
 * actually matters — "does the value work". Those are very different, and the
 * gap between them is where a deploy looks configured and is not: a Resend key
 * from the wrong account, an S3 bucket that exists but rejects writes, a
 * Postgres URL pointing at a database with no schema.
 *
 * Every check either proves the thing works by using it, or says plainly that
 * it could not. Nothing is inferred from the presence of a string.
 *
 * Read-only against third parties: it lists Resend domains, reads the Stripe
 * account, heads the S3 bucket. Nothing is created, charged or sent.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// Load .env from the backend dir or the repo root, without a dependency.
for (const candidate of [path.join(root, ".env"), path.join(root, "..", ".env")]) {
  if (!fs.existsSync(candidate)) continue;
  for (const line of fs.readFileSync(candidate, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const value = m[2].trim().replace(/^["']|["']$/g, "");
    if (process.env[m[1]] === undefined && value) process.env[m[1]] = value;
  }
  console.log(`Loaded ${path.relative(root, candidate)}\n`);
  break;
}

const GREEN = "\x1b[32m", RED = "\x1b[31m", YELLOW = "\x1b[33m", DIM = "\x1b[2m", OFF = "\x1b[0m";

const results = [];
function record(name, state, detail, fix) {
  results.push({ name, state, detail, fix });
  const mark = state === "OK" ? `${GREEN}✓${OFF}` : state === "WARN" ? `${YELLOW}!${OFF}` : `${RED}✗${OFF}`;
  console.log(`${mark} ${name}`);
  if (detail) console.log(`  ${DIM}${detail}${OFF}`);
  if (fix && state !== "OK") console.log(`  → ${fix}`);
}

const timeout = (ms = 10_000) => AbortSignal.timeout(ms);

/* ── Postgres ─────────────────────────────────────────────────────────── */
async function checkDatabase() {
  if (!process.env.DATABASE_URL) {
    return record("Database", "FAIL", "DATABASE_URL is not set.",
      "Set DATABASE_URL. Managed Postgres providers give you the string directly.");
  }
  try {
    const { default: pg } = await import("pg");
    const client = new pg.Client({
      connectionString: process.env.DATABASE_URL,
      ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false }
    });
    await client.connect();
    const v = await client.query("SELECT version()");
    // Connecting proves reachability; the schema proves migrations ran. A
    // reachable database with no tables is a deploy that will fail on the
    // first customer, not a working one.
    const t = await client.query(
      `SELECT count(*)::int AS n FROM information_schema.tables
       WHERE table_schema='public' AND table_name IN ('users','jobs','uploads','runs','diffsets')`
    );
    await client.end();

    const version = String(v.rows[0].version).split(" ").slice(0, 2).join(" ");
    if (t.rows[0].n < 5) {
      return record("Database", "FAIL", `${version}, but only ${t.rows[0].n}/5 core tables exist.`,
        "Run `npm run migrate`.");
    }
    record("Database", "OK", `${version}, all 5 core tables present.`);
  } catch (err) {
    record("Database", "FAIL", String(err?.message ?? err),
      "Check the host, port, credentials and that the database accepts remote connections.");
  }
}

/* ── Email ────────────────────────────────────────────────────────────── */
async function checkEmail() {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim() || "Down Dirty 84 <noreply@downdirty84llc.com>";

  if (!key) {
    return record("Email", process.env.NODE_ENV === "production" ? "FAIL" : "WARN",
      "RESEND_API_KEY is not set. Sign-in links cannot be sent, so nobody can log in.",
      "Sign up at resend.com, verify your sending domain, then set RESEND_API_KEY and EMAIL_FROM.");
  }

  try {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${key}` },
      signal: timeout()
    });
    if (res.status === 401 || res.status === 403) {
      return record("Email", "FAIL", `Resend rejected the key (${res.status}).`,
        "The key is wrong or was revoked. Create a new one in the Resend dashboard.");
    }
    if (!res.ok) {
      return record("Email", "FAIL", `Resend returned ${res.status}.`, "Check status.resend.com.");
    }

    const body = await res.json().catch(() => ({}));
    const domains = body?.data ?? [];
    const verified = domains.filter((d) => d.status === "verified").map((d) => d.name);

    // The sending domain is the part people get wrong. A valid key with an
    // unverified domain accepts the call and never delivers the mail.
    const domain = (from.match(/@([^\s>]+)/) ?? [])[1]?.toLowerCase();
    if (!domain) {
      return record("Email", "FAIL", `EMAIL_FROM has no address in it: ${from}`,
        'Use the form: Down Dirty 84 <noreply@yourdomain.com>');
    }
    if (verified.length === 0) {
      return record("Email", "FAIL", `Key works, but no verified sending domain (${domains.length} pending).`,
        `Verify ${domain} in Resend → Domains. Mail will not deliver until you do.`);
    }
    if (!verified.includes(domain)) {
      return record("Email", "FAIL",
        `EMAIL_FROM sends from ${domain}, which is not verified. Verified: ${verified.join(", ")}.`,
        `Either verify ${domain} in Resend, or set EMAIL_FROM to an address at ${verified[0]}.`);
    }
    record("Email", "OK", `Key valid, ${domain} verified, sending as ${from}`);
  } catch (err) {
    record("Email", "FAIL", String(err?.message ?? err), "Could not reach api.resend.com.");
  }
}

/* ── Object storage ───────────────────────────────────────────────────── */
async function checkStorage() {
  const { S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_ENDPOINT } = process.env;
  if (!S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
    return record("File storage", process.env.NODE_ENV === "production" ? "FAIL" : "WARN",
      "S3 is not configured; uploads go to local disk, which is wiped on every deploy.",
      "Create an R2 or S3 bucket and set S3_BUCKET, S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY.");
  }

  try {
    const { S3Client, HeadBucketCommand } = await import("@aws-sdk/client-s3");
    const client = new S3Client({
      region: process.env.S3_REGION || "auto",
      endpoint: S3_ENDPOINT || undefined,
      forcePathStyle: Boolean(S3_ENDPOINT),
      credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY }
    });
    await client.send(new HeadBucketCommand({ Bucket: S3_BUCKET }));
    record("File storage", "OK", `Bucket ${S3_BUCKET} reachable and credentials accepted.`);
  } catch (err) {
    const code = err?.name ?? "";
    const fix =
      code === "NotFound" ? `Bucket ${S3_BUCKET} does not exist. Create it, or fix S3_BUCKET.`
      : /Forbidden|AccessDenied|InvalidAccessKeyId|SignatureDoesNotMatch/.test(code)
        ? "The credentials are wrong, or the token lacks read/write on this bucket."
        : "Check S3_ENDPOINT — R2 needs the full https://<account>.r2.cloudflarestorage.com URL.";
    record("File storage", "FAIL", `${code}: ${err?.message ?? err}`, fix);
  }
}

/* ── Payments ─────────────────────────────────────────────────────────── */
async function checkStripe() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    return record("Payments", "WARN",
      "Stripe is not configured. Paid orders will not create jobs; you would enter them by hand.",
      "Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET, then point a webhook at POST /api/v1/stripe/webhook.");
  }
  try {
    const res = await fetch("https://api.stripe.com/v1/account", {
      headers: { Authorization: `Bearer ${key}` },
      signal: timeout()
    });
    if (!res.ok) {
      return record("Payments", "FAIL", `Stripe rejected the key (${res.status}).`,
        "Copy the secret key again from the Stripe dashboard. Note test vs live mode.");
    }
    const acct = await res.json().catch(() => ({}));
    const live = key.startsWith("sk_live");
    const mode = live ? "LIVE" : "test";

    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      // Without the webhook secret the signature check cannot pass, so paid
      // orders never become jobs. The key working is not enough.
      return record("Payments", "FAIL",
        `Key valid (${acct.business_profile?.name ?? acct.id}, ${mode}) but STRIPE_WEBHOOK_SECRET is missing.`,
        "Add the endpoint POST /api/v1/stripe/webhook in Stripe, subscribe to checkout.session.completed, and copy its signing secret.");
    }
    record("Payments", live ? "OK" : "WARN",
      `${acct.business_profile?.name ?? acct.id}, ${mode} mode, webhook secret set.`,
      live ? undefined : "Test-mode keys will not take real money. Switch to live keys when you are ready.");
  } catch (err) {
    record("Payments", "FAIL", String(err?.message ?? err), "Could not reach api.stripe.com.");
  }
}

/* ── Things only the owner can decide ─────────────────────────────────── */
async function checkOwnerConfig() {
  const admins = (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (admins.length === 0) {
    record("Admins", "FAIL", "ADMIN_EMAILS is empty — nobody could release a calibration.",
      "Set ADMIN_EMAILS to the address you sign in with.");
  } else {
    record("Admins", "OK", `${admins.length} admin(s): ${admins.join(", ")}`);
  }

  if (!process.env.APP_BASE_URL) {
    record("App URL", process.env.NODE_ENV === "production" ? "FAIL" : "WARN",
      "APP_BASE_URL is not set; emailed links would point at localhost.",
      "Set it to the public URL of the frontend.");
  } else {
    record("App URL", "OK", process.env.APP_BASE_URL);
  }

  try {
    const { unconfirmedProfiles } = await import("../dist/config/thresholds.js");
    const pending = unconfirmedProfiles();
    if (pending.length === 0) {
      record("Threshold profiles", "OK", "All profiles owner-confirmed.");
    } else {
      record("Threshold profiles", "WARN",
        `Unconfirmed: ${pending.join(", ")}. Runs on these are reported as unconfirmed, which is correct — not a bug.`,
        "Review each against real logs, then set its values and flag in src/config/thresholds.ts.");
    }
  } catch {
    record("Threshold profiles", "WARN", "Could not read (run `npm run build` first).", "npm run build");
  }
}

/* ── Run ──────────────────────────────────────────────────────────────── */
console.log(`Down Dirty 84 — setup check  ${DIM}(NODE_ENV=${process.env.NODE_ENV || "development"})${OFF}\n`);

await checkDatabase();
await checkEmail();
await checkStorage();
await checkStripe();
await checkOwnerConfig();

const failed = results.filter((r) => r.state === "FAIL");
const warned = results.filter((r) => r.state === "WARN");

console.log("");
if (failed.length === 0 && warned.length === 0) {
  console.log(`${GREEN}Everything checks out. You can take real work.${OFF}`);
} else if (failed.length === 0) {
  console.log(`${YELLOW}${warned.length} warning(s), nothing blocking.${OFF} Fine for development; read each before going live.`);
} else {
  console.log(`${RED}${failed.length} blocking problem(s):${OFF}`);
  for (const f of failed) console.log(`  • ${f.name} — ${f.fix ?? f.detail}`);
}

// Non-zero on failure so this is usable in a deploy pipeline as a gate.
process.exit(failed.length === 0 ? 0 : 1);
