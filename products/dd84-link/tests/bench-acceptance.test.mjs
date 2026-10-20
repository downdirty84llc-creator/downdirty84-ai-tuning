import {test} from 'node:test';
import assert from 'node:assert/strict';
import {crc32} from '../shared/wire.mjs';
import {makeBenchPlan,compareBenchCapture} from '../shared/bench-acceptance.mjs';

function record(i, {session=42n,sequence=i,payloadIndex=i,time=BigInt(i)}={}) {
  const b=Buffer.alloc(112); b.write('D84W');b[4]=1;b[5]=1;b.writeUInt16LE(112,6);
  b.writeBigUInt64LE(session,8);b.writeUInt32LE(sequence,16);b.writeBigUInt64LE(time,20);
  b.writeUInt32LE(i%2?0x18ff8432:0x321,28);b[33]=i%2;b[34]=8;b[35]=8;
  b.writeUInt32BE(0xdeadbeef,36);b.writeUInt32BE(payloadIndex,40);
  b.writeUInt32LE(crc32(b.subarray(0,108)),108);return b;
}
const compare=(b,n=2)=>compareBenchCapture(b,'42','deadbeef',n);
test('bounded patterns alternate standard and extended frames with unique payloads',()=>{
  const p=makeBenchPlan('deadbeef',2);
  assert.equal(p.frames[0].data,'deadbeef00000000');
  assert.equal(p.frames[1].id,0x18ff8432);assert.equal(p.frames[1].data,'deadbeef00000001');
  for(const n of [0,-1,10001,1.5,NaN])assert.throws(()=>makeBenchPlan('deadbeef',n));
  assert.throws(()=>makeBenchPlan('bad',2));
});
test('matching bytes establish comparison only, not electrical validation',()=>{
  const r=compare(Buffer.concat([record(0),record(1)]));
  assert.equal(r.comparisonPassed,true);assert.equal(r.matchedFrames,2);
  assert.equal(r.externalCanValidated,false);assert.equal(r.silentModeValidated,false);
  assert.equal(r.hardwareLossMeasured,false);assert.equal(r.learningEligible,false);
  assert.equal(r.statusRecords,0);
});
test('missing, extra, reordered, duplicated and wrong-payload frames fail',()=>{
  for(const bytes of [Buffer.alloc(0),record(0),Buffer.concat([record(0),record(1),record(2)]),
    Buffer.concat([record(1),record(0)]),Buffer.concat([record(0),record(0),record(1)]),
    Buffer.concat([record(0),record(1,{payloadIndex:55})])])assert.equal(compare(bytes).comparisonPassed,false);
});
test('wrong sessions, CRC corruption, truncation, garbage and time regression fail',()=>{
  const bad=record(1);bad[40]^=1;
  for(const tail of [record(1,{session:99n}),bad,record(1).subarray(0,50),Buffer.from('junk')])
    assert.equal(compare(Buffer.concat([record(0),tail])).comparisonPassed,false);
  assert.equal(compare(Buffer.concat([record(0,{time:100n}),record(1)])).comparisonPassed,false);
});
test('issue detail is bounded while counts retain the full number',()=>{
  const r=compare(Buffer.concat(Array.from({length:100},(_,i)=>record(i,{payloadIndex:999}))),100);
  assert.equal(r.issueCounts.frameMismatch,100);assert.equal(r.issues.length,20);
  assert.throws(()=>compareBenchCapture(Buffer.alloc(16*1024*1024+1),'42','deadbeef',2));
});
