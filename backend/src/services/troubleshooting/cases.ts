import {createHash} from 'node:crypto';
import {caseReport, parseCase, type CaseReport} from '../../../shared/troubleshooting.mjs';

function stableJson(value:unknown):string {
  if(Array.isArray(value))return '['+value.map(stableJson).join(',')+']';
  if(value!==null&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stableJson((value as Record<string,unknown>)[key])).join(',')+'}';
  return JSON.stringify(value);
}

export function canonicalCase(value:unknown):{report:CaseReport;sha256:string} {
  // Limit raw input before stripping imported assessments or other derived claims.
  const text=JSON.stringify(value);
  if(typeof text!=='string'||Buffer.byteLength(text,'utf8')>128*1024)throw Error('Choose a troubleshooting case smaller than 128 KiB.');
  const report=caseReport(parseCase(text));
  // jsonb reorders keys; the fingerprint and retry identity must survive storage.
  return {report,sha256:createHash('sha256').update(stableJson(report)).digest('hex')};
}
