import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {captureLearningMeasurement,recheckLearningMeasurement,measurementReference,measurementCoverage} from './learningMeasurements.mjs';
import {makeLearningCase,parseLearningCase,attachLearningMeasurement,replaceLearningEvidence,learningReadiness,MAX_LEARNING_CASE_BYTES} from './learning.mjs';
const {validateRequest}=createRequire(import.meta.url)('./saveFile.cjs');
const original='a'.repeat(64),final='b'.repeat(64);
const tune=(role,sha256)=>({role,name:role.toLowerCase()+'.hpt',bytes:100,sha256,tuneSha256:null});
const base=()=>({vehicle:'Synthetic test vehicle',displacementLiters:5.3,camNotes:'Synthetic only',buildNotes:'Synthetic fuel and hardware notes',
  files:[tune('ORIGINAL',original),tune('FINAL',final)]});
const csv='HP Tuners CSV Log File\nVersion: 1.0\n[Channel Information]\n0,1,2,3,4\nOffset,Engine RPM,Wideband Lambda,MAF Frequency,Commanded Lambda\ns,rpm,lambda,Hz,lambda\n[Channel Data]\n0,0,1,1000,1\n1,1200,,2000,1\n1,1500,1.1,2500,1\n2,NaN,1,3000,1\n';
const review=(raw=csv)=>({raw,name:'synthetic.csv',tuneSha256:original,associationNote:'Synthetic tune association',
  selections:[{role:'RPM',channelId:'1',evidence:'Synthetic channel selection'},{role:'MEASURED_LAMBDA',channelId:'2',evidence:'Synthetic measurement selection'}]});
const capture=(input=review(),role='BEFORE_FINAL_LOG')=>captureLearningMeasurement(input,role,'Synthetic timeline statement');

test('attaches reviewed CSV to exact included tune; complete case round-trips through the native save bridge',async()=>{
  const receipt=await capture();
  const c=attachLearningMeasurement(base(),receipt);
  assert.equal(c.format,'DD84_LEARNING_CASE_V2');
  assert.deepEqual(c.measurements,[{
    role:'BEFORE_FINAL_LOG',source:{name:'synthetic.csv',textSha256:receipt.reference.source.textSha256,hashScope:'UTF8_DECODED_TEXT'},
    calibration:{sha256:original,note:'Synthetic tune association'},selections:review().selections,note:'Synthetic timeline statement'
  }]);
  assert.equal(c.learningReady,false);assert.equal(c.automaticApplication,false);
  const bytes=validateRequest({filename:'case.json',text:JSON.stringify(c)});
  assert.deepEqual(parseLearningCase(bytes.toString('utf8')),c);
  assert.equal(Object.hasOwn(c.measurements[0],'rows'),false);
  assert.equal(Object.hasOwn(c.measurements[0],'report'),false);
});
test('coverage preserves zeros, missing cells, nonnumeric values and unselected roles without deriving corrections',async()=>{
  const receipt=await capture(),coverage=measurementCoverage(receipt.reference,[receipt]);
  assert.deepEqual(coverage.selected,[
    {role:'RPM',name:'Engine RPM',unit:'rpm',numericCount:3,missingCount:0,textCount:1,flags:['NONNUMERIC_VALUES_PRESENT']},
    {role:'MEASURED_LAMBDA',name:'Wideband Lambda',unit:'lambda',numericCount:3,missingCount:1,textCount:0,flags:[]}
  ]);
  assert.equal(coverage.rows,4);assert.equal(coverage.sourceStatus,'SOURCE_RECHECKED');
  assert.ok(coverage.unselected.includes('COMMANDED_LAMBDA'));
  const r=learningReadiness(attachLearningMeasurement(base(),receipt),[receipt]);
  assert.equal(r.learningReady,false);assert.equal(r.automaticApplication,false);
  assert.ok(r.areas.every(a=>a.status==='NOT_LEARNING'));
  assert.ok(r.missing.some(x=>x.includes('after-final CSV')));
});
test('reopening references loses session verification, rejects forged receipts, and rechecks renamed matching CSVs',async()=>{
  const receipt=await capture(),c=parseLearningCase(JSON.stringify(attachLearningMeasurement(base(),receipt)));
  assert.equal(measurementCoverage(c.measurements[0]).sourceStatus,'SOURCE_RECHECK_REQUIRED');
  const forged=JSON.parse(JSON.stringify(receipt));
  assert.equal(measurementCoverage(c.measurements[0],[forged]).rows,null);
  assert.throws(()=>attachLearningMeasurement(base(),forged),/Review the source/);
  const checked=await recheckLearningMeasurement(c.measurements[0],csv,'renamed.csv');
  assert.equal(measurementCoverage(c.measurements[0],[checked]).rows,4);
  assert.equal(checked.report.source.name,'renamed.csv');
  assert.equal(c.measurements[0].source.name,'synthetic.csv');
  await assert.rejects(recheckLearningMeasurement(c.measurements[0],csv.replace('1500','1550'),'renamed.csv'),/do not match/);
  assert.equal(measurementCoverage(c.measurements[0],[checked]).rows,4);
});
test('wrong tune, duplicate CSV stages, and after-final references to other tunes are rejected',async()=>{
  const before=await capture(),c=attachLearningMeasurement(base(),before);
  assert.throws(()=>attachLearningMeasurement({...base(),files:[tune('FINAL',final)]},before),/included tune/);
  const duplicate=await capture(review(),'EARLIER_LOG');
  assert.throws(()=>attachLearningMeasurement(c,duplicate),/multiple timeline/);
  const wrongFinal=await capture(review(),'AFTER_FINAL_LOG');
  assert.throws(()=>attachLearningMeasurement(base(),wrongFinal),/final tune/);
  const after=await capture({...review(csv.replace('1500','1600')),tuneSha256:final},'AFTER_FINAL_LOG');
  const complete=attachLearningMeasurement(c,after);
  assert.equal(complete.measurements.length,2);
  assert.ok(!learningReadiness(complete,[before,after]).missing.some(x=>x.includes('Add an after-final')));
  assert.equal(learningReadiness(complete,[before,after]).learningReady,false);
});
test('replacing a tune or native timeline log clears affected CSVs and native associations',async()=>{
  const before=await capture(),after=await capture({...review(csv.replace('1500','1600')),tuneSha256:final},'AFTER_FINAL_LOG');
  const native={role:'BEFORE_FINAL_LOG',name:'source.hpl',bytes:10,sha256:'c'.repeat(64),tuneSha256:original};
  const c=attachLearningMeasurement(attachLearningMeasurement({...base(),files:[...base().files,native]},before),after);
  const replaced=replaceLearningEvidence(c,tune('ORIGINAL','d'.repeat(64)));
  assert.deepEqual(replaced.measurements,[after.reference]);
  assert.equal(replaced.files.find(f=>f.role===native.role).tuneSha256,null);
  const newLog=replaceLearningEvidence(c,{...native,sha256:'e'.repeat(64)});
  assert.deepEqual(newLog.measurements,[after.reference]);
  assert.equal(c.measurements.length,2);
});
test('capture rejects missing association, no reviewed channels, wrong channel units, and empty timeline evidence',async()=>{
  for(const patch of [{tuneSha256:''},{associationNote:''},{selections:[]},
    {selections:[{role:'MEASURED_LAMBDA',channelId:'4',evidence:'Commanded is not measured'}]},
    {selections:[{role:'RPM',channelId:'1',evidence:''}]}])
    await assert.rejects(capture({...review(),...patch}));
  await assert.rejects(captureLearningMeasurement(review(),'BEFORE_FINAL_LOG',''));
  await assert.rejects(capture(review(),'ORIGINAL'));
});
test('stored references reject malformed identity, duplicated roles, unsupported gates and oversized records',async()=>{
  const receipt=await capture(),c=attachLearningMeasurement(base(),receipt),m=c.measurements[0];
  for(const patch of [{source:{...m.source,hashScope:'FILE_BYTES'}},{source:{...m.source,name:'../secret.csv'}},
    {calibration:{...m.calibration,sha256:'bad'}},{selections:[...m.selections,m.selections[0]]},
    {selections:[{role:'__proto__',channelId:'1',evidence:'bad'}]},{note:' '},{role:'__proto__'}])
    assert.throws(()=>measurementReference({...m,...patch}));
  for(const patch of [{learningReady:true},{automaticApplication:true},{status:'RELEASED'},{measurements:null},
    {measurements:[m,m]},{writeStrategy:'REAL'}])assert.throws(()=>parseLearningCase(JSON.stringify({...c,...patch})));
  assert.throws(()=>parseLearningCase(' '.repeat(MAX_LEARNING_CASE_BYTES+1)));
});
test('legacy cases upgrade without invented measurements or source-verification claims',()=>{
  const {measurements,learningReady,automaticApplication,...old}=makeLearningCase(base());
  old.format='DD84_LEARNING_CASE_V1';
  const c=parseLearningCase(JSON.stringify(old));
  assert.deepEqual(c,makeLearningCase(base()));
  assert.throws(()=>parseLearningCase(JSON.stringify({...old,measurements:[]})),/legacy/);
  assert.throws(()=>parseLearningCase(JSON.stringify({...old,learningReady:true})),/legacy/);
});
test('asynchronous capture preserves its initial review snapshot and receipts cannot be modified',async()=>{
  const input=review(),pending=capture(input);
  input.tuneSha256=final;input.selections[0].evidence='Changed after request';
  const receipt=await pending;
  assert.equal(receipt.reference.calibration.sha256,original);
  assert.equal(receipt.reference.selections[0].evidence,'Synthetic channel selection');
  assert.throws(()=>{receipt.report.rowCount=999;},TypeError);
  const altered={...receipt.reference,note:'Different statement'};
  assert.equal(measurementCoverage(altered,[receipt]).sourceStatus,'SOURCE_RECHECK_REQUIRED');
});
test('channel identifiers preserve exact export whitespace through capture and recheck',async()=>{
  const input=review(csv.replace('0,1,2,3,4','0, 1 ,2,3,4'));
  input.selections[0].channelId=' 1 ';
  const receipt=await capture(input);
  assert.equal(receipt.reference.selections[0].channelId,' 1 ');
  assert.equal((await recheckLearningMeasurement(receipt.reference,input.raw,'renamed.csv')).report.rowCount,4);
});
