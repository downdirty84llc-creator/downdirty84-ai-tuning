import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {blankCase,caseReport} from './troubleshooting.mjs';
import {inspectMeasuredFile,summarizeMeasuredFile} from './measuredCsv.mjs';
import {compareCases,prepareCaseComparison} from './caseComparison.mjs';
const csv='HP Tuners CSV Log File\nVersion: 1.0\n[Channel Information]\n0,1\nOffset,RPM\ns,rpm\n[Channel Data]\n0,1000\n1,2000';
const source=await inspectMeasuredFile(Buffer.from(csv),'fixture.csv');
const fixture=()=>({...blankCase(),format:'DD84_TROUBLESHOOTING_CASE_V2',measuredReview:{format:'DD84_MEASURED_REVIEW_V1',writeStrategy:'SIMULATION_ONLY',learningReady:false,automaticApplication:false,before:{...summarizeMeasuredFile(source,{start:0,end:1}),tune:null},after:null,outcome:{result:'unassessed',changeReason:'',changes:'',conditions:'',criterion:'',observation:'',nextAction:'',reviewer:''}}});
test('comparison canonicalizes claims and does not mutate either saved case',()=>{
  const a=fixture(),b=structuredClone(a);b.assessment={status:'APPROVED'};b.measuredReview.comparisons=[{delta:99}];const before=JSON.stringify([a,b]);
  const r=compareCases(a,b);assert.equal(r.changes.length,0);assert.equal(JSON.stringify([a,b]),before);assert.equal(r.current.measuredReview.learningReady,false);assert.notEqual(r.current.assessment.status,'APPROVED');
});
test('notes, retained checks, outcome and conditions are compared independently',()=>{
  const a=fixture(),b=structuredClone(a);b.context.conditions='Cold engine';b.checks['fuel-supply']={status:'issue',note:'Operator report only'};b.measuredReview.outcome.observation='Follow-up';
  const r=compareCases(a,b);assert.equal(r.changes.length,4);assert.deepEqual(r.sourceChanges,[]);assert.equal(r.counts['Reported outcome'],1);assert.equal(r.counts.Checklist,2);assert.equal(r.counts['Earlier recording'],0);
});
test('same-source changed statistics are exact values without inferred performance deltas',()=>{
  const a=fixture(),b=structuredClone(a);b.measuredReview.before.channels[1].mean=1600;
  const r=compareCases(a,b);assert.equal(r.changes.length,1);assert.equal(r.changes[0].kind,'changed');assert.deepEqual(r.changes[0].reference,{present:true,value:1500});assert.deepEqual(r.changes[0].current,{present:true,value:1600});assert.equal('delta' in r.changes[0],false);
});
test('changed CSV identities cannot pair channel or filter values',()=>{
  const a=fixture();a.measuredReview.before.selection.filters=[{id:'1',name:'RPM',unit:'rpm',min:0,max:3000}];const b=structuredClone(a);b.measuredReview.before.source.sha256='b'.repeat(64);
  const r=compareCases(a,b);assert.deepEqual(r.sourceChanges,['before']);const values=r.changes.filter(c=>/Channel|Filter/.test(c.label));assert.equal(values.length,36);assert(values.every(c=>['added','removed'].includes(c.kind)));
});
test('unit changes and duplicate names keep exact channel identities separate',()=>{
  const a=fixture(),b=structuredClone(a);b.measuredReview.before.channels[1].unit='Hz';
  const r=compareCases(a,b);assert.equal(r.changes.length,16);assert(r.changes.every(c=>c.kind!=='changed'));
  const d=structuredClone(a);d.measuredReview.before.channels.push({...d.measuredReview.before.channels[1],id:'other'});assert.equal(compareCases(a,d).changes.length,8);
});
test('channel/filter ordering alone does not manufacture changed values',()=>{
  const a=fixture(),b=structuredClone(a);b.measuredReview.before.channels.reverse();assert.equal(compareCases(a,b).changes.length,0);
});
test('null, zero, empty and absent values remain distinct; adding/removing review preserves inventories',()=>{
  const a=blankCase(),b=fixture(),r=compareCases(a,b);assert(r.changes.some(c=>c.current.value===0&&c.reference.present===false));assert(r.changes.some(c=>c.current.value===''&&c.reference.present===false));assert(compareCases(b,a).changes.every(c=>c.kind==='removed'));
  const empty=fixture();const s=empty.measuredReview.before;s.rows=0;s.windowRows=0;for(const c of s.channels){c.numeric=0;for(const k of ['min','max','mean','median','p95'])c[k]=null;}assert(compareCases(b,empty).changes.some(c=>c.current.value===null&&c.current.present));
});
test('fingerprints cover complete captured canonical snapshots, independent of later edits',async()=>{
  const a=fixture(),b=structuredClone(a);b.context.vehicle='Original revision';const p=prepareCaseComparison(a,b);b.context.vehicle='Changed during hash';const r=await p;assert.equal(r.current.context.vehicle,'Original revision');
  for(const side of ['reference','current'])assert.equal(r[side+'Sha256'],createHash('sha256').update(JSON.stringify(r[side],null,2)).digest('hex'));
  assert.deepEqual(caseReport(r.reference),r.reference);assert.equal(r.automaticApplication,false);
});
test('unsupported input fails without producing a partial comparison',()=>{assert.throws(()=>compareCases(blankCase(),{format:'unknown'}),/supported/);assert.throws(()=>compareCases(fixture(),{...fixture(),measuredReview:{learningReady:true}}),/Unsupported/);});
