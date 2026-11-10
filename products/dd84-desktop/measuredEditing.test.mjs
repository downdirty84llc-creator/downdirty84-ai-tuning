import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectMeasuredFile,summarizeMeasuredFile} from './measuredCsv.mjs';
import {normalizeMeasuredReview} from './measuredReview.mjs';
import {updateMeasuredOutcome,assertMeasuredRebuildSources} from './measuredEditing.mjs';
const csv='HP Tuners CSV Log File\nVersion: 1.0\n[Channel Information]\n0,1\nOffset,RPM\ns,rpm\n[Channel Data]\n0,1000\n1,2000\n2,3000\n';
async function fixture(){
  const loaded=await inspectMeasuredFile(new TextEncoder().encode(csv),'before.csv');
  const source={...summarizeMeasuredFile(loaded,{start:0,end:1,filters:[{channelId:'1',min:1000,max:2000}]}),tune:{name:'original.hpt',bytes:20,sha256:'a'.repeat(64),associationNote:'Operator reports this tune ran during this log.'}};
  return normalizeMeasuredReview({format:'DD84_MEASURED_REVIEW_V1',writeStrategy:'SIMULATION_ONLY',learningReady:false,automaticApplication:false,
    before:source,after:{...structuredClone(source),source:{...source.source,name:'after.csv',sha256:'b'.repeat(64)}},
    outcome:{result:'unassessed',changeReason:'',changes:'',conditions:'',criterion:'',observation:'',nextAction:'',reviewer:''}});
}
test('updating notes preserves both complete source summaries, filters, tune bindings and comparisons',async()=>{
  const saved=await fixture(),copy=structuredClone(saved);
  const updated=updateMeasuredOutcome(saved,{...saved.outcome,result:'improved',observation:'Reported smoother idle, no measured power result.'});
  for(const key of ['before','after','comparisons','unmatched'])assert.deepEqual(updated[key],saved[key]);
  assert.deepEqual(saved,copy);assert.equal(updated.outcome.result,'improved');assert.equal(updated.learningReady,false);assert.equal(updated.automaticApplication,false);
  updated.before.tune.associationNote='changed';assert.deepEqual(saved,copy);
});
test('outcome updates recalculate evidence gaps without accepting imported approval or verification claims',async()=>{
  const saved=await fixture();saved.status='APPROVED';saved.learningVerified=true;saved.sourceVerified=true;
  const updated=updateMeasuredOutcome(saved,{...saved.outcome,result:'inconclusive',reviewer:'Synthetic reviewer',sourceVerified:true});
  assert.equal(updated.status,'NEEDS_MORE_EVIDENCE');assert.equal(updated.provenance,'SOURCE_SUMMARIES_NOT_SERVER_VERIFIED');
  assert(!updated.missing.includes('reviewer'));assert(!updated.missing.includes('Operator outcome review'));assert(updated.missing.includes('conditions'));
  assert(!('sourceVerified' in updated));assert(!('sourceVerified' in updated.outcome));assert(!('learningVerified' in updated));
});
test('invalid outcomes and unsupported reviews are rejected without mutating saved evidence',async()=>{
  const saved=await fixture(),copy=structuredClone(saved);
  for(const outcome of [{...saved.outcome,result:'approved'},{...saved.outcome,observation:'x'.repeat(2001)},{...saved.outcome,reviewer:null}])assert.throws(()=>updateMeasuredOutcome(saved,outcome));
  assert.throws(()=>updateMeasuredOutcome({...saved,learningReady:true},saved.outcome));assert.deepEqual(saved,copy);
});
test('rebuilding a saved review requires every saved source unless removal is explicit',async()=>{
  const saved=await fixture();
  assert.throws(()=>assertMeasuredRebuildSources(saved,{}),/Reselect the earlier CSV/);
  assert.throws(()=>assertMeasuredRebuildSources(saved,{before:{loaded:{}}}),/Reselect the later CSV/);
  assert.throws(()=>assertMeasuredRebuildSources(saved,{before:{loaded:{}},after:{cleared:'true'}}),/Reselect the later CSV/);
  assert.doesNotThrow(()=>assertMeasuredRebuildSources(saved,{before:{loaded:{}},after:{cleared:true}}));
  assert.doesNotThrow(()=>assertMeasuredRebuildSources(saved,{before:{loaded:{}},after:{loaded:{}}}));
});
test('a new or intentionally single-sided review does not require nonexistent sources',async()=>{
  const saved=await fixture();saved.after=null;
  assert.doesNotThrow(()=>assertMeasuredRebuildSources(null,{}));
  assert.doesNotThrow(()=>assertMeasuredRebuildSources(saved,{before:{loaded:{}}}));
  assert.throws(()=>assertMeasuredRebuildSources(saved,{after:{loaded:{}}}),/Reselect the earlier CSV/);
});
