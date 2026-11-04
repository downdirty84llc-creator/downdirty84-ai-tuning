export type MeasuredReview={
  format:'DD84_MEASURED_REVIEW_V1';writeStrategy:'SIMULATION_ONLY';learningReady:false;automaticApplication:false;
  before:unknown;after:unknown;outcome:Record<string,string>;comparisons:unknown[];unmatched:unknown[];missing:string[];
  status:'NEEDS_MORE_EVIDENCE'|'DOCUMENTED_FOR_HUMAN_REVIEW';provenance:string;limitations:string[];
};
export function normalizeMeasuredReview(value:unknown):MeasuredReview;
export function parseMeasuredReview(value:string):MeasuredReview;
export const MAX_MEASURED_REPORT_BYTES:number;
