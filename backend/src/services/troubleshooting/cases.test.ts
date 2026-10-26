import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalCase} from './cases.js';
import {blankCase,caseReport,commonChecks} from '../../../shared/troubleshooting.mjs';

test('imported claims and source URLs cannot grant case approval',()=>{
  const report=blankCase();
  const actual=canonicalCase({...report,assessment:{status:'READY_FOR_HUMAN_REVIEW'},sources:[{url:'javascript:alert(1)'}],jobId:'other-job'});
  assert.deepEqual(actual.report,caseReport(report));
  assert.equal(actual.report.assessment.status,'NEEDS_INFORMATION');
  assert.ok(actual.report.assessment.missing.length>0);
  assert.equal(JSON.stringify(actual.report).includes('javascript:'),false);
});

test('storage key order does not change fingerprints or idempotent retry identity',()=>{
  const report=blankCase();
  for(const check of commonChecks)report.checks[check.id]={status:'checked',note:'Synthetic observation'};
  report.context.vehicle='Synthetic vehicle';
  const first=canonicalCase(report);
  const reverse=(value:any):any=>Array.isArray(value)?value.map(reverse):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([key,item])=>[key,reverse(item)])):value;
  const second=canonicalCase(reverse(JSON.parse(JSON.stringify(first.report))));
  assert.equal(second.sha256,first.sha256);
  assert.match(first.sha256,/^[0-9a-f]{64}$/);
  assert.deepEqual(second.report,first.report);
  const changed=structuredClone(report);changed.context.vehicle='Another vehicle';
  assert.notEqual(canonicalCase(changed).sha256,first.sha256);
});

test('snapshots retain operator concerns without mutating the source object',()=>{
  const report=blankCase();report.relationship='mismatch';
  report.context.symptom='Synthetic pressure concern';
  const before=structuredClone(report),saved=canonicalCase(report);
  assert.deepEqual(report,before);
  assert.equal(saved.report.assessment.status,'CONCERNS_RECORDED');
  report.context.symptom='Later edit';
  assert.equal(saved.report.context.symptom,before.context.symptom);
});

test('unknown formats, catalog versions, fields and statuses fail clearly',()=>{
  for(const value of [null,[],undefined,{...blankCase(),format:'HPT'}, {...blankCase(),catalogVersion:'future'}, {...blankCase(),issueId:'unknown'}, {...blankCase(),relationship:'approved'}, {...blankCase(),context:{vehicle:'x'.repeat(10000)}}, {...blankCase(),checks:{[commonChecks[0].id]:{status:'approved',note:''}}}])assert.throws(()=>canonicalCase(value));
});

test('the size limit counts UTF-8 bytes before dropping unknown imported data',()=>{
  const value={...blankCase(),untrusted:'🚗'.repeat(33000)};
  assert.ok(JSON.stringify(value).length<128*1024);
  assert.throws(()=>canonicalCase(value),/128 KiB/);
});
