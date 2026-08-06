import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyResendResponse } from "./resend_probe.js";

test("a proxy denial is not a key rejection (the bug this file exists for)", () => {
  // Verbatim from a container network policy that blocked api.resend.com.
  // The old code read the 403 and told the operator to revoke their key.
  const v = classifyResendResponse({
    status: 403,
    ok: false,
    rawBody: "Host not in allowlist: api.resend.com. Add this host to your network egress settings."
  });
  assert.equal(v.kind, "NOT_REACHED");
  if (v.kind === "NOT_REACHED") assert.match(v.detail, /allowlist/);
});

test("an HTML captive portal is not a key rejection either", () => {
  const v = classifyResendResponse({
    status: 401,
    ok: false,
    rawBody: "<html><body>Authentication required by network proxy</body></html>"
  });
  assert.equal(v.kind, "NOT_REACHED");
});

test("an empty body with an error status means nobody identified themselves", () => {
  const v = classifyResendResponse({ status: 502, ok: false, rawBody: "" });
  assert.equal(v.kind, "NOT_REACHED");
});

test("a bare JSON scalar is not Resend's error envelope", () => {
  // JSON.parse succeeds on these. Accepting them as Resend's shape would put
  // the original bug straight back.
  for (const body of ['"forbidden"', "403", "null"]) {
    const v = classifyResendResponse({ status: 403, ok: false, rawBody: body });
    assert.equal(v.kind, "NOT_REACHED", `${body} must not read as a Resend response`);
  }
});

test("Resend's own 401 is a genuine key rejection", () => {
  const v = classifyResendResponse({
    status: 401,
    ok: false,
    rawBody: JSON.stringify({ statusCode: 401, name: "invalid_api_key", message: "API key is invalid" })
  });
  assert.equal(v.kind, "KEY_REJECTED");
  if (v.kind === "KEY_REJECTED") assert.match(v.message, /invalid/i);
});

test("a sending-only key is valid, not broken", () => {
  // This is the safer key type. Reporting it as a failure pushes people to
  // issue a full-access key instead, which is worse.
  const v = classifyResendResponse({
    status: 403,
    ok: false,
    rawBody: JSON.stringify({
      statusCode: 403,
      name: "restricted_api_key",
      message: "This API key is restricted to only send emails"
    })
  });
  assert.equal(v.kind, "KEY_RESTRICTED");
});

test("a restricted key is recognised from the message alone", () => {
  // Resend has changed error `name` values before; the message is a second rope.
  const v = classifyResendResponse({
    status: 403,
    ok: false,
    rawBody: JSON.stringify({ statusCode: 403, message: "This key is restricted to sending" })
  });
  assert.equal(v.kind, "KEY_RESTRICTED");
});

test("some other Resend 403 is an API error, not a restricted key", () => {
  const v = classifyResendResponse({
    status: 403,
    ok: false,
    rawBody: JSON.stringify({ statusCode: 403, name: "not_allowed", message: "Account suspended" })
  });
  assert.equal(v.kind, "API_ERROR");
});

test("a successful list returns the domains", () => {
  const v = classifyResendResponse({
    status: 200,
    ok: true,
    rawBody: JSON.stringify({
      data: [
        { name: "downdirty84llc.com", status: "verified" },
        { name: "old.example", status: "pending" }
      ]
    })
  });
  assert.equal(v.kind, "OK");
  if (v.kind === "OK") {
    assert.equal(v.domains.length, 2);
    assert.equal(v.domains.filter((d) => d.status === "verified")[0].name, "downdirty84llc.com");
  }
});

test("a success with no domain list is OK with nothing in it, not a crash", () => {
  const v = classifyResendResponse({ status: 200, ok: true, rawBody: "{}" });
  assert.equal(v.kind, "OK");
  if (v.kind === "OK") assert.deepEqual(v.domains, []);
});
