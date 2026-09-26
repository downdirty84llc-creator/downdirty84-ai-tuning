import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {segmentReport} from './segment.mjs';
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
