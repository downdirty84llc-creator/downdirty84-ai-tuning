#!/usr/bin/env node
/**
 * Test runner.
 *
 * Discovers *.test.ts under src/ and hands explicit paths to tsx, rather than
 * relying on a glob. Two earlier attempts both broke:
 *
 *   "tsx --test src/**\/*.test.ts"     unquoted — bash expanded it and, once a
 *                                      second test file appeared at a shallower
 *                                      depth, matched only that one. 58 tests
 *                                      silently became 6, with no failure.
 *
 *   "tsx --test 'src/**\/*.test.ts'"   quoted — relies on Node expanding the
 *                                      glob, which only Node 22+ does for
 *                                      --test. Passed locally on 22, failed
 *                                      instantly on CI's Node 20.
 *
 * Both failure modes are the dangerous kind: the first reported success while
 * running almost nothing. Doing the discovery here removes the shell and the
 * Node version from the equation entirely, and works on Windows too, where
 * `find` would not.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

function collect(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collect(full));
    else if (entry.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

const files = collect(root).sort();

if (files.length === 0) {
  // An empty run must never look like a pass — that is how a broken discovery
  // pattern hides for months.
  console.error("[test] No *.test.ts files found under src/. Refusing to report success.");
  process.exit(1);
}

console.log(`[test] ${files.length} test file(s):`);
for (const f of files) console.log(`       ${path.relative(root, f)}`);

const result = spawnSync("tsx", ["--test", ...files], { stdio: "inherit", shell: process.platform === "win32" });
process.exit(result.status ?? 1);
