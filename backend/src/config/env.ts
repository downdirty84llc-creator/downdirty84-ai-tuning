/**
 * Environment validation, run once at boot.
 *
 * A deployment that starts with half its configuration missing is worse than
 * one that refuses to start: the first takes customer money and loses their
 * files, the second tells you exactly what to fix. So in production a missing
 * required value is fatal, and a risky-but-legal configuration is a loud
 * warning rather than silence.
 */

export type EnvReport = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  storage: "S3" | "LOCAL";
  payments: "CONFIGURED" | "DISABLED";
  adminCount: number;
};

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

export function checkEnv(): EnvReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!process.env.DATABASE_URL) {
    errors.push("DATABASE_URL is not set. The API cannot store anything without it.");
  }

  const admins = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  if (admins.length === 0) {
    // Without an admin nobody can release a calibration, so the whole delivery
    // path is dead — jobs would analyse and then stop forever.
    errors.push(
      "ADMIN_EMAILS is empty. No one could release a calibration, so no work could be delivered."
    );
  }

  const s3 = Boolean(
    process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
  );
  if (!s3) {
    const msg =
      "S3 is not configured; uploads fall back to local disk, which is wiped on every restart " +
      "on Render/Heroku/Fly. Customer logs will be lost.";
    if (isProd()) errors.push(msg);
    else warnings.push(msg);
  }

  const stripe = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
  if (!stripe) {
    warnings.push(
      "Stripe is not configured. Paid orders will not create jobs automatically; " +
        "they would have to be entered by hand."
    );
  }

  if (isProd() && !process.env.APP_BASE_URL) {
    errors.push("APP_BASE_URL is not set. Magic-link emails would point at localhost.");
  }
  if (isProd() && !process.env.FRONTEND_ORIGIN) {
    warnings.push(
      "FRONTEND_ORIGIN is not set. Browser requests from your app may be blocked by CORS."
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    storage: s3 ? "S3" : "LOCAL",
    payments: stripe ? "CONFIGURED" : "DISABLED",
    adminCount: admins.length
  };
}

/**
 * Print the report, and stop the process in production when something required
 * is missing. Development is allowed to run degraded so the app is easy to try.
 */
export function assertEnvOrExit(): EnvReport {
  const report = checkEnv();

  for (const w of report.warnings) console.warn(`[DD84] WARNING  ${w}`);
  for (const e of report.errors) console.error(`[DD84] MISSING  ${e}`);

  console.log(
    `[DD84] storage=${report.storage} payments=${report.payments} admins=${report.adminCount}`
  );

  if (!report.ok) {
    if (isProd()) {
      console.error("[DD84] Refusing to start: required configuration is missing (see above).");
      process.exit(1);
    }
    console.warn("[DD84] Starting anyway because NODE_ENV is not production.");
  }
  return report;
}
