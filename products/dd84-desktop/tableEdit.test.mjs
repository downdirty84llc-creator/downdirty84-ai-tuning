import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sample,parse,edit,backup,changes} from './project.mjs';
import {makeRealDraft,numericParameter} from './realDraft.mjs';
import {previewTableEdit,applyTableEdit} from './tableEdit.mjs';
const path='Spark.Advance.Map';
const range=(patch={})=>({path,xStart:1,xEnd:2,yStart:0,yEnd:1,operation:'ADD',amount:-2,...patch});
const parameter=(p,path)=>p.parameters.find(p=>p.path===path);
test('rectangular preview and apply preserve originals, axes, other cells and source project',()=>{
  const p=sample(),snapshot=structuredClone(p),plan=previewTableEdit(p,range());
  assert.deepEqual(plan.items.map(c=>c.index),[1,2,5,6]);assert.equal(plan.selectedCount,4);assert.equal(plan.changedCount,4);
  assert.deepEqual(plan.items[0],{index:1,coordinates:{x:2000,y:0.2},before:15,after:13});
  const next=applyTableEdit(p,plan);assert.deepEqual(p,snapshot);assert.deepEqual(backup(next),p);
  assert.deepEqual(parameter(next,path).values,[10,13,18,25,5,8,13,20,0,5,10,15]);
  assert.deepEqual(parse(JSON.stringify(next)),next);assert.equal(changes(next).length,4);
  assert.deepEqual(next.parameters.filter(p=>p.path!==path),p.parameters.filter(p=>p.path!==path));
});
test('set, add and percent work on current values, including negative values and zero',()=>{
  const p=edit(sample(),path,8,-10),selection=range({xStart:0,xEnd:1,yStart:2,yEnd:2});
  const scaled=applyTableEdit(p,previewTableEdit(p,{...selection,operation:'PERCENT',amount:10}));
  assert.deepEqual(parameter(scaled,path).values.slice(8,10),[-11,5.5]);
  const zero=previewTableEdit(sample(),{...selection,operation:'PERCENT',amount:10});assert.equal(zero.items[0].after,0);assert.equal(zero.changedCount,1);
  assert.deepEqual(previewTableEdit(p,{...selection,operation:'SET',amount:0}).items.map(c=>c.after),[0,0]);
  assert.deepEqual(previewTableEdit(p,{...selection,amount:3}).items.map(c=>c.after),[-7,8]);
  assert.equal(previewTableEdit(p,{...selection,amount:0}).changedCount,0);
});
test('curves use one row and can include the last column',()=>{
  const p=sample(),selection=range({path:'Airflow.MAF.Curve',xStart:4,xEnd:5,yStart:0,yEnd:0,operation:'SET',amount:200});
  const next=applyTableEdit(p,previewTableEdit(p,selection));assert.deepEqual(parameter(next,selection.path).values,[10,25,50,90,200,200]);
  assert.throws(()=>previewTableEdit(p,{...selection,yEnd:1}),/range/);
});
test('reject an entire range when a later cell exceeds bounds; no clamping or partial edit',()=>{
  const p=sample(),snapshot=structuredClone(p);
  assert.throws(()=>previewTableEdit(p,range({xStart:0,xEnd:3,yStart:0,yEnd:0,amount:40})),/bounds/);
  assert.deepEqual(p,snapshot);
  assert.throws(()=>previewTableEdit(p,range({path:'Airflow.MAF.Curve',xStart:0,xEnd:5,yStart:0,yEnd:0,operation:'PERCENT',amount:-100})),/bounds/);
  assert.throws(()=>previewTableEdit(p,range({operation:'PERCENT',amount:Number.MAX_VALUE})));
});
test('invalid operations, ranges and types cannot produce a plan',()=>{
  for(const patch of [{xStart:-1},{xEnd:4},{xStart:2,xEnd:1},{xStart:0.5},{yEnd:3},{yStart:2,yEnd:1},{xStart:'0'},{amount:''},{amount:NaN},{amount:Infinity},{amount:'2'},{operation:'MULTIPLY'},{extra:true}])assert.throws(()=>previewTableEdit(sample(),range(patch)));
  assert.throws(()=>previewTableEdit(sample(),null));const missing=range();delete missing.yStart;assert.throws(()=>previewTableEdit(sample(),missing));
});
test('unknown, scalar, enum, switch and unverified real tables cannot be bulk edited',()=>{
  const p=sample();p.parameters.push({path:'Unknown.Table',axes:[[1,2]],original:[1,2],values:[1,2]});
  for(const path of ['Unknown.Table','Missing.Table','Idle.TargetSpeed','Demo.TableSelection','Demo.Switch'])assert.throws(()=>previewTableEdit(p,range({path})),/editable numeric/);
  const real=realProject();real.parameters[0].definition.status='UNVERIFIED';real.parameters[0].definition.unit=null;
  assert.throws(()=>previewTableEdit(real,range({path:'Export.Map'})),/editable numeric/);
});
function realProject(){
  return makeRealDraft('Synthetic range fixture',{vendor:'HP_TUNERS',name:'synthetic.hpt',sha256:'a'.repeat(64),bytes:null,controllerFamily:null,operatingSystem:null,identityEvidence:null},[
    numericParameter('Export.Map','Labeled descending table','degrees',[[3000,2000,1000],[1,0]],[{label:'RPM',unit:'rpm'},{label:'Mode',unit:'index',labels:['Normal','Alternate']}],[5,0,-5,10,15,20],[{name:'fixture.json',sha256:'b'.repeat(64)}])
  ]);
}
test('real maps preserve descending axes, category labels, evidence and local-only gates',()=>{
  const p=realProject(),plan=previewTableEdit(p,range({path:'Export.Map',yStart:1,yEnd:1,operation:'SET',amount:-1.125})),next=applyTableEdit(p,plan);
  assert.deepEqual(plan.items.map(c=>c.coordinates),[{x:2000,y:0},{x:1000,y:0}]);assert.deepEqual(next.parameters[0].values,[5,0,-5,10,-1.125,-1.125]);
  assert.deepEqual(backup(next),p);assert.deepEqual(next.source,p.source);assert.equal(next.writeStrategy,'SIMULATION_ONLY');assert.equal(next.status,'LOCAL_DRAFT_NOT_RELEASED');
  assert.deepEqual(parse(JSON.stringify(next)),next);
});
test('preview cannot be altered, forged, reused on changed data or rebound to other definitions',()=>{
  const p=sample(),plan=previewTableEdit(p,range());
  assert.throws(()=>{plan.items[0].after=99;},TypeError);assert.throws(()=>{plan.selection.amount=99;},TypeError);assert.throws(()=>{plan.items[0].coordinates.x=0;},TypeError);
  assert.throws(()=>applyTableEdit(p,structuredClone(plan)),/preview/);
  assert.throws(()=>applyTableEdit(edit(p,path,11,16),plan),/preview/);
  assert.throws(()=>applyTableEdit(applyTableEdit(p,plan),plan),/preview/);
  const real=realProject(),realPlan=previewTableEdit(real,range({path:'Export.Map'}));real.parameters[0].definition.unit='radians';
  assert.throws(()=>applyTableEdit(real,realPlan),/preview/);
});
test('maximum-size table applies all 4096 values, independent of the UI preview limit',()=>{
  const p=realProject(),table=p.parameters[0];table.axes=[Array.from({length:64},(_,i)=>i),Array.from({length:64},(_,i)=>63-i)];
  table.definition.axes=[{label:'Column',unit:'index'},{label:'Row',unit:'index'}];table.original=Array(4096).fill(0);table.values=Array(4096).fill(0);
  const plan=previewTableEdit(p,range({path:table.path,xStart:0,xEnd:63,yStart:0,yEnd:63,operation:'SET',amount:1}));
  assert.equal(plan.selectedCount,4096);assert.equal(plan.changedCount,4096);assert.equal(plan.items.at(-1).index,4095);
  const next=applyTableEdit(p,plan);assert(next.parameters[0].values.every(v=>v===1));assert.deepEqual(backup(next),p);
});
