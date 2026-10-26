import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runSetupFields,runSetupSelection,savedRunSetupSelection,reviewRunSetup} from './runSetup.mjs';

const before=()=>({controller:'Synthetic controller A',operatingSystem:'Test OS 1',displacementLiters:5.3,
  camInstallation:'Synthetic cam card / installed position record',hardware:'Synthetic headers',fuel:'Synthetic gasoline',
  sensorChecks:'Synthetic wideband model and dated check record',evidenceNote:'Synthetic build and sensor records; not vehicle data'});
const pair=()=>({before:before(),after:before()});

test('blank setups remain entirely unknown without receiving any implied verification',()=>{
  const s=runSetupSelection();
  for(const side of ['before','after']){
    assert.ok(runSetupFields.every(f=>s[side][f.key]===null));assert.equal(s[side].evidenceNote,'');
    assert.equal(s[side].provenance,'OPERATOR_SUPPLIED_NOT_VERIFIED');
  }
  const r=reviewRunSetup(s);assert.deepEqual(r.counts,{missing:7,sameReported:0,differentReported:0});
  assert.ok(r.fields.every(f=>f.status==='NOT_RECORDED'));
  assert.equal(r.operatingConditionsMatched,false);assert.equal(r.learningReady,false);assert.equal(r.automaticApplication,false);
});
test('even complete identical reported setups cannot establish comparable conditions or enable learning',()=>{
  const r=reviewRunSetup(pair());assert.deepEqual(r.counts,{missing:0,sameReported:7,differentReported:0});
  assert.ok(r.fields.every(f=>f.status==='SAME_REPORTED_VALUE'));
  assert.equal(r.status,'OPERATING_CONDITIONS_NOT_ESTABLISHED');assert.equal(r.operatingConditionsMatched,false);
  assert.equal(r.learningReady,false);assert.equal(r.automaticApplication,false);
});
test('differences and one-sided missing details remain distinct and preserve the supplied evidence',()=>{
  const p=pair();p.after.displacementLiters=6;p.after.controller=null;p.before.operatingSystem=null;
  p.after.fuel='Synthetic E85';p.after.evidenceNote='Separate synthetic source';
  const r=reviewRunSetup(p),get=key=>r.fields.find(f=>f.key===key);
  assert.deepEqual(get('displacementLiters'),{key:'displacementLiters',label:'Engine displacement (liters)',unit:'L',before:5.3,after:6,status:'DIFFERENT_REPORTED_VALUES'});
  assert.equal(get('controller').status,'MISSING_LATER');assert.equal(get('operatingSystem').status,'MISSING_EARLIER');
  assert.deepEqual(r.counts,{missing:2,sameReported:3,differentReported:2});
  assert.deepEqual(r.evidenceNotes,{before:p.before.evidenceNote,after:p.after.evidenceNote});
});
test('text comparison trims only outer whitespace without inferring equivalent setups or valid sensor statements',()=>{
  const p=pair();p.before.controller='  Synthetic controller A\n';p.after.fuel='synthetic gasoline';
  p.before.sensorChecks='unknown';p.after.sensorChecks='unknown';
  const r=reviewRunSetup(p);
  assert.equal(r.fields.find(f=>f.key==='controller').status,'SAME_REPORTED_VALUE');
  assert.equal(r.fields.find(f=>f.key==='fuel').status,'DIFFERENT_REPORTED_VALUES');
  assert.equal(r.fields.find(f=>f.key==='sensorChecks').status,'SAME_REPORTED_VALUE');
  assert.equal(r.operatingConditionsMatched,false);
  assert.ok(r.limitations.some(s=>s.includes('not a validated sensor')));
});
test('any recorded setup detail requires a source note, and unknown details never require invention',()=>{
  for(const f of runSetupFields){
    assert.throws(()=>runSetupSelection({before:{[f.key]:before()[f.key]},after:null}),/source of each run/);
  }
  assert.equal(runSetupSelection({before:{fuel:' ',evidenceNote:''},after:null}).before.fuel,null);
  assert.equal(runSetupSelection({before:{evidenceNote:'Unknown setup; original paperwork missing'},after:null}).before.controller,null);
});
test('typed displacement and bounded text reject malformed, ambiguous and oversized values',()=>{
  for(const displacementLiters of [0,-1,31,NaN,Infinity,'5.3',false])
    assert.throws(()=>runSetupSelection({before:{...before(),displacementLiters},after:null}),/displacement/);
  for(const field of runSetupFields.filter(f=>!f.numeric)){
    assert.throws(()=>runSetupSelection({before:{...before(),[field.key]:'x'.repeat(field.max+1)},after:null}),/Invalid/);
    assert.throws(()=>runSetupSelection({before:{...before(),[field.key]:{}},after:null}),/Invalid/);
  }
  assert.throws(()=>runSetupSelection({before:{...before(),evidenceNote:'x'.repeat(2001)},after:null}));
  for(const input of [[],true,'bad',{}, {before:before()}, {before:[],after:null}])assert.throws(()=>runSetupSelection(input));
});
test('saved profiles require complete records and unverified provenance instead of silently accepting truncation',()=>{
  const s=runSetupSelection(pair());assert.deepEqual(savedRunSetupSelection(s),s);
  for(const side of ['before','after']){
    for(const field of [...runSetupFields.map(f=>f.key),'evidenceNote']){
      const bad=structuredClone(s);delete bad[side][field];assert.throws(()=>savedRunSetupSelection(bad),/incomplete/);
    }
    const bad=structuredClone(s);bad[side].provenance='SENSOR_VALIDATED';assert.throws(()=>savedRunSetupSelection(bad),/unsupported verification/);
  }
  for(const value of [null,{},[],{before:null,after:null}])assert.throws(()=>savedRunSetupSelection(value));
});
test('normalization makes a fresh snapshot, strips unknown claims and preserves plain text safely',()=>{
  const p=pair();p.before.approved=true;p.before.sensorChecks='<script>synthetic text</script>';
  const s=runSetupSelection(p);p.before.fuel='Changed';
  assert.equal(s.before.fuel,'Synthetic gasoline');assert.equal(Object.hasOwn(s.before,'approved'),false);
  assert.equal(s.before.sensorChecks,'<script>synthetic text</script>');
  assert.ok(JSON.stringify(reviewRunSetup(s)).length<15000);
});
