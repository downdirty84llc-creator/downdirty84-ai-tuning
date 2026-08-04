import crypto from "node:crypto";
import type { Thresholds } from "../../../config/thresholds.js";
import type { ParsedLog } from "../log/parser.js";
import { OPTIONAL_CHANNELS } from "../log/channels.js";
import { has } from "../log/series.js";
import { SAFETY_RULES } from "./safety.js";
import { DRIVABILITY_RULES } from "./drivability.js";
import { mkFinding, type Finding, type Rule, type RulesResult } from "./types.js";

export * from "./types.js";

/**
 * Finding ids are derived from the run and the rule rather than random, so
 * re-analysing the same log produces the same ids. A customer looking at a
 * finding today and a support person looking at it next week need the same
 * reference.
 */
function makeIdFactory(runId: string) {
  return (code: string, seq: number) =>
    crypto.createHash("sha256").update(`${runId}:${code}:${seq}`).digest("hex").slice(0, 32)
      .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
}

/**
 * Run every rule and assemble the Findings document.
 *
 * The important behaviour here is what happens when a rule *cannot* run. A
 * skipped safety rule is recorded in `unevaluatedSafetyRules`, which blocks
 * diffgen. "We could not check this" must never collapse into "this is fine".
 */
export function runRules(
  log: ParsedLog,
  thresholds: Thresholds,
  runId: string
): RulesResult {
  const nextId = makeIdFactory(runId);
  const findings: Finding[] = [];
  const unevaluatedSafetyRules: string[] = [];
  const thresholdGaps = new Map<string, string[]>();
  const dataGaps = new Map<string, string[]>();

  const allRules: Rule[] = [...SAFETY_RULES, ...DRIVABILITY_RULES];

  for (const rule of allRules) {
    const outcome = rule.run({ log, thresholds, nextId });

    if (outcome.state === "EVALUATED") {
      findings.push(...outcome.findings);
      continue;
    }

    if (outcome.state === "SKIPPED_NO_THRESHOLDS") {
      // An unset threshold always leaves the rule unevaluated: the check the
      // owner configured simply did not happen.
      if (rule.safety) unevaluatedSafetyRules.push(rule.code);
      thresholdGaps.set(rule.code, outcome.missing);
    } else {
      // Missing data only counts as unevaluated when the data was required.
      // A rule whose channels are genuinely optional is "not applicable" here,
      // not "unchecked".
      if (rule.safety && !rule.dataOptional) unevaluatedSafetyRules.push(rule.code);
      dataGaps.set(rule.code, outcome.missing);
    }
  }

  // R1 — thresholds unset. One finding listing every affected rule, rather
  // than one per rule, so the owner sees a single actionable item.
  if (thresholdGaps.size > 0) {
    const rules = [...thresholdGaps.keys()].sort();
    const keys = [...new Set([...thresholdGaps.values()].flat())].sort();
    findings.push(
      mkFinding(
        "R1_THRESHOLD_UNSET",
        "INFO",
        "Some checks could not run — thresholds not configured",
        `${rules.length} rule(s) were skipped because their thresholds are unset: ${rules.join(", ")}. ` +
          `These checks were NOT performed, and this log has therefore not been cleared for them.`,
        {
          id: nextId("R1_THRESHOLD_UNSET", 1),
          stats: { skippedRules: rules.length, missingThresholds: keys.length },
          tags: ["CONFIG"],
          actions: [
            {
              type: "NOTE",
              priority: 1,
              text: `Set these in backend/src/config/thresholds.ts: ${keys.join(", ")}.`
            }
          ]
        }
      )
    );
  }

  // R2 — a rule had thresholds but not the data.
  if (dataGaps.size > 0) {
    const rules = [...dataGaps.keys()].sort();
    const needed = [...new Set([...dataGaps.values()].flat())].sort();
    findings.push(
      mkFinding(
        "R2_RULE_NOT_APPLICABLE",
        "INFO",
        "Some checks could not run — required channels absent",
        `${rules.length} rule(s) were skipped for lack of data: ${rules.join(", ")}.`,
        {
          id: nextId("R2_RULE_NOT_APPLICABLE", 1),
          stats: { skippedRules: rules.length },
          tags: ["COVERAGE"],
          actions: [
            { type: "RELOG", priority: 1, text: `Add these to the next log if available: ${needed.join(", ")}.` }
          ]
        }
      )
    );
  }

  // R0 — optional channels missing. Informational only.
  const missingOptional = OPTIONAL_CHANNELS.filter((c) => !has(log, c));
  if (missingOptional.length > 0) {
    findings.push(
      mkFinding(
        "R0_MISSING_CHANNELS",
        "INFO",
        "Optional channels not present",
        "Some optional channels are missing. Findings are still valid, but additional " +
          "channels can improve confidence.",
        {
          id: nextId("R0_MISSING_CHANNELS", 1),
          stats: { missingCount: missingOptional.length },
          tags: ["COVERAGE"],
          actions: [
            {
              type: "NOTE",
              priority: 1,
              text: `If available, add: ${missingOptional.join(", ")}.`
            }
          ]
        }
      )
    );
  }

  const summary = {
    blockers: findings.filter((f) => f.severity === "BLOCKER").length,
    warnings: findings.filter((f) => f.severity === "WARN").length,
    info: findings.filter((f) => f.severity === "INFO").length
  };

  return { findings, summary, unevaluatedSafetyRules };
}

/**
 * Whether diffgen may run.
 *
 * Two independent stops: an actual blocker, and any safety rule that could not
 * be evaluated. The second is the one that matters most — proposing a
 * calibration change from a log whose safety was never assessed is precisely
 * the artefact this system exists to prevent.
 */
export function diffgenAllowed(result: RulesResult): { allowed: boolean; reason: string | null } {
  if (result.summary.blockers > 0) {
    return { allowed: false, reason: `${result.summary.blockers} safety blocker(s) present.` };
  }
  if (result.unevaluatedSafetyRules.length > 0) {
    return {
      allowed: false,
      reason:
        `Safety rules could not be evaluated: ${result.unevaluatedSafetyRules.join(", ")}. ` +
        `An unevaluated safety check is not a pass.`
    };
  }
  return { allowed: true, reason: null };
}
