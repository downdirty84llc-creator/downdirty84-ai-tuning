import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {captureLearningMeasurement,recheckLearningMeasurement} from './learningMeasurements.mjs';
import {attachLearningMeasurement,makeLearningCase} from './learning.mjs';
import {compareLearningWindows,reopenLearningComparison,MAX_LEARNING_COMPARISON_BYTES} from './learningComparison.mjs';
const {validateRequest}=createRequire(import.meta.url)('./saveFile.cjs');
const a='a'.repeat(64),b='b'.repeat(64);
const selections=[{role:'RPM',channelId:'1',evidence:'Synthetic RPM selection'},
  {role:'MAP',channelId:'2',evidence:'Synthetic pressure selection'}];
const csv=(rows,unit='kPa',id='1')=>'HP Tuners CSV Log File\nVersion: 1.0\n[Channel Information]\n0,'+id+',2\nOffset,Engine RPM,Manifold Absolute Pressure\ns,rpm,'+unit+'\n[Channel Data]\n'+rows;
const beforeCsv=csv('0,0,90\n1,1000,95\n1,,96\n2,NaN,97\n4,2000,100\n');
const afterCsv=csv('10,1100,92\n11,1300,94\n12,,96\n14,2200,100\n');
const options=()=>({beforeRole:'BEFORE_FINAL_LOG',afterRole:'AFTER_FINAL_LOG',channelRole:'RPM',
  beforeRange:{start:0,end:2},afterRange:{start:10,end:12},note:'Synthetic windows; load is not matched.'});
async function fixture(raw=afterCsv,afterSelections=selections){
  const before=await captureLearningMeasurement({raw:beforeCsv,name:'before.csv',tuneSha256:a,associationNote:'Synthetic original',selections},'BEFORE_FINAL_LOG','Synthetic earlier run');
  const after=await captureLearningMeasurement({raw,name:'after.csv',tuneSha256:b,associationNote:'Synthetic final',selections:afterSelections},'AFTER_FINAL_LOG','Synthetic later run');
  let c={vehicle:'Synthetic test vehicle',displacementLiters:5.3,camNotes:'Test cam notes',buildNotes:'Test build notes',
    files:[{role:'ORIGINAL',name:'original.hpt',bytes:4,sha256:a,tuneSha256:null},{role:'FINAL',name:'final.hpt',bytes:4,sha256:b,tuneSha256:null}]};
  c=attachLearningMeasurement(attachLearningMeasurement(c,before),after);
  return {c,receipts:[before,after]};
}
test('independent inclusive windows preserve zeros, duplicates, gaps, labels and exact case identity',async()=>{
  const {c,receipts}=await fixture(),r=await compareLearningWindows(c,receipts,options());
  assert.deepEqual(r.learningCase,{sha256:createHash('sha256').update(JSON.stringify(makeLearningCase(c))).digest('hex'),hashScope:'CANONICAL_LEARNING_CASE_V2_JSON'});
  assert.deepEqual(r.before.reference,c.measurements[0]);assert.deepEqual(r.after.reference,c.measurements[1]);
  const summary=t=>({rows:t.selectedRowCount,numeric:t.numericCount,missing:t.missingCount,text:t.textCount,min:t.min,max:t.max,duplicates:t.time.duplicateTimes});
  assert.deepEqual(summary(r.before.timeline),{rows:4,numeric:2,missing:1,text:1,min:0,max:1000,duplicates:1});
  assert.deepEqual(summary(r.after.timeline),{rows:3,numeric:2,missing:1,text:0,min:1100,max:1300,duplicates:0});
  assert.deepEqual(r.before.timeline.bins,[
    {start:0,end:1,numericCount:1,missingCount:0,textCount:0,min:0,max:0},
    {start:1,end:2,numericCount:1,missingCount:1,textCount:1,min:1000,max:1000}
  ]);
  assert.equal(r.learningReady,false);assert.equal(r.automaticApplication,false);
  assert.equal(r.writeStrategy,'SIMULATION_ONLY');assert.equal(Object.hasOwn(r,'correction'),false);
  assert.deepEqual(JSON.parse(validateRequest({filename:'comparison.json',text:JSON.stringify(r)})),r);
});
test('empty, missing-only, text-only and repeated equal-time windows never borrow neighboring values',async()=>{
  const {c,receipts}=await fixture();
  for(const [range,expected] of [[{start:2.5,end:3.5},[0,0,0,0,null,null]],
    [{start:2,end:2},[1,0,0,1,null,null]],[{start:1,end:1},[2,1,1,0,1000,1000]]]){
    const r=await compareLearningWindows(c,receipts,{...options(),beforeRange:range,afterRange:{start:12,end:12}});
    const t=r.before.timeline;
    assert.deepEqual([t.selectedRowCount,t.numericCount,t.missingCount,t.textCount,t.min,t.max],expected);
    assert.equal(r.after.timeline.numericCount,0);assert.equal(r.after.timeline.missingCount,1);assert.equal(r.after.timeline.min,null);
  }
});
test('requires two checked receipts; cloned and edited references cannot supply source data',async()=>{
  const {c,receipts}=await fixture();
  for(const candidates of [[],[receipts[0]],JSON.parse(JSON.stringify(receipts))])
    await assert.rejects(compareLearningWindows(c,candidates,options()),/Recheck both/);
  const edited=structuredClone(c);edited.measurements[0].note='Changed placement statement';
  await assert.rejects(compareLearningWindows(edited,receipts,options()),/Recheck both/);
});
test('compares role mappings across different channel IDs but requires identical exported units',async()=>{
  const changed=await fixture(afterCsv.replace('0,1,2','0,9,2'),[{...selections[0],channelId:'9'},selections[1]]);
  const r=await compareLearningWindows(changed.c,changed.receipts,options());
  assert.equal(r.after.timeline.channel.id,'9');assert.equal(r.after.timeline.min,1100);
  const mismatch=await fixture(afterCsv.replace('s,rpm,kPa','s,rpm,psi'));
  await assert.rejects(compareLearningWindows(mismatch.c,mismatch.receipts,{...options(),channelRole:'MAP'}),/identical exported units/);
});
test('rejects absent roles, missing stages, reversed order and identical CSV timeline reuse',async()=>{
  const {c,receipts}=await fixture();
  for(const patch of [{beforeRole:'AFTER_FINAL_LOG',afterRole:'BEFORE_FINAL_LOG'},{afterRole:'BEFORE_FINAL_LOG'},{beforeRole:'INVALID'}])
    await assert.rejects(compareLearningWindows(c,receipts,{...options(),...patch}),/timeline order/);
  await assert.rejects(compareLearningWindows(c,receipts,{...options(),beforeRole:'EARLIER_LOG'}),/Attach a reviewed/);
  await assert.rejects(compareLearningWindows(c,receipts,{...options(),channelRole:'MEASURED_LAMBDA'}),/same reviewed/);
  const reused=structuredClone(c);reused.measurements[1].source.textSha256=reused.measurements[0].source.textSha256;
  await assert.rejects(compareLearningWindows(reused,receipts,options()),/multiple timeline/);
});
test('requires explicit valid bounded windows and review notes',async()=>{
  const {c,receipts}=await fixture();
  for(const beforeRange of [null,undefined,{start:-1,end:2},{start:2,end:1},{start:0,end:5},{start:NaN,end:2},{start:0,end:Infinity},{start:'0',end:2}])
    await assert.rejects(compareLearningWindows(c,receipts,{...options(),beforeRange}));
  for(const note of ['', ' ', 'a'.repeat(2001),null])await assert.rejects(compareLearningWindows(c,receipts,{...options(),note}),/Describe/);
});
test('reopen discards forged statistics and labels, recomputes from renamed matching sources, and round-trips exactly',async()=>{
  const {c,receipts}=await fixture(),r=await compareLearningWindows(c,receipts,options());
  const altered=structuredClone(r);altered.before.timeline.min=999;altered.after.timeline.channel.name='Forged';altered.vehicle='Forged vehicle';
  const fresh=[await recheckLearningMeasurement(c.measurements[0],beforeCsv,'renamed-before.csv'),await recheckLearningMeasurement(c.measurements[1],afterCsv,'renamed-after.csv')];
  assert.deepEqual(await reopenLearningComparison(JSON.stringify(altered),c,fresh),r);
  assert.deepEqual(await reopenLearningComparison(JSON.stringify(r),c,receipts),r);
});
test('reopen rejects different cases, references, gates, method and oversized records',async()=>{
  const {c,receipts}=await fixture(),r=await compareLearningWindows(c,receipts,options());
  await assert.rejects(reopenLearningComparison(JSON.stringify(r),{...c,buildNotes:'Different build'},receipts),/matching learning case/);
  await assert.rejects(reopenLearningComparison(JSON.stringify(r),c,[]),/Recheck both/);
  const altered=structuredClone(r);altered.before.reference.calibration.sha256=b;
  await assert.rejects(reopenLearningComparison(JSON.stringify(altered),c,receipts),/source references/);
  for(const patch of [{format:'BAD'},{status:'RELEASED'},{writeStrategy:'REAL'},{method:'OTHER'},
    {learningReady:true},{automaticApplication:true},{noteProvenance:'VERIFIED'},
    {learningCase:{...r.learningCase,hashScope:'RAW'}}])
    await assert.rejects(reopenLearningComparison(JSON.stringify({...r,...patch}),c,receipts),/Unsupported/);
  await assert.rejects(reopenLearningComparison(' '.repeat(MAX_LEARNING_COMPARISON_BYTES+1),c,receipts),/1 MB/);
  await assert.rejects(reopenLearningComparison('{',c,receipts));
});
test('asynchronous comparison snapshots case, notes and ranges before caller changes',async()=>{
  const {c,receipts}=await fixture(),input=options(),original=structuredClone(c),pending=compareLearningWindows(c,receipts,input);
  c.vehicle='Changed';c.measurements[0].note='Changed';input.beforeRange.end=4;input.note='Changed';
  const r=await pending;
  assert.equal(r.vehicle,'Synthetic test vehicle');assert.equal(r.selection.beforeRange.end,2);
  assert.equal(r.note,options().note);assert.equal(r.before.reference.note,'Synthetic earlier run');
  assert.equal(r.learningCase.sha256,createHash('sha256').update(JSON.stringify(original)).digest('hex'));
});
test('supports earlier-to-before-final comparison without inventing a final outcome',async()=>{
  const {c,receipts}=await fixture();
  const earlier=await captureLearningMeasurement({raw:beforeCsv.replace('1000','900'),name:'earlier.csv',tuneSha256:a,
    associationNote:'Synthetic earlier tune',selections},'EARLIER_LOG','Synthetic earlier stage');
  const next=attachLearningMeasurement(c,earlier);
  const r=await compareLearningWindows(next,[...receipts,earlier],{...options(),beforeRole:'EARLIER_LOG',afterRole:'BEFORE_FINAL_LOG',afterRange:{start:0,end:2}});
  assert.equal(r.before.timeline.max,900);assert.equal(r.after.timeline.max,1000);assert.equal(r.learningReady,false);
});
test('V2 comparison recomputes context from checked sources and upgrades legacy V1 reports',async()=>{
  const {c,receipts}=await fixture(afterCsv.replace('s,rpm,kPa','s,rpm,psi'));
  const result=await compareLearningWindows(c,receipts,options());
  assert.equal(result.format,'DD84_LEARNING_COMPARISON_V2');
  assert.equal(result.operatingContext.channels.find(c=>c.role==='MAP').status,'UNIT_MISMATCH');
  const forged=structuredClone(result);forged.operatingContext={operatingConditionsMatched:true,channels:[]};
  assert.deepEqual(await reopenLearningComparison(JSON.stringify(forged),c,receipts),result);
  const {operatingContext,...legacy}=result;legacy.format='DD84_LEARNING_COMPARISON_V1';
  assert.deepEqual(await reopenLearningComparison(JSON.stringify(legacy),c,receipts),result);
  assert.equal(result.operatingContext.operatingConditionsMatched,false);
});
