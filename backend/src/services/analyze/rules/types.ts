import type { ParsedLog } from "../log/parser.js";
import type { Thresholds } from "../../../config/thresholds.js";
import type { Window } from "../log/series.js";

export type Severity = "BLOCKER" | "WARN" | "INFO";

export type FindingAction = {
  type: "RELOG" | "NOTE" | "INSPECT" | "STOP";
  priority: number;
  text: string;
};

export type Finding = {
  id: string;
  severity: Severity;
  code: string;
  title: string;
  summary: string;
  evidence: { ranges: Array<[number, number]> };
  stats: Record<string, number>;
  tags: string[];
  charts: string[];
  actions: FindingAction[];
};

/**
 * What a rule did. `SKIPPED_*` is a first-class outcome, not a failure — a rule
 * that cannot run must say so rather than returning "nothing found", which is
 * indistinguishable from "checked and clean" to everyone downstream.
 */
export type RuleOutcome =
  | { state: "EVALUATED"; findings: Finding[] }
  | { state: "SKIPPED_NO_DATA"; missing: string[] }
  | { state: "SKIPPED_NO_THRESHOLDS"; missing: string[] };

export type RuleContext = {
  log: ParsedLog;
  thresholds: Thresholds;
  /** Deterministic id generator, so the same log yields the same finding ids. */
  nextId: (code: string, seq: number) => string;
};

export type Rule = {
  code: string;
  title: string;
  severity: Severity;
  /** True when this rule contributes to the safety verdict. */
  safety: boolean;
  /**
   * True when the rule's channels are genuinely optional, so their absence
   * means "not applicable" rather than "could not assess".
   *
   * Only set this where the spec says the channel is optional — fuel pressure
   * is, per the PRD. Wideband is not: a log with no wideband has not been
   * cleared for fueling, it has merely not been checked.
   */
  dataOptional?: boolean;
  run(ctx: RuleContext): RuleOutcome;
};

export type RulesResult = {
  findings: Finding[];
  summary: { blockers: number; warnings: number; info: number };
  /** Safety rules that could not be evaluated. Diffgen is blocked while non-empty. */
  unevaluatedSafetyRules: string[];
  /** Whether the thresholds used were owner-confirmed. Carried into the report. */
  thresholdSource: "OWNER_CONFIRMED" | "CONSERVATIVE_DEFAULTS";
};

export function mkFinding(
  code: string,
  severity: Severity,
  title: string,
  summary: string,
  opts: {
    id: string;
    windows?: Window[];
    ranges?: Array<[number, number]>;
    stats?: Record<string, number>;
    tags?: string[];
    charts?: string[];
    actions?: FindingAction[];
  }
): Finding {
  return {
    id: opts.id,
    severity,
    code,
    title,
    summary,
    evidence: { ranges: opts.ranges ?? [] },
    stats: opts.stats ?? {},
    tags: opts.tags ?? [],
    charts: opts.charts ?? [],
    actions: opts.actions ?? []
  };
}
