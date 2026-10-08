#!/usr/bin/env node
/**
 * Report advisories in build-only dependencies, without failing the build.
 *
 * Why this exists
 * ---------------
 * The two kinds of dependency carry different risk, and one gate cannot serve
 * both. Packages that are bundled and executed in a customer's browser, or
 * that run in the production server, are an exposure: those are gated
 * separately at `high`, and they block.
 *
 * Build tooling — vite, typescript, tsx, the type packages — runs on the CI
 * runner and never reaches a customer. The frontend gate used to fail the
 * build on any such advisory down to `low`, and it turned main red twice in a
 * month for exactly that. A red main for something unreachable does not make
 * anyone safer; it teaches people that red main is usually noise, so the next
 * time it is not noise they click through it the same way.
 *
 * So these are reported loudly and not fatally: a warning annotation on the
 * run, plus the full npm output in the job summary where it can be read
 * without digging through a log.
 *
 * The exception is `critical`. A critical in build tooling can mean a
 * compromised package that injects into the bundle — a production problem
 * wearing a dev-dependency label — so that still stops the line.
 *
 * Why a script rather than inline YAML
 * ------------------------------------
 * Both the backend and frontend jobs need identical behaviour. Two copies of
 * forty lines of embedded shell is a drift trap, and this repository has
 * already been bitten by the same fact living in two places (a hardcoded price
 * list against Stripe's real one, and a catalogue against its own metadata).
 * One implementation, called twice, with its own tests.
 *
 * Usage: node scripts/audit-report.mjs <npm-root> [label]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const dir = process.argv[2];
const label = process.argv[3] ?? dir;

if (!dir) {
  console.error("usage: node scripts/audit-report.mjs <npm-root> [label]");
  process.exit(2);
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function runNpm(args) {
  return spawnSync(npm, args, { cwd: dir, encoding: "utf8", shell: false });
}

/**
 * How many critical advisories, read from the machine-readable output.
 *
 * Returns null — not 0 — when that cannot be determined. Zero would mean a
 * check that could not run reporting the same thing as a check that passed,
 * which is the failure mode this pipeline keeps finding and keeps refusing to
 * ship. The caller says so out loud instead.
 */
export function criticalCount(jsonText) {
  try {
    const n = JSON.parse(jsonText)?.metadata?.vulnerabilities?.critical;
    return Number.isInteger(n) ? n : null;
  } catch {
    return null;
  }
}

/** GitHub reads these from stdout; locally they are just legible lines. */
function annotate(level, title, message) {
  const clean = String(message).replace(/\r?\n/g, " ").trim();
  console.log(`::${level} title=${title}::${clean}`);
}

function appendSummary(text) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) {
    // Running locally. Print it rather than discarding it.
    console.log(text);
    return;
  }
  fs.appendFileSync(file, text);
}

const report = runNpm(["audit", "--audit-level=low"]);
const output = `${report.stdout ?? ""}${report.stderr ?? ""}`.trim();

// npm exits non-zero when it found something at or above the level.
if (report.status === 0) {
  console.log(`No advisories in build-only dependencies (${label}).`);
  process.exit(0);
}

// npm itself failed to run, which is not the same as a clean tree.
if (report.error || output === "") {
  annotate(
    "warning",
    "Audit could not run",
    `npm audit produced no output for ${label} (${report.error?.message ?? "empty output"}). ` +
      `Nothing was checked here; the blocking gate for shipped code is a separate step.`
  );
  process.exit(0);
}

appendSummary(
  [
    `### Build-only dependency advisories — ${label}`,
    "",
    "These packages run on the CI runner and are not shipped, so they do not",
    "reach customers. Worth fixing, not worth blocking a deploy.",
    "",
    "```",
    output,
    "```",
    ""
  ].join("\n")
);

annotate(
  "warning",
  "Build-only advisories",
  `npm audit found advisories in ${label} build dependencies. Not blocking — see the job summary. Run 'npm audit fix' in ${dir}.`
);

const criticals = criticalCount(runNpm(["audit", "--json"]).stdout ?? "");

if (criticals === null) {
  annotate(
    "warning",
    "Severity check could not run",
    `Advisories were found in ${label}, but 'npm audit --json' could not be read, ` +
      `so it is unknown whether any are critical. Run 'npm audit' locally. Not blocking, ` +
      `because the blocking gate for shipped code is a separate step.`
  );
  process.exit(0);
}

if (criticals > 0) {
  annotate(
    "error",
    "Critical advisory in build tooling",
    `${criticals} critical advisory(ies) in ${label} build dependencies. A critical in ` +
      `build tooling can mean a compromised package that injects into the build output, ` +
      `so this blocks.`
  );
  process.exit(1);
}

process.exit(0);
