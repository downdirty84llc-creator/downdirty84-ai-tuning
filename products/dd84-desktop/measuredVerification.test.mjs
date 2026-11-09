import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectMeasuredFile,summarizeMeasuredFile} from './measuredCsv.mjs';
import {normalizeMeasuredReview} from './measuredReview.mjs';
import {recheckMeasuredSource} from './measuredVerification.mjs';
const csv='HP Tuners CSV Log File\nVersion: 1.0\n[Channel Information]\n0,1,2,3\nOffset,RPM,MAP,Spark\ns,rpm,kPa,deg\n[Channel Data]\n0,1000,50,10\n1,2000,60,20\n1,,60,\n2,3000,70,30\n';
const bytes=s=>new TextEncoder().encode(s);
async function fixture(raw=bytes(csv),name='original.csv'){
  const f=await inspectMeasuredFile(raw,name);
  return normalizeMeasuredReview({format:'DD84_MEASURED_REVIEW_V1',writeStrategy:'SIMULATION_ONLY',learningReady:false,automaticApplication:false,
    before:{...summarizeMeasuredFile(f,{start:f.inspection.start,end:f.inspection.end,filters:[{channelId:f.inspection.channels[1].id,min:0,max:2000}]}),tune:null},after:null,
    outcome:{result:'unassessed',changeReason:'',changes:'',conditions:'',criterion:'',observation:'',nextAction:'',reviewer:''}});
}
test('recheck verifies every saved statistic with original filters and keeps the case unchanged',async()=>{
  const r=await fixture(),copy=structuredClone(r);
  const result=await recheckMeasuredSource(r,'before',bytes(csv),'original.csv');
  assert.equal(result.status,'SOURCE_AND_SUMMARY_MATCH');assert.equal(result.filenameChanged,false);assert.deepEqual(result.differences,[]);
  assert.equal(result.learningReady,false);assert.equal(result.automaticApplication,false);assert.deepEqual(r,copy);
  assert.equal(r.before.rows,2);assert.equal(r.before.invalidFilterRows,1);
});
test('renaming identical bytes is accepted, same-name changed bytes and opposite sides are rejected',async()=>{
  const r=await fixture();assert.equal((await recheckMeasuredSource(r,'before',bytes(csv),'renamed.csv')).filenameChanged,true);
  for(const raw of [csv.replace('10\n','11\n'),csv.replaceAll('\n','\r\n')])assert.equal((await recheckMeasuredSource(r,'before',bytes(raw),'original.csv')).status,'FILE_MISMATCH');
  const f=await inspectMeasuredFile(bytes(csv.replace('20\n','21\n')),'later.csv');r.after={...summarizeMeasuredFile(f,{start:0,end:2}),tune:null};
  assert.equal((await recheckMeasuredSource(r,'after',bytes(csv),'original.csv')).status,'FILE_MISMATCH');
});
test('matching source hashes cannot hide altered statistics, channel metadata or source metadata',async()=>{
  const original=await fixture();
  for(const mutate of [r=>r.before.channels[3].mean=16,r=>r.before.channels[3].unit='rpm',r=>r.before.channels[3].id='999',r=>r.before.source.bytes++,r=>r.before.source.encoding='WINDOWS-1252',r=>r.before.selection.filters[0].name=r.before.channels[1].name='Wrong RPM']){
    const r=structuredClone(original);mutate(r);normalizeMeasuredReview(r);
    const checked=await recheckMeasuredSource(r,'before',bytes(csv),'original.csv');assert.equal(checked.status,'SUMMARY_MISMATCH');assert(checked.differences.length);
  }
});
test('saved row coverage, impossible windows and filtered no-data summaries are rechecked',async()=>{
  const r=await fixture();r.before.windowRows++;r.before.outsideFilterRows++;
  assert((await recheckMeasuredSource(r,'before',bytes(csv),'original.csv')).differences.includes('windowRows'));
  r.before.selection.end=100;assert.equal((await recheckMeasuredSource(r,'before',bytes(csv),'original.csv')).status,'SUMMARY_MISMATCH');
  const f=await inspectMeasuredFile(bytes(csv),'original.csv');r.before={...summarizeMeasuredFile(f,{start:0,end:2,filters:[{channelId:'1',min:4000,max:5000}]}),tune:null};
  assert.equal((await recheckMeasuredSource(r,'before',bytes(csv),'original.csv')).status,'SOURCE_AND_SUMMARY_MATCH');assert.equal(r.before.rows,0);
});
test('Holley Windows-1252 blank-column exports recheck without encoding conversion',async()=>{
  const raw=Buffer.from('Point Number,RTC,RPM,Spark,\n,[sec],[RPM],[°],\n1,0,900,25,0\n2,1,1000,26,0','latin1');
  const r=await fixture(raw);assert.equal((await recheckMeasuredSource(r,'before',raw,'copy.csv')).status,'SOURCE_AND_SUMMARY_MATCH');
});
test('malformed files, missing sides and unsupported claims never produce a verification',async()=>{
  const r=await fixture();
  await assert.rejects(recheckMeasuredSource(r,'after',bytes(csv),'a.csv'),/no saved recording/);
  await assert.rejects(recheckMeasuredSource(r,'wrong',bytes(csv),'a.csv'),/earlier or later/);
  await assert.rejects(recheckMeasuredSource(r,'before',bytes('bad'),'a.csv'));
  await assert.rejects(recheckMeasuredSource({...r,learningReady:true},'before',bytes(csv),'a.csv'));
});
