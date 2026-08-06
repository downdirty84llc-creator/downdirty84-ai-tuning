import { resolveThresholds, type ThresholdSource } from "../../config/thresholds.js";
import type { ProfileKey } from "../../config/thresholds.profiles.js";
import { parseLog, LogParseError, type ParsedLog } from "./log/parser.js";
import { validateLog, type Validation } from "./validation.js";
import { runRules, diffgenAllowed, type RulesResult } from "./rules/index.js";

export type AnalysisOutcome =
  | {
      ok: true;
      log: ParsedLog;
      validation: Validation;
      rules: RulesResult;
      diffgen: { allowed: boolean; reason: string | null };
      thresholdSource: ThresholdSource;
      /** Which profile judged this run. null means the job did not say. */
      thresholdProfile: ProfileKey | null;
    }
  | {
      ok: false;
      stage: "PARSE" | "VALIDATE";
      validation: Validation | null;
      error: { code: string; message: string };
    };

/**
 * Run the full analysis for one log file.
 *
 * Ordering matters and is deliberate: a log that fails validation never reaches
 * the rules. Running safety rules over data validation already rejected would
 * produce findings nobody should act on, and — worse — an absence of findings
 * that looks like a clean result.
 */
export function analyzeLogContent(
  content: Buffer | string,
  runId: string,
  profile: ProfileKey | null = null
): AnalysisOutcome {
  // Default null, not the confirmed profile: a caller that forgets to pass one
  // gets the cautious answer, reported as unconfirmed.
  const { thresholds, source } = resolveThresholds(profile);

  let log: ParsedLog;
  try {
    log = parseLog(content);
  } catch (err) {
    const message = err instanceof LogParseError ? err.message : String((err as Error)?.message ?? err);
    return {
      ok: false,
      stage: "PARSE",
      validation: null,
      error: { code: "LOG_PARSE_FAILED", message }
    };
  }

  const validation = validateLog(log);
  if (validation.status === "FAIL") {
    return {
      ok: false,
      stage: "VALIDATE",
      validation,
      error: {
        code: "LOG_VALIDATION_FAILED",
        message: validation.notes.join(" ") || "Log did not pass validation."
      }
    };
  }

  const rules = runRules(log, thresholds, runId, source);
  return {
    ok: true,
    log,
    validation,
    rules,
    diffgen: diffgenAllowed(rules),
    thresholdSource: source,
    thresholdProfile: profile
  };
}

/**
 * Combine several uploaded files into one analysis.
 *
 * MVP behaviour: the largest parseable log wins. Merging multiple logs into a
 * single time base is not a concatenation problem — separate drives have
 * separate warmups, fuel states and conditions, and stitching them would
 * produce evidence windows that point at moments which never happened.
 * Analysing the most substantial one and saying so is the honest option.
 */
export function analyzeUploads(
  files: Array<{ uploadId: string; filename: string; content: Buffer }>,
  runId: string,
  profile: ProfileKey | null = null
): { outcome: AnalysisOutcome; usedUploadId: string | null; skipped: string[] } {
  if (files.length === 0) {
    return {
      outcome: {
        ok: false,
        stage: "PARSE",
        validation: null,
        error: { code: "NO_FILES", message: "No readable uploads were provided." }
      },
      usedUploadId: null,
      skipped: []
    };
  }

  const ranked = [...files].sort((a, b) => b.content.length - a.content.length);
  const skipped: string[] = [];

  for (const file of ranked) {
    const outcome = analyzeLogContent(file.content, runId, profile);
    if (outcome.ok) {
      return {
        outcome,
        usedUploadId: file.uploadId,
        skipped: [...skipped, ...ranked.filter((f) => f !== file).map((f) => f.filename)]
      };
    }
    skipped.push(`${file.filename}: ${outcome.error.message}`);
  }

  // Nothing parsed and validated — report the first (largest) file's failure,
  // which is the one the customer most likely cared about.
  return {
    outcome: analyzeLogContent(ranked[0].content, runId, profile),
    usedUploadId: ranked[0].uploadId,
    skipped
  };
}
