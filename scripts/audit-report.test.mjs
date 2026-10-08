#!/usr/bin/env node
/**
 * Tests for scripts/audit-report.mjs.
 *
 * The script is driven entirely by what `npm audit` does, so the only way to
 * test it honestly is to control npm. Each case puts a stub `npm` on PATH and
 * runs the real script against it.
 *
 * This exists because untested CI shell has caused three separate problems in
 * this repository: a test glob that silently ran 6 tests instead of 58, a
 * Node-version-dependent runner that passed locally and failed on CI, and an
 * audit gate that reddened main for unreachable findings. Logic that decides
 * whether a build passes gets tested like anything else.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, "audit-report.mjs");

/**
 * Run the script with a fake npm that returns the given text and exit code for
 * `npm audit`, and the given JSON for `npm audit --json`.
 */
function runWith({ auditText, auditExit, jsonText, failToRun = false }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "auditreport-"));
  const bin = path.join(tmp, "bin");
  fs.mkdirSync(bin);

  const stub = failToRun
    ? `#!/bin/sh\nexit 127\n`
    : [
        "#!/bin/sh",
        'for a in "$@"; do if [ "$a" = "--json" ]; then',
        `  cat <<'JSONEOF'`,
        jsonText ?? "",
        "JSONEOF",
        "  exit 1",
        "fi; done",
        `cat <<'TXTEOF'`,
        auditText ?? "",
        "TXTEOF",
        `exit ${auditExit ?? 0}`
      ].join("\n");

  fs.writeFileSync(path.join(bin, "npm"), stub, { mode: 0o755 });

  const summary = path.join(tmp, "summary.md");
  const res = spawnSync(process.execPath, [script, tmp, "testsuite"], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      GITHUB_STEP_SUMMARY: summary
    }
  });

  return {
    status: res.status,
    stdout: res.stdout ?? "",
    summary: fs.existsSync(summary) ? fs.readFileSync(summary, "utf8") : ""
  };
}

test("a clean tree passes quietly and writes no summary", () => {
  const r = runWith({ auditText: "found 0 vulnerabilities", auditExit: 0 });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /No advisories in build-only dependencies/);
  assert.equal(r.summary, "");
  assert.ok(!r.stdout.includes("::warning"), "a clean tree must not warn");
});

test("findings with no critical pass, but warn and write the summary", () => {
  const r = runWith({
    auditText: "# npm audit report\n\nsource-map-js  1.0.0 - 1.2.1\nSeverity: high",
    auditExit: 1,
    jsonText: '{"metadata":{"vulnerabilities":{"critical":0,"high":1}}}'
  });
  assert.equal(r.status, 0, "a non-critical build-only advisory must not fail the build");
  assert.match(r.stdout, /::warning title=Build-only advisories/);
  assert.match(r.summary, /Build-only dependency advisories — testsuite/);
  // The actual npm output has to reach the summary, or the warning is useless.
  assert.match(r.summary, /source-map-js/);
});

test("a critical fails the build", () => {
  // A critical in build tooling can mean a compromised package that injects
  // into the build output — a production problem wearing a dev label.
  const r = runWith({
    auditText: "# npm audit report\nSeverity: critical",
    auditExit: 1,
    jsonText: '{"metadata":{"vulnerabilities":{"critical":2}}}'
  });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /::error title=Critical advisory in build tooling/);
  assert.match(r.stdout, /2 critical/);
});

test("unreadable JSON reports unknown severity rather than passing silently", () => {
  // The whole point. Zero would mean a check that could not run reporting the
  // same thing as a check that passed.
  const r = runWith({
    auditText: "# npm audit report\nSeverity: high",
    auditExit: 1,
    jsonText: "ENOTFOUND registry.npmjs.org"
  });
  assert.equal(r.status, 0, "an unknown severity must not block; the shipped-code gate is separate");
  assert.match(r.stdout, /::warning title=Severity check could not run/);
  assert.match(r.stdout, /unknown whether any are critical/);
});

test("JSON missing the vulnerabilities block is unknown, not zero", () => {
  const r = runWith({
    auditText: "# npm audit report\nSeverity: high",
    auditExit: 1,
    jsonText: '{"metadata":{}}'
  });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Severity check could not run/);
});

test("npm failing to run at all is reported, not treated as clean", () => {
  const r = runWith({ failToRun: true });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /::warning title=Audit could not run/);
  assert.ok(
    !/No advisories/.test(r.stdout),
    "a broken npm must never print the clean-tree message"
  );
});

test("annotations stay on one line so GitHub renders them", () => {
  // A newline inside an annotation truncates it in the UI.
  const r = runWith({
    auditText: "# npm audit report\nmulter\nSeverity: critical\nmultiple\nlines",
    auditExit: 1,
    jsonText: '{"metadata":{"vulnerabilities":{"critical":1}}}'
  });
  for (const line of r.stdout.split("\n").filter((l) => l.startsWith("::"))) {
    assert.ok(!line.slice(2).includes("\n"), `annotation spans lines: ${line}`);
  }
});

test("it refuses to run without a directory", () => {
  const res = spawnSync(process.execPath, [script], { encoding: "utf8" });
  assert.equal(res.status, 2);
  assert.match(res.stderr, /usage/);
});
