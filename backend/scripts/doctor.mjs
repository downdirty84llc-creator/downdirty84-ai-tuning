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

    // Who actually answered? A status code alone cannot tell you: a proxy, a
    // captive portal and an API all speak HTTP, and only one of them knows
    // anything about your credentials. Classified by tested logic rather than
    // inline guesswork — this is the branch that decides whether an operator
    // is told to throw away a working key.
    const { classifyResendResponse } = await import("../dist/services/notify/resend_probe.js");
    const verdict = classifyResendResponse({
      status: res.status,
      ok: res.ok,
      rawBody: await res.text().catch(() => "")
    });

    if (verdict.kind === "NOT_REACHED") {
      return record("Email", "FAIL",
        `Got HTTP ${verdict.status} from something that is not Resend (${verdict.detail}).`,
        "Nothing reached api.resend.com, so the key was never tested — do NOT revoke it on this result. " +
        "Check for a proxy, firewall or network policy blocking api.resend.com:443.");
    }
    if (verdict.kind === "KEY_REJECTED") {
      return record("Email", "FAIL", `Resend rejected the key: ${verdict.message}.`,
        "The key is wrong or was revoked. Create a new one in the Resend dashboard.");
    }
    if (verdict.kind === "KEY_RESTRICTED") {
      // A "Sending access" key is the better security posture. Calling it
      // broken would push people toward a full-access key instead.
      return record("Email", "WARN",
        "Key is valid but scoped to sending only, so the domain list cannot be read from here.",
        "That scope is fine — safer than full access. Confirm the domain shows Verified in Resend → Domains, " +
        "or run `npm run doctor -- --send-test you@example.com` to prove delivery end to end.");
    }
    if (verdict.kind === "API_ERROR") {
      return record("Email", "FAIL", `Resend returned ${verdict.status}: ${verdict.message}`,
        "Check the key's permissions, and status.resend.com.");
    }

    const domains = verdict.domains;
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
    // A thrown fetch is a network failure, never an authentication one. Say so,
    // so nobody goes looking for a bad key that was never even sent.
    record("Email", "FAIL", `Could not reach api.resend.com: ${err?.message ?? err}`,
      "This is a connectivity problem, not a key problem — the key was never tested, so do not revoke it on this result.");
  }
}

/**
 * Prove delivery end to end: `npm run doctor -- --send-test you@example.com`
 *
 * The only check here that is not read-only, so it is opt-in and never runs
 * by default. It is also the only one that answers the question that actually
 * matters — did an email arrive — which no amount of API probing can.
 */
async function sendTestEmail(to) {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim() || "Down Dirty 84 <noreply@downdirty84llc.com>";
  if (!key) {
    return record("Test email", "FAIL", "RESEND_API_KEY is not set.", "Set it, then re-run.");
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject: "Down Dirty 84 — setup test",
        text: "If you are reading this, sign-in links and 'your change list is ready' emails will reach your customers."
      }),
      signal: timeout(15_000)
    });
    // Same classifier as the main check, so a blocked network cannot be
    // reported here as a credential problem either.
    const { classifyResendResponse } = await import("../dist/services/notify/resend_probe.js");
    const raw = await res.text().catch(() => "");
    const verdict = classifyResendResponse({ status: res.status, ok: res.ok, rawBody: raw });

    if (verdict.kind === "NOT_REACHED") {
      return record("Test email", "FAIL",
        `HTTP ${verdict.status} from something that is not Resend (${verdict.detail}).`,
        "Nothing reached api.resend.com — connectivity, not credentials. The key was never tested.");
    }
    if (verdict.kind === "KEY_REJECTED") {
      return record("Test email", "FAIL", `Resend rejected the key: ${verdict.message}.`,
        "Create a new key in the Resend dashboard.");
    }
    if (!res.ok) {
      const message = verdict.kind === "API_ERROR" ? verdict.message : "refused";
      return record("Test email", "FAIL", `Resend refused: ${message}`,
        /domain/i.test(message)
          ? "Verify your sending domain in Resend → Domains — this is the usual cause."
          : "See the message above.");
    }

    let id = null;
    try { id = JSON.parse(raw)?.id ?? null; } catch { /* accepted, id unknown */ }
    record("Test email", "OK", `Accepted by Resend${id ? ` (id ${id})` : ""}. Check ${to} — including spam.`);
  } catch (err) {
    record("Test email", "FAIL", `Could not reach api.resend.com: ${err?.message ?? err}`,
      "Connectivity, not credentials.");
  }
}

/**
 * Does the catalogue in the repo still agree with the live Stripe account?
 *
 * The price IDs and the `dd84_service` / `dd84_addon` metadata are two records
 * of the same fact, and metadata *overrides* the table at runtime. So a
 * mistyped tag in the Stripe dashboard silently changes what a payment
 * creates — a rush fee tagged `dd84_service` would start creating jobs, and a
 * service tagged `dd84_addon` would stop.
 *
 * Neither the code nor Stripe can notice that on its own. This can.
 */
async function checkStripeCatalog() {
  if (!process.env.STRIPE_SECRET_KEY) return;

  let drift;
  try {
    drift = await import("../dist/config/catalog_drift.js");
  } catch {
    return record("Stripe catalogue", "WARN", "Could not read (run `npm run build` first).", "npm run build");
  }

  const wanted = [...drift.expectedCatalog().keys()];
  const live = [];
  for (const id of wanted) {
    try {
      const res = await fetch(`https://api.stripe.com/v1/prices/${id}`, {
        headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
        signal: timeout()
      });
      if (res.status === 404) continue; // absent -> reported as MISSING below
      if (!res.ok) {
        return record("Stripe catalogue", "FAIL", `Stripe returned ${res.status} reading ${id}.`,
          "The catalogue was not checked. Confirm the key has read access to prices.");
      }
      live.push(await res.json());
    } catch (err) {
      return record("Stripe catalogue", "FAIL", `Could not reach api.stripe.com: ${err?.message ?? err}`,
        "Connectivity, not credentials — the catalogue was not checked.");
    }
  }

  const report = drift.compareCatalog(live);
  if (report.findings.length === 0) {
    return record("Stripe catalogue", "OK",
      `${report.taggedAndAgreeing}/${report.total} prices tagged and agreeing with the app.`);
  }

  record(
    "Stripe catalogue",
    report.onlyUntagged ? "WARN" : "FAIL",
    report.findings.map((f) => f.message).join("\n  "),
    report.onlyUntagged
      ? "Optional — the built-in price table already covers these. Tagging them lets you add products without a deploy."
      : "Metadata overrides the app's table at runtime, so fix Stripe or the table before taking payments."
  );
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
    const live = key.startsWith("sk_live") || key.startsWith("rk_live");
    const mode = live ? "LIVE" : "test";

    // Which account, not just whether the key works. Price IDs are minted per
    // account, so a key for the wrong one of the four accounts named "Down
    // Dirty 84 llc" matches nothing in the catalogue and classifies no payment
    // at all — and the symptom looks like a code bug rather than a key.
    try {
      const { EXPECTED_STRIPE_ACCOUNT } = await import("../dist/config/stripe_catalog.js");
      const { classifyAccount, describeVerdict, blocksPayments } =
        await import("../dist/config/stripe_account.js");

      const verdict = classifyAccount({
        expected: EXPECTED_STRIPE_ACCOUNT,
        actual: acct.id ?? null,
        livemode: live,
        nodeEnv: process.env.NODE_ENV
      });

      if (blocksPayments(verdict)) {
        return record("Payments", "FAIL", describeVerdict(verdict),
          verdict.kind === "WRONG_ACCOUNT"
            ? `Point STRIPE_SECRET_KEY at ${EXPECTED_STRIPE_ACCOUNT}, or update the price IDs and EXPECTED_STRIPE_ACCOUNT in src/config/stripe_catalog.ts to the account you meant.`
            : "Use a live key in production, or set NODE_ENV to something else.");
      }
    } catch {
      record("Payments", "WARN", "Could not check which account the key belongs to (run `npm run build` first).", "npm run build");
    }

    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      // Without the webhook secret the signature check cannot pass, so paid
      // orders never become jobs. The key working is not enough.
      return record("Payments", "FAIL",
        `Key valid (${acct.business_profile?.name ?? acct.id}, ${mode}) but STRIPE_WEBHOOK_SECRET is missing.`,
        "Add the endpoint POST /api/v1/stripe/webhook in Stripe, subscribe to checkout.session.completed, and copy its signing secret.");
    }
    record("Payments", live ? "OK" : "WARN",
      `${acct.business_profile?.name ?? acct.id} (${acct.id}), ${mode} mode, webhook secret set.`,
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
await checkStripeCatalog();
await checkOwnerConfig();

const testIndex = process.argv.indexOf("--send-test");
if (testIndex !== -1) {
  const to = process.argv[testIndex + 1];
  if (!to || !to.includes("@")) {
    console.log(`\n${RED}--send-test needs an address: npm run doctor -- --send-test you@example.com${OFF}`);
    process.exit(1);
  }
  console.log("");
  await sendTestEmail(to);
}

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
