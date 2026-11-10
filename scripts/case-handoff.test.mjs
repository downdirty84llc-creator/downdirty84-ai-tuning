import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCaseHandoffSearch,caseHandoffHref,caseHandoffPath,readHandoffSnapshot} from '../src/caseHandoff.mjs';
import {blankCase,caseReport} from '../products/dd84-desktop/troubleshooting.mjs';
const ref={jobId:'11111111-1111-4111-8111-111111111111',caseId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',access:'customer'};
const saved=()=>({case:{id:ref.caseId,jobId:ref.jobId,createdAt:'2026-11-10T15:00:00Z',sha256:'a'.repeat(64),report:caseReport(blankCase())}});
test('ordinary workspace links do not request saved snapshots',()=>{
  assert.equal(parseCaseHandoffSearch(''),null);assert.equal(parseCaseHandoffSearch('?utm_source=test'),null);
});
test('customer and shop links round-trip to exact scoped detail endpoints',()=>{
  for(const access of ['customer','shop']){const requested={...ref,access},href=caseHandoffHref(requested);assert.deepEqual(parseCaseHandoffSearch(href.split('?')[1]),requested);assert.equal(caseHandoffPath(requested),`/api/v1/${access==='shop'?'admin/':''}jobs/${ref.jobId}/troubleshooting-cases/${ref.caseId}`);}
  assert.deepEqual(parseCaseHandoffSearch(`?job=${ref.jobId}&case=${ref.caseId.toUpperCase()}`),ref);
});
test('partial, duplicate, invalid and ambiguous links are rejected before fetching',()=>{
  for(const search of [`?job=${ref.jobId}`,`?case=${ref.caseId}`,`?access=shop`,`?job=bad&case=${ref.caseId}`,`?job=${ref.jobId}&case=${ref.caseId}&access=admin`,`?job=${ref.jobId}&case=${ref.caseId}&case=${ref.caseId}`,`?job=${ref.jobId}&job=${ref.jobId}&case=${ref.caseId}`,`?job=${ref.jobId}&case=${ref.caseId}&access=shop&access=customer`])assert.throws(()=>parseCaseHandoffSearch(search),/case link/);
});
test('returned cases must belong to both the exact requested job and snapshot',()=>{
  for(const key of ['id','jobId']){const response=saved();response.case[key]='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';assert.throws(()=>readHandoffSnapshot(response,ref),/does not match/);}
  assert.throws(()=>readHandoffSnapshot({},ref),/does not match/);
});
test('invalid snapshot metadata and unsupported case bodies are rejected',()=>{
  for(const [key,value]of [['sha256','invalid'],['createdAt','not a date'],['report',{format:'HPT'}]]){const response=saved();response.case[key]=value;assert.throws(()=>readHandoffSnapshot(response,ref));}
});
test('opening canonicalizes assessments and makes an independent local copy',()=>{
  const response=saved();response.case.report.context.vehicle='Synthetic vehicle';response.case.report.assessment={status:'APPROVED'};response.case.report.sources=[{url:'javascript:alert(1)'}];
  const bytes=JSON.stringify(response),opened=readHandoffSnapshot(response,ref);
  assert.equal(opened.report.assessment.status,'NEEDS_INFORMATION');assert(!JSON.stringify(opened).includes('javascript:'));assert.equal(JSON.stringify(response),bytes);
  opened.report.context.vehicle='Local follow-up';assert.equal(response.case.report.context.vehicle,'Synthetic vehicle');
});
