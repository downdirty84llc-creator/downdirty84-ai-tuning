import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeRealDraft,numericParameter,sha256} from './realDraft.mjs';
import {compareReal,reportRealComparison} from './realCompare.mjs';
const source={vendor:'HP_TUNERS',name:'fixture.hpt',sha256:'a'.repeat(64),bytes:null,controllerFamily:null,operatingSystem:null,identityEvidence:null};
const proof={name:'synthetic.json',sha256:'b'.repeat(64)};
function fixture(){return makeRealDraft('Synthetic comparison fixture',source,[numericParameter('Spark.Table','Spark','degrees',[[1000,2000],[.2,.4]],[{label:'RPM',unit:'rpm'},{label:'Airmass',unit:'g'}],[0,-2,3,4],[proof])]);}
test('real comparison uses working values with explicit direction, preserves zero and source drafts',()=>{
  const a=fixture(),b=fixture();a.parameters[0].values[1]=-3;b.parameters[0].values[0]=-1;b.source.sha256='c'.repeat(64);
  const out=compareReal(a,b);assert.equal(out.summary.changedCells,2);assert.equal(out.summary.comparedCells,4);
  assert.deepEqual(out.parameters[0].items[0],{index:0,coordinates:{x:1000,y:.2},before:0,after:-1,delta:-1,unit:'degrees'});
  assert.equal(out.parameters[0].items[1].delta,1);assert.equal(a.parameters[0].values[0],0);
  assert.equal(out.direction,'OPEN_DRAFT_MINUS_REFERENCE');assert.equal(out.controllerDefinitionsValidated,false);assert.equal(out.nativeFileExport,false);
});
test('missing tables are coverage gaps, never zero-filled values',()=>{
  const a=fixture(),b=fixture();a.parameters.push(numericParameter('Only.Reference','Reference','rpm',[],[],[800],[proof]));
  b.parameters.push(numericParameter('Only.Current','Current','rpm',[],[],[900],[proof]));
  const out=compareReal(a,b);assert.equal(out.summary.missingReference,1);assert.equal(out.summary.missingCurrent,1);assert.equal(out.summary.unchanged,1);assert.equal(out.summary.changedCells,0);
  assert.equal(out.parameters.find(p=>p.path==='Only.Reference').currentCells,null);
});
test('different axes, units, kinds and unverified descriptors cannot produce numeric deltas',()=>{
  for(const change of [p=>p.axes[0]=[900,2000],p=>p.axes[1].reverse(),p=>p.definition.unit='radians',p=>p.definition.axes[1].unit='mg',p=>p.definition.label='Other meaning',p=>p.definition.status='UNVERIFIED']){
    const a=fixture(),b=fixture();change(b.parameters[0]);b.parameters[0].values[0]=7;
    const out=compareReal(a,b);assert.equal(out.summary.incompatible,1);assert.equal(out.summary.changedCells,0);assert.equal(out.summary.comparedCells,0);
  }
});
test('conflicting vendor, controller or OS claims block shared comparisons',()=>{
  for(const field of ['vendor','controllerFamily','operatingSystem']){
    const a=fixture(),b=fixture();if(field==='vendor'){b.source.vendor='HOLLEY';b.source.name='fixture.terx';}
    else{a.source[field]='A';b.source[field]='B';a.source.identityEvidence=b.source.identityEvidence='Synthetic identity fixture';}
    const out=compareReal(a,b);assert.equal(out.summary.incompatible,1);assert.equal(out.identityConflicts.length,1);
  }
});
test('scalar, curve, enum and boolean changes preserve type and do not invent numeric deltas',()=>{
  const a=fixture();for(const [kind,value] of [['scalar',800],['boolean',false],['enum','A']]){
    const p=numericParameter('Example.'+kind,kind,'',[],[],[value],[proof]);p.definition.kind=kind;p.definition.choices=kind==='enum'?['A','B']:[];a.parameters.push(p);
  }
  a.parameters.push(numericParameter('Example.curve','Curve','g/s',[[0,150]],[{label:'Frequency',unit:'Hz'}],[0,.25],[proof]));
  const b=structuredClone(a);b.parameters[1].values[0]=900;b.parameters[2].values[0]=true;b.parameters[3].values[0]='B';b.parameters[4].values[1]=.5;
  const out=compareReal(a,b);assert.equal(out.summary.changedCells,4);assert.equal(out.parameters.find(p=>p.path==='Example.boolean').items[0].delta,null);assert.equal(out.parameters.find(p=>p.path==='Example.enum').items[0].after,'B');
});
test('report binds complete snapshots, all metadata and working values before hashing',async()=>{
  const a=fixture(),b=fixture();b.parameters[0].values[0]=1;const pending=reportRealComparison(a,b,'Fixture review');b.parameters[0].values[0]=9;a.name='Mutated';
  const out=await pending;assert.equal(out.parameters[0].items[0].after,1);assert.equal(out.drafts.current.parameters[0].values[0],1);assert.notEqual(out.drafts.reference.name,a.name);
  assert.equal(out.currentDraftSha256,await sha256(new TextEncoder().encode(JSON.stringify(out.drafts.current))));
  assert.equal(out.automaticLearningEligible,false);assert.equal(out.vehicleWriting,false);assert.equal(out.writeStrategy,'SIMULATION_ONLY');
  const again=await reportRealComparison(out.drafts.reference,out.drafts.current,'Another note');assert.equal(again.currentDraftSha256,out.currentDraftSha256);
});
test('invalid drafts and notes fail; identical drafts can still produce a coverage report',async()=>{
  assert.throws(()=>compareReal({},fixture()));assert.throws(()=>compareReal(fixture(),{...fixture(),writeStrategy:'FLASH'}));
  for(const note of ['',null,' '.repeat(3),'a'.repeat(2001)])await assert.rejects(reportRealComparison(fixture(),fixture(),note));
  assert.equal((await reportRealComparison(fixture(),fixture(),'No captured changes')).summary.unchanged,1);
});
