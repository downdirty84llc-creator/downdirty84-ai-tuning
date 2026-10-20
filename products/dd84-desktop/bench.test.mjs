import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {makeBenchPlan,validateBenchPlan,readBenchPlan,benchSession,rehearsalBytes,
  reviewBenchCapture,MAX_CAPTURE_BYTES,MAX_PLAN_BYTES} from './bench.mjs';
import {crc32,decodeRecord} from './link-shared/wire.mjs';
const plan=makeBenchPlan('deadbeef',4);
const run=(bytes=rehearsalBytes(plan,'42'),session='42',source='IMPORTED_CAPTURE_UNVERIFIED')=>
  reviewBenchCapture({plan,session,bytes,filename:'test.bin',source});

test('staged modules exactly match the canonical Link sources',()=>{
  for(const name of ['wire.mjs','bench-acceptance.mjs'])
    assert.deepEqual(readFileSync(new URL('./link-shared/'+name,import.meta.url)),
      readFileSync(new URL('../dd84-link/shared/'+name,import.meta.url)));
});
test('saved patterns round-trip; altered frames, metadata, gates and excessive inputs are rejected',()=>{
  assert.deepEqual(readBenchPlan(JSON.stringify(plan)),plan);
  assert.deepEqual(validateBenchPlan({...plan,frames:plan.frames.map(f=>({...f}))}),plan);
  for(const change of [p=>p.frames[0].data='0000000000000000',p=>p.frames[1].extended=false,
    p=>p.frames.push(p.frames[0]),p=>p.bitrate=250000,p=>p.learningEligible=true,
    p=>p.frames[0].other=true,p=>p.other=true,p=>p.count='4',p=>p.frames=null]){
    const changed=structuredClone(plan);change(changed);assert.throws(()=>validateBenchPlan(changed));
  }
  for(const value of ['{','null','[]',' '.repeat(MAX_PLAN_BYTES+1)])assert.throws(()=>readBenchPlan(value));
});
test('session IDs preserve uint64 precision and reject coercions',()=>{
  for(const value of ['1','9007199254740993','18446744073709551615'])assert.equal(benchSession(value),value);
  for(const value of ['',0,1,'0','01','-1','1.5','0x2a','1e3',' 42','18446744073709551616'])assert.throws(()=>benchSession(value));
});
test('rehearsal makes deterministic frames/status, with a bounded maximum plan',async()=>{
  const bytes=rehearsalBytes(plan,'42');
  assert.equal(bytes.length,560);
  assert.equal(decodeRecord(bytes.subarray(0,112)).data,'deadbeef00000000');
  assert.equal(decodeRecord(bytes.subarray(112,224)).id,0x18ff8432);
  assert.equal(decodeRecord(bytes.subarray(448)).counters.accepted,'4');
  const r=await run(bytes,'42','SOFTWARE_REHEARSAL');
  assert.equal(r.comparison.comparisonPassed,true);assert.equal(r.comparison.statusRecords,1);
  assert.equal(r.source,'SOFTWARE_REHEARSAL');assert.equal(r.preview.length,4);
  const maxPlan=makeBenchPlan('deadbeef',10000);
  const max=await reviewBenchCapture({plan:maxPlan,session:'1',bytes:rehearsalBytes(maxPlan,'1'),filename:'max.bin',source:'SOFTWARE_REHEARSAL'});
  assert.equal(max.preview.length,20);assert.equal(max.comparison.matchedFrames,10000);
});
test('import reports bind exact bytes and canonical plan without promoting evidence',async()=>{
  const bytes=rehearsalBytes(plan,'9007199254740993');
  const r=await run(bytes,'9007199254740993');
  assert.equal(r.input.sha256,createHash('sha256').update(bytes).digest('hex'));
  assert.equal(r.plan.sha256,createHash('sha256').update(JSON.stringify(plan)).digest('hex'));
  assert.equal(r.comparison.session,'9007199254740993');assert.equal(r.writeStrategy,'SIMULATION_ONLY');
  for(const obj of [r,r.comparison])for(const key of ['externalCanValidated','silentModeValidated','hardwareLossMeasured','vehicleData','learningEligible'])assert.equal(obj[key],false);
  assert.equal(JSON.parse(JSON.stringify(r)).input.byteLength,560);
});
test('corruption, missing/duplicate frames, wrong sessions and arbitrary files cannot pass',async()=>{
  const original=rehearsalBytes(plan,'42');const bad=original.slice();bad[40]^=1;
  const duplicate=new Uint8Array(original.length+112);duplicate.set(original);duplicate.set(original.subarray(0,112),original.length);
  for(const bytes of [new Uint8Array(),bad,original.subarray(0,original.length-1),
    original.subarray(112),duplicate,new TextEncoder().encode('{"passed":true}')])
    assert.equal((await run(bytes)).comparison.comparisonPassed,false);
  assert.equal((await run(original,'43')).comparison.comparisonPassed,false);
  const counter=original.slice(),v=new DataView(counter.buffer);v.setBigUint64(448+44,2n,true);
  v.setUint32(448+108,crc32(counter.subarray(448,556)),true);
  assert.equal((await run(counter)).comparison.issueCounts.captureCounter,1);
  await assert.rejects(()=>run(new Uint8Array(MAX_CAPTURE_BYTES+1)),/16 MiB/);
  await assert.rejects(()=>run(original,'42','VEHICLE_CAPTURE'),/source/);
});
