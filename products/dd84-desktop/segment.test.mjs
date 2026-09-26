import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {segmentReport,reopenSegmentReport,MAX_SEGMENT_BYTES} from './segment.mjs';
import {reopenLogReport} from './logs.mjs';
const raw='HP Tuners CSV Log File\nVersion: 1.0\n\n[Channel Information]\n0,1\nOffset,Engine RPM\ns,rpm\n\n[Channel Data]\n0,800\n1,\n2,1600\n3,1200\n4,1800\n';
test('segment binds inclusive selected range, units, note and complete source fingerprint',async()=>{
  const r=await segmentReport(raw,'test.csv','1',{start:2,end:3},'  Synthetic segment  ');
  assert.equal(r.format,'DD84_LOG_SEGMENT_V1');assert.equal(r.note,'Synthetic segment');
  assert.equal(r.source.textSha256,createHash('sha256').update(raw).digest('hex'));
  assert.deepEqual(r.range,{start:2,end:3,unit:'s',endpoints:'BOTH_INCLUDED'});
  assert.equal(r.timeline.numericCount,2);assert.equal(r.timeline.min,1200);assert.equal(r.timeline.max,1600);
  assert.equal(r.timeline.channel.unit,'rpm');assert.equal(r.timeline.recordingTime.first,0);assert.equal(r.timeline.recordingTime.last,4);
  assert.equal(r.learningReady,false);assert.equal(r.automaticApplication,false);assert.equal(r.writeStrategy,'SIMULATION_ONLY');
  assert.equal(r.timeline.samples,undefined);assert.equal(r.raw,undefined);
  await assert.rejects(reopenLogReport(JSON.stringify(r),raw,'test.csv'),/Unsupported/);
});
test('reopen restores source-bound range and note, allows filename changes, recomputes metadata',async()=>{
  const r=await segmentReport(raw,'test.csv','1',{start:2,end:3},'Review note');
  assert.deepEqual(await reopenSegmentReport(JSON.stringify(r),raw,'test.csv'),r);
  r.timeline.min=-999;r.timeline.numericCount=900;r.timeline.bins=[];r.timeline.channel.unit='fake';r.timeline.channel.name='fake';
  const restored=await reopenSegmentReport(JSON.stringify(r),raw,'renamed.csv');
  assert.equal(restored.source.name,'renamed.csv');assert.equal(restored.timeline.min,1200);assert.equal(restored.timeline.numericCount,2);assert.equal(restored.timeline.channel.unit,'rpm');assert.equal(restored.timeline.channel.name,'Engine RPM');assert.equal(restored.note,'Review note');
});
test('reopen rejects modified CSV, forged gates, invalid channels and incompatible bounds',async()=>{
  const r=await segmentReport(raw,'test.csv','1',{start:2,end:3},'note');
  await assert.rejects(reopenSegmentReport(JSON.stringify(r),raw.replace('0,800','0,801'),'test.csv'),/fingerprint/);
  for(const patch of [{learningReady:true},{automaticApplication:true},{status:'RELEASED'},{noteProvenance:'VERIFIED'},{range:{start:2,end:3,unit:'ms',endpoints:'BOTH_INCLUDED'}},{range:{start:2,end:9,unit:'s',endpoints:'BOTH_INCLUDED'}},{timeline:{...r.timeline,learningReady:true}},{timeline:{...r.timeline,channel:{id:'missing'}}},{note:''}])await assert.rejects(reopenSegmentReport(JSON.stringify({...r,...patch}),raw,'test.csv'));
});
test('reopen rejects oversized, malformed, and unrelated reports',async()=>{
  for(const s of ['x','null','{}',' '.repeat(MAX_SEGMENT_BYTES+1)])await assert.rejects(reopenSegmentReport(s,raw,'test.csv'));
  const r=await segmentReport(raw,'test.csv','1',{start:0,end:4},'note');r.source.hashScope='UNKNOWN';await assert.rejects(reopenSegmentReport(JSON.stringify(r),raw,'test.csv'));
});
test('missing-only segment is evidence of absence and content changes alter source fingerprint',async()=>{
  const a=await segmentReport(raw,'test.csv','1',{start:1,end:1},'Missing interval');
  assert.equal(a.timeline.numericCount,0);assert.equal(a.timeline.missingCount,1);assert.equal(a.timeline.min,null);
  const b=await segmentReport(raw.replace('0,800','0,801'),'renamed.csv','1',{start:1,end:1},'Missing interval');
  assert.notEqual(a.source.textSha256,b.source.textSha256);assert.deepEqual(a.timeline,b.timeline);
});
test('segment rejects incomplete context and invalid ranges rather than exporting a misleading view',async()=>{
  for(const note of ['', '   ', null,'x'.repeat(2001)])await assert.rejects(segmentReport(raw,'test.csv','1',{start:0,end:4},note));
  for(const name of ['C:\\test.csv','../test.csv','test.hpl'])await assert.rejects(segmentReport(raw,name,'1',{start:0,end:4},'note'));
  for(const range of [null,undefined,{start:2,end:1},{start:0,end:9}])await assert.rejects(segmentReport(raw,'test.csv','1',range,'note'));
  await assert.rejects(segmentReport(raw,'test.csv','0',{start:0,end:4},'note'));
});
