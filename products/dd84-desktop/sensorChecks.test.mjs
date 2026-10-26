import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sensorCheckFields,sensorCheckSelection,savedSensorCheckSelection,bindSensorChecks,reviewSensorChecks} from './sensorChecks.mjs';
const full=()=>({device:'Synthetic instrument A, test fixture',checkDate:'2026-10-26',method:'Synthetic reference comparison',
  reference:'Synthetic reference A [test units]',expected:'100 +/- 1 test units',observed:'100.5 test units',evidence:'Synthetic check record only',outcome:'PASS_REPORTED'});
const bindings={before:{stage:'BEFORE_FINAL_LOG',csvSha256:'a'.repeat(64),tuneSha256:'b'.repeat(64),channelRole:'RPM',channelId:'1',unit:'rpm'},
  after:{stage:'AFTER_FINAL_LOG',csvSha256:'c'.repeat(64),tuneSha256:'d'.repeat(64),channelRole:'RPM',channelId:'2',unit:'rpm'}};
test('unknown sensor records stay unknown without borrowing general run notes',()=>{
  const selection=sensorCheckSelection();const review=reviewSensorChecks(selection);
  for(const side of ['before','after']){assert.equal(review[side].status,'NOT_RECORDED');assert.equal(review[side].missingFields.length,8);assert.equal(review[side].recordComplete,false);assert.equal(review[side].sensorValidated,false);}
  assert.equal(review.sensorValidated,false);assert.equal(review.learningReady,false);assert.equal(review.automaticApplication,false);
});
test('a complete reported pass never establishes sensor accuracy or learning readiness',()=>{
  const r=reviewSensorChecks({before:full(),after:full()});
  for(const side of ['before','after']){assert.equal(r[side].status,'REPORTED_PASS_NOT_VALIDATED');assert.deepEqual(r[side].missingFields,[]);assert.equal(r[side].recordComplete,true);assert.equal(r[side].sensorValidated,false);}
  assert.equal(r.status,'SENSOR_VALIDATION_NOT_ESTABLISHED');assert.equal(r.learningReady,false);
});
test('partial checks can be saved and identify every missing field despite a reported pass',()=>{
  for(const key of [...sensorCheckFields.map(f=>f.key),'outcome']){
    const record=full();delete record[key];const r=reviewSensorChecks({before:record,after:null});
    assert.equal(r.before.status,'INCOMPLETE_RECORD');assert.deepEqual(r.before.missingFields,[key]);
  }
});
test('failure and inconclusive reports stay visible even with incomplete documentation',()=>{
  for(const [outcome,status] of [['FAIL_REPORTED','REPORTED_FAILURE'],['INCONCLUSIVE_REPORTED','REPORTED_INCONCLUSIVE']]){
    for(const record of [{outcome},{...full(),outcome}]){const r=reviewSensorChecks({before:record,after:null});assert.equal(r.before.status,status);assert.equal(r.sensorValidated,false);}
  }
});
test('recorded text is not interpreted as passing arithmetic, converted units or approved limits',()=>{
  const r=reviewSensorChecks({before:{...full(),observed:'800 unknown-units <b>outside</b>'},after:null});
  assert.equal(r.before.record.observed,'800 unknown-units <b>outside</b>');assert.equal(r.before.status,'REPORTED_PASS_NOT_VALIDATED');assert.equal(r.sensorValidated,false);
});
test('dates reject impossible days and ambiguous formats without inventing chronology',()=>{
  for(const checkDate of ['2026-02-29','2026-04-31','2026-13-01','2026-00-01','2026-01-00','0000-01-01','10/26/2026','2026-1-2'])
    assert.throws(()=>sensorCheckSelection({before:{checkDate},after:null}),/real sensor-check date/);
  for(const checkDate of ['2024-02-29','9999-12-31','2000-02-29'])assert.equal(sensorCheckSelection({before:{checkDate},after:null}).before.checkDate,checkDate);
  assert.equal(sensorCheckSelection({before:{checkDate:' '},after:null}).before.checkDate,null);
});
test('malformed pairs, unsupported outcomes and oversized or non-text fields fail explicitly',()=>{
  for(const input of [[],false,'text',{}, {before:{}},{before:[],after:null}])assert.throws(()=>sensorCheckSelection(input));
  for(const outcome of ['VERIFIED','PASS',null,false,{},'toString'])assert.throws(()=>sensorCheckSelection({before:{outcome},after:null}));
  for(const field of sensorCheckFields){
    for(const value of [false,42,{},'x'.repeat(field.max+1)])assert.throws(()=>sensorCheckSelection({before:{[field.key]:value},after:null}));
  }
});
test('saved checks require complete record structure and exact CSV/tune/channel bindings',()=>{
  const s=bindSensorChecks({before:full(),after:null},bindings);assert.deepEqual(savedSensorCheckSelection(s,bindings),sensorCheckSelection(s));
  for(const side of ['before','after']){
    for(const key of [...sensorCheckFields.map(f=>f.key),'outcome','binding','provenance']){const bad=structuredClone(s);delete bad[side][key];assert.throws(()=>savedSensorCheckSelection(bad,bindings));}
    for(const key of Object.keys(bindings[side])){const bad=structuredClone(s);bad[side].binding[key]='changed';assert.throws(()=>savedSensorCheckSelection(bad,bindings),/does not match/);}
    const bad=structuredClone(s);bad[side].provenance='VERIFIED';assert.throws(()=>savedSensorCheckSelection(bad,bindings),/unsupported verification/);
  }
});
test('source bindings and records are copied and unsupported claims are discarded',()=>{
  const p={before:{...full(),sensorValidated:true},after:null},b=structuredClone(bindings),s=bindSensorChecks(p,b);
  p.before.observed='changed';b.before.channelId='changed';assert.equal(s.before.observed,'100.5 test units');assert.equal(s.before.binding.channelId,'1');
  assert.equal(Object.hasOwn(s.before,'sensorValidated'),false);assert.equal(s.before.provenance,'OPERATOR_SUPPLIED_NOT_VERIFIED');
});
