import {caseReport,commonChecks,issues} from './troubleshooting.mjs';
import {byteFingerprint} from './measuredCsv.mjs';

// A printable snapshot is derived from the same canonical case used by Save.
// Session verification claims, display filters and imported assessments are not evidence.
export async function prepareCasePrint(input){
  const report=caseReport(input),issue=issues.find(i=>i.id===report.issueId);
  const active=[...commonChecks,...issue.checks],ids=new Set(active.map(c=>c.id));
  const withAnswer=c=>({...c,...(report.checks[c.id]??{status:'unknown',note:''})});
  const other=issues.flatMap(i=>i.checks).filter(c=>!ids.has(c.id)&&Object.hasOwn(report.checks,c.id));
  const sha256=await byteFingerprint(new TextEncoder().encode(JSON.stringify(report,null,2)));
  return {report,sha256,issue:issue.title,checks:active.map(withAnswer),otherChecks:other.map(withAnswer)};
}
