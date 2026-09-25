import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {buildFixture} from '../products/dd84-link/scripts/build-wire-fixture.mjs';
import {WireParser} from '../products/dd84-link/shared/wire.mjs';
const dir=mkdtempSync(join(tmpdir(),'dd84-review-test-'));
try {
  const result=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','src/captureReview.ts','--target','ES2022','--module','ES2022','--moduleResolution','bundler','--skipLibCheck','--outDir',dir],{encoding:'utf8'});
  assert.equal(result.status,0,result.stdout+result.stderr);
  const {reviewCapture:review,exampleCapture,MAX_CAPTURE_BYTES}=await import('data:text/javascript;base64,'+Buffer.from(readFileSync(join(dir,'captureReview.js'))).toString('base64'));
  const example=exampleCapture();const lines=example.split('\n').map(JSON.parse);
  assert.equal(review(example).frames,2);assert.deepEqual(review(example).warnings,[]);
  const serialize=records=>records.map(r=>JSON.stringify(r)).join('\n');
  const mutate=(index,changes)=>lines.map((r,i)=>i===index?{...r,...changes}:r);
  for(const changes of [{session:'2'},{source:'REAL_DEVICE'},{sequence:0},{timestampUs:'999'},
    {id:2048},{channel:2},{dlc:16},{fd:false,brs:true},{data:'zz'},{length:2},{timestampUs:'18446744073709551616'}])
    assert.throws(()=>review(serialize(mutate(1,changes))),/Line 2:/);
  assert.throws(()=>review('null'));assert.throws(()=>review(''));assert.throws(()=>review('{'));
  assert.throws(()=>review('x'.repeat(MAX_CAPTURE_BYTES+1)),/8 MB/);
  assert.throws(()=>review(Array(20001).fill('{}').join('\n')),/20,000/);
  assert.throws(()=>review(' '.repeat(2049)+'{}'),/2,048/);
  assert.ok(review(serialize(lines.slice(0,2))).warnings.some(w=>w.includes('No final')));
  assert.equal(review(serialize([lines[1],lines[2]])).gaps,1);
  assert.ok(review(serialize([lines[1],lines[2]])).warnings.some(w=>w.includes('Drained')));
  const dropped=mutate(2,{counters:{...lines[2].counters,droppedFull:'5'}});
  assert.ok(review(serialize(dropped)).warnings.some(w=>w.includes('5 software')));
  assert.throws(()=>review(serialize(mutate(2,{counters:{...lines[2].counters,queued:'1'}}))),/Inconsistent/);
  const huge=lines.map(r=>({...r,timestampUs:(BigInt(r.timestampUs)+9007199254740993n).toString()}));
  assert.equal(review(serialize(huge)).durationUs,'1000');
  const fixture=buildFixture();
  try {
    const bytes=readFileSync(fixture.path),parser=new WireParser('72623859790382856');const records=[];
    for(let i=0;i<bytes.length;i+=317) records.push(...parser.feed(bytes.subarray(i,i+317)));
    const actual=review(serialize(records.map(r=>({source:'SYNTHETIC_HOST_REHEARSAL',...r}))));
    assert.equal(actual.frames,10000);assert.equal(actual.preview.length,50);
    assert.deepEqual(actual.channels,[5000,5000]);assert.equal(actual.classic,5000);assert.equal(actual.fd,5000);
    assert.deepEqual(actual.warnings,[]);assert.equal(actual.durationUs,'10000');
  }finally{fixture.cleanup();}
  console.log('PASS: C-generated 10,000-frame import, limits, metadata, sessions, ordering, counters and warnings');
}finally{rmSync(dir,{recursive:true,force:true});}
