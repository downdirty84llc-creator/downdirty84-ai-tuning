import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fingerprintEvidence,makeLearningCase,parseLearningCase,learningReadiness,MAX_EVIDENCE_BYTES} from './learning.mjs';
const ref=(role,name,sha256='a'.repeat(64))=>({role,name,sha256,bytes:100,tuneSha256:null});
const base=()=>({vehicle:'Synthetic truck',displacementLiters:5.3,camNotes:'Cam card unknown',buildNotes:'Owner notes',files:[ref('INTERMEDIATE','middle.hpt'),ref('BEFORE_FINAL_LOG','before.hpl','b'.repeat(64))]});
test('chronology never supplies calibration association or performance validation',()=>{
  const c=makeLearningCase(base());assert.equal(c.files[1].tuneSha256,null);
  const r=learningReadiness(c);assert.equal(r.status,'BLOCKED_PENDING_MEASUREMENTS');
  assert.ok(r.missing.some(s=>s.includes('exact calibration')));
  assert.ok(r.missing.some(s=>s.includes('after-final')));
  assert.ok(r.areas.every(a=>a.status==='NOT_LEARNING'));
});
test('roundtrip binds log to included tune but never enables learning from metadata',()=>{
  const input=base();input.files[1].tuneSha256=input.files[0].sha256;
  input.files.push(ref('AFTER_FINAL_LOG','after.hpl','c'.repeat(64)));
  input.files[2].tuneSha256=input.files[0].sha256;
  const c=makeLearningCase(input);assert.deepEqual(parseLearningCase(JSON.stringify(c)),c);
  assert.equal(learningReadiness(c).status,'BLOCKED_PENDING_MEASUREMENTS');
  assert.equal(Object.hasOwn(parseLearningCase(JSON.stringify({...c,approved:true})),'approved'),false);
});
test('reject malformed references, dangling associations and forged released records',()=>{
  for(const value of [0,-1,Infinity,NaN,'5.3'])assert.throws(()=>makeLearningCase({...base(),displacementLiters:value}));
  for(const patch of [{role:'__proto__'},{name:'../secret.hpt'},{bytes:MAX_EVIDENCE_BYTES+1},{sha256:'bad'},{tuneSha256:'b'.repeat(64)}])assert.throws(()=>makeLearningCase({...base(),files:[{...base().files[0],...patch}]}));
  const c=makeLearningCase(base());
  for(const patch of [{status:'RELEASED'},{writeStrategy:'REAL'},{files:[...c.files,c.files[0]]}])assert.throws(()=>parseLearningCase(JSON.stringify({...c,...patch})));
  assert.throws(()=>parseLearningCase(' '.repeat(32769)));
  const input=base();input.files[1].tuneSha256='d'.repeat(64);assert.throws(()=>makeLearningCase(input));
});
test('fingerprinting checks size and extension without claiming HPL decoding',async()=>{
  const bytes=new Uint8Array([1,2,3,4]);const file={name:'test.hpl',size:4,arrayBuffer:async()=>bytes.buffer};
  const a=await fingerprintEvidence(file,'EARLIER_LOG');assert.equal(a.sha256.length,64);assert.equal(a.tuneSha256,null);
  await assert.rejects(fingerprintEvidence({...file,size:MAX_EVIDENCE_BYTES+1,arrayBuffer(){throw Error('must not read');}},'EARLIER_LOG'),/fingerprint/);
  await assert.rejects(fingerprintEvidence(file,'ORIGINAL'),/type/);
  await assert.rejects(fingerprintEvidence({...file,size:5},'EARLIER_LOG'),/length/);
});
