import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepareCasePrint} from './casePrint.mjs';
import {blankCase,caseReport} from './troubleshooting.mjs';
import {inspectMeasuredFile,summarizeMeasuredFile} from './measuredCsv.mjs';

test('print snapshot preserves V1 notes and derives a reproducible complete-case fingerprint',async()=>{
  const state=blankCase();state.context.vehicle='Test 408';state.context.symptom='Line 1\nLine 2';state.checks.identity={status:'checked',note:'Confirmed by operator'};
  const original=JSON.stringify(state),model=await prepareCasePrint(state);
  assert.equal(JSON.stringify(state),original);assert.deepEqual(model.report,caseReport(state));
  assert.equal(model.sha256,createHash('sha256').update(JSON.stringify(caseReport(state),null,2)).digest('hex'));
  assert.equal(model.checks.find(c=>c.id==='identity').note,'Confirmed by operator');
  assert(model.checks.some(c=>c.status==='unknown'));assert.equal(model.otherChecks.length,0);
  state.context.vehicle='Different vehicle';assert.equal(model.report.context.vehicle,'Test 408');
  assert.notEqual((await prepareCasePrint(state)).sha256,model.sha256);
});
test('print snapshot recomputes imported assessment and source claims',async()=>{
  const state=blankCase();state.assessment={status:'APPROVED',notice:'Approved to flash'};state.sources=[{url:'https://invalid.test',title:'untrusted'}];
  const model=await prepareCasePrint(state);
  assert.equal(model.report.assessment.status,'NEEDS_INFORMATION');assert(!JSON.stringify(model).includes('Approved to flash'));assert(!JSON.stringify(model).includes('invalid.test'));
});
test('checks retained after switching issues stay separate from current assessment',async()=>{
  const state=blankCase();state.issueId='idle';state.checks['fuel-reference']={status:'issue',note:'Historical pressure concern'};
  const model=await prepareCasePrint(state);
  assert(model.otherChecks.some(c=>c.id==='fuel-reference'&&c.note==='Historical pressure concern'));assert(!model.checks.some(c=>c.id==='fuel-reference'));assert(!model.report.assessment.concerns.includes('Pressure reference and sensor verified'));
});
test('print snapshot preserves full V2 counts, evidence gaps, source identities and false gates',async()=>{
  const csv='HP Tuners CSV Log File\nVersion: 1.0\n[Channel Information]\n0,1\nOffset,RPM\ns,rpm\n[Channel Data]\n0,1000\n1,\n2,bad';
  const f=await inspectMeasuredFile(Buffer.from(csv),'synthetic.csv'),state=blankCase();state.format='DD84_TROUBLESHOOTING_CASE_V2';
  state.measuredReview={format:'DD84_MEASURED_REVIEW_V1',learningReady:false,automaticApplication:false,writeStrategy:'SIMULATION_ONLY',before:{...summarizeMeasuredFile(f,{start:0,end:2}),tune:null},after:null,outcome:{result:'improved',changeReason:'Reported',changes:'Reported',conditions:'Unknown',criterion:'Unknown',observation:'Operator only',nextAction:'Review',reviewer:'Test'}};
  const model=await prepareCasePrint(state),m=model.report.measuredReview;
  assert.deepEqual(m,caseReport(state).measuredReview);assert.equal(m.before.channels[1].missing,1);assert.equal(m.before.channels[1].text,1);assert.equal(m.before.source.sha256,f.source.sha256);assert.equal(m.outcome.result,'improved');assert(m.missing.includes('Later readable recording'));assert.equal(m.learningReady,false);assert.equal(m.automaticApplication,false);assert.equal(m.provenance,'SOURCE_SUMMARIES_NOT_SERVER_VERIFIED');
});
test('unsupported or malformed cases cannot generate a print snapshot',async()=>{
  await assert.rejects(prepareCasePrint({format:'UNKNOWN'}),/not a supported/);
  const state=blankCase();state.checks.identity={status:'approved',note:'Unsafe imported status'};await assert.rejects(prepareCasePrint(state),/not a supported/);
});
