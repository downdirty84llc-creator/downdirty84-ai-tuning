import { test } from "node:test";
import assert from "node:assert/strict";
import { checkEnv } from "./env.js";

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) {
    saved[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try {
    fn();
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

const FULL = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://localhost/dd84",
  ADMIN_EMAILS: "owner@dd84.test",
  APP_BASE_URL: "https://app.example.com",
  FRONTEND_ORIGIN: "https://app.example.com",
  S3_BUCKET: "b",
  S3_ACCESS_KEY_ID: "k",
  S3_SECRET_ACCESS_KEY: "s",
  STRIPE_SECRET_KEY: "sk",
  STRIPE_WEBHOOK_SECRET: "wh",
  RESEND_API_KEY: "re_test"
};

test("a fully configured production environment passes", () => {
  withEnv(FULL, () => {
    const r = checkEnv();
    assert.equal(r.ok, true, r.errors.join("; "));
    assert.equal(r.storage, "S3");
    assert.equal(r.payments, "CONFIGURED");
    assert.equal(r.email, "CONFIGURED");
  });
});

test("missing DATABASE_URL is fatal", () => {
  withEnv({ ...FULL, DATABASE_URL: undefined }, () => {
    const r = checkEnv();
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes("DATABASE_URL")));
  });
});

test("no admin is fatal, because nothing could ever be released", () => {
  // Without an admin the release gate can never be satisfied, so every job
  // would analyse and then stop forever. Silent deadlock, so it must be loud.
  withEnv({ ...FULL, ADMIN_EMAILS: "" }, () => {
    const r = checkEnv();
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes("release")));
  });
});

test("missing S3 is fatal in production but only a warning in development", () => {
  // Local disk is wiped on restart on Render/Heroku/Fly — customer logs vanish.
  withEnv({ ...FULL, S3_BUCKET: undefined }, () => {
    const r = checkEnv();
    assert.equal(r.ok, false);
    assert.equal(r.storage, "LOCAL");
  });
  withEnv({ ...FULL, NODE_ENV: "development", S3_BUCKET: undefined }, () => {
    const r = checkEnv();
    assert.equal(r.ok, true);
    assert.ok(r.warnings.some((w) => w.includes("wiped")));
  });
});

test("no email transport is fatal in production, because nobody could log in", () => {
  // Sign-in is a magic link. With no way to send it the product is unreachable
  // for customers and owner alike — the same dead end as an empty ADMIN_EMAILS.
  withEnv({ ...FULL, RESEND_API_KEY: undefined }, () => {
    const r = checkEnv();
    assert.equal(r.ok, false);
    assert.equal(r.email, "CONSOLE");
    assert.ok(r.errors.some((e) => e.includes("RESEND_API_KEY")));
  });
  // Development still runs: the link is printed to the terminal instead.
  withEnv({ ...FULL, NODE_ENV: "development", RESEND_API_KEY: undefined }, () => {
    const r = checkEnv();
    assert.equal(r.ok, true);
    assert.ok(r.warnings.some((w) => w.includes("console")));
  });
});

test("missing Stripe warns rather than blocks", () => {
  // The business can still run with jobs entered by hand.
  withEnv({ ...FULL, STRIPE_SECRET_KEY: undefined }, () => {
    const r = checkEnv();
    assert.equal(r.ok, true);
    assert.equal(r.payments, "DISABLED");
    assert.ok(r.warnings.some((w) => w.includes("Stripe")));
  });
});

test("missing APP_BASE_URL is fatal in production", () => {
  // Magic links would point at localhost, so no customer could ever log in.
  withEnv({ ...FULL, APP_BASE_URL: undefined }, () => {
    assert.equal(checkEnv().ok, false);
  });
});
