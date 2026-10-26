export type TroubleshootingCase = {
  format: 'DD84_TROUBLESHOOTING_CASE_V1';
  catalogVersion: string;
  issueId: string;
  context: Record<string, string>;
  relationship: 'unknown' | 'confirmed' | 'mismatch';
  checks: Record<string, {status:'unknown'|'checked'|'issue'|'na';note:string}>;
};
export type CaseAssessment = {
  status:'CONCERNS_RECORDED'|'NEEDS_INFORMATION'|'READY_FOR_HUMAN_REVIEW';
  concerns:string[];missing:string[];next:string;channels:string[];sourceIds:string[];notice:string;
};
export type CaseReport = TroubleshootingCase & {
  assessment:CaseAssessment;
  sources:Array<{id:string;kind:string;title:string;url:string}>;
};
export function blankCase():TroubleshootingCase;
export function validateCase(value:unknown):TroubleshootingCase;
export function parseCase(value:string):TroubleshootingCase;
export function caseReport(value:unknown):CaseReport;
export function assessCase(value:unknown):CaseAssessment;
export const catalogVersion:string;
export const fields:Array<[string,string,number]>;
export const issues:Array<{id:string;title:string;summary:string;checks:Array<{id:string;label:string;detail:string}>;channels:string[];sourceIds:string[];next:string}>;
export const commonChecks:Array<{id:string;label:string;detail:string}>;
