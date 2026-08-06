import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTransport, emailConfigured, sendEmail, type Transport } from "./email.js";
import {
  signInEmail,
  reportReadyEmail,
  reviewWaitingEmail,
  adminRecipients
} from "./notifications.js";

const CONSOLE: Transport = { kind: "CONSOLE", from: "test@dd84.test" };

/** Runs fn with console.log captured, so transport output does not pollute the run. */
function withQuietLog<T>(fn: () => T): { value: T; lines: string[] } {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => void lines.push(args.join(" "));
  try {
    return { value: fn(), lines };
  } finally {
    console.log = original;
  }
}

test("production with no key resolves to NONE, not to a silent no-op", () => {
  // The dangerous outcome would be CONSOLE in production: mail 'sent' to a log
  // file nobody reads, with every call reporting success.
  const t = resolveTransport({ NODE_ENV: "production" } as NodeJS.ProcessEnv);
  assert.equal(t.kind, "NONE");
  assert.equal(emailConfigured({ NODE_ENV: "production" } as NodeJS.ProcessEnv), false);
});

test("a key resolves to RESEND in any environment", () => {
  for (const NODE_ENV of ["production", "development", "test"]) {
    const t = resolveTransport({ NODE_ENV, RESEND_API_KEY: "re_x" } as NodeJS.ProcessEnv);
    assert.equal(t.kind, "RESEND");
    if (t.kind === "RESEND") assert.equal(t.apiKey, "re_x");
  }
});

test("development without a key falls back to the console so local sign-in works", () => {
  const t = resolveTransport({ NODE_ENV: "development" } as NodeJS.ProcessEnv);
  assert.equal(t.kind, "CONSOLE");
});

test("a blank key is treated as no key", () => {
  // An env var set to "" is the usual shape of a half-finished deploy.
  const t = resolveTransport({ NODE_ENV: "production", RESEND_API_KEY: "   " } as NodeJS.ProcessEnv);
  assert.equal(t.kind, "NONE");
});

test("sending with no transport reports failure rather than claiming success", async () => {
  const r = await sendEmail({ to: "a@b.test", subject: "s", text: "t" }, { kind: "NONE" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /RESEND_API_KEY/);
});

test("an unusable address fails instead of being sent", async () => {
  for (const to of ["not-an-address", "", "   "]) {
    const r = await sendEmail({ to, subject: "s", text: "t" }, CONSOLE);
    assert.equal(r.ok, false, `should have rejected ${JSON.stringify(to)}`);
  }
});

test("the console transport reports what it did, and reports it as CONSOLE", async () => {
  // It must never claim to be RESEND — that is the difference between "sent"
  // and "printed where nobody will look".
  const captured = withQuietLog(() =>
    sendEmail({ to: "a@b.test", subject: "hello", text: "body" }, CONSOLE)
  );
  const r = await captured.value;
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.transport, "CONSOLE");
  assert.ok(captured.lines.join("\n").includes("hello"));
});

test("the sign-in email carries the link and says it expires", () => {
  const msg = signInEmail("driver@example.com", "https://app.dd84.test/auth/callback?token=abc", 15);
  assert.ok(msg.text.includes("https://app.dd84.test/auth/callback?token=abc"));
  assert.ok(msg.text.includes("15 minutes"));
  assert.ok(msg.subject.includes("Down Dirty 84"));
});

test("the report email states the largest change and the safety notice", () => {
  const msg = reportReadyEmail({
    to: "driver@example.com",
    vehicle: "2008 2500 6.0",
    itemCount: 6,
    largestChangePct: 5.2,
    diffSetId: "ds-1"
  });
  assert.ok(msg.subject.includes("2008 2500 6.0"));
  assert.ok(msg.text.includes("5.2%"));
  assert.ok(msg.text.includes("ds-1"));
  // The customer is about to flash a calibration; the disclaimer is not optional.
  assert.ok(/off-road/i.test(msg.text));
  assert.ok(/WOT/.test(msg.text));
});

test("a missing vehicle degrades to readable text, not to 'null'", () => {
  const msg = reportReadyEmail({
    to: "driver@example.com",
    vehicle: null,
    itemCount: 1,
    largestChangePct: 1,
    diffSetId: "ds-2"
  });
  assert.ok(!msg.text.includes("null"));
  assert.ok(!msg.subject.includes("null"));
});

test("the owner email lists every attention flag, not a count of them", () => {
  // A summarised warning is a warning that gets skimmed.
  const flags = [
    "Large correction: 12.0% — worth checking for a leak or wrong sensor",
    "Analysed against unconfirmed default thresholds"
  ];
  const msg = reviewWaitingEmail({
    to: "owner@dd84.test",
    vehicle: "Pete F100",
    customerEmail: "driver@example.com",
    itemCount: 4,
    largestChangePct: 12,
    lowestConfidence: 0.51,
    blockers: 0,
    warnings: 1,
    attention: flags,
    diffSetId: "ds-3"
  });
  for (const f of flags) assert.ok(msg.text.includes(f), `missing flag: ${f}`);
  assert.ok(msg.text.includes("driver@example.com"));
  assert.ok(msg.text.includes("0.51"));
});

test("admin recipients come from env only, and junk entries are dropped", () => {
  // Admin rights must not be grantable by anything the app can write to, so
  // this reads the same env var the release gate does.
  const got = adminRecipients({ ADMIN_EMAILS: "a@b.test, ,broken, c@d.test " } as NodeJS.ProcessEnv);
  assert.deepEqual(got, ["a@b.test", "c@d.test"]);
  assert.deepEqual(adminRecipients({} as NodeJS.ProcessEnv), []);
});
