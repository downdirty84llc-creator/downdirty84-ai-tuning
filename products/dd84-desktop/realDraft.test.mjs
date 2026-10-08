import {test} from 'node:test';import assert from 'node:assert/strict';
import {makeRealDraft,numericParameter,validateReal,sha256} from './realDraft.mjs';
import {importRealExport,mergeRealDrafts,verifyTuneSource} from './realImport.mjs';
import {parse,edit,changes,restore,backup,review,projectDefinition} from './project.mjs';
const proof={name:'synthetic-export.json',sha256:'a'.repeat(64)};
const source={vendor:'HP_TUNERS',name:'synthetic.hpt',sha256:'b'.repeat(64),bytes:null,controllerFamily:null,operatingSystem:null,identityEvidence:null};
const originalSource={path:'C:/synthetic.hpt',sha256:source.sha256};
function project(){return makeRealDraft('Synthetic real-export adapter fixture',source,[numericParameter('HPT.ECM.P42','Example exported table','degrees',[[1000,2000],[0.2,0.5]],[{label:'Engine speed',unit:'rpm'},{label:'Airmass',unit:'g'}],[0,-10,15,20],[proof])]);}
test('real draft edits exact imported values without enabling native writes, and originals round-trip',async()=>{
  const p=project(),edited=edit(p,'HPT.ECM.P42',0,-2.123456789);
  assert.equal(p.parameters[0].values[0],0);assert.equal(edited.parameters[0].original[0],0);
  assert.deepEqual(parse(JSON.stringify(edited)),edited);assert.deepEqual(backup(edited),p);assert.deepEqual(restore(edited),p);
  const delta=changes(edited)[0];assert.deepEqual(delta.coordinates,{x:1000,y:0.2});assert.equal(delta.after,-2.123456789);
  const draft=await review(edited,'Offline test only');assert.equal(draft.nativeFileExport,false);assert.equal(draft.vehicleWriting,false);assert.equal(draft.controllerDefinitionsValidated,false);assert.equal(draft.writeStrategy,'SIMULATION_ONLY');
});
test('numeric scalar, curve, descending map, boolean and enum descriptors are supported',()=>{
  const p=project(),n=numericParameter('Export.Scalar','Scalar','rpm',[],[],[800],[proof]);p.parameters.push(n);
  p.parameters.push(numericParameter('Export.Curve','Curve','g/s',[[0,150]],[{label:'Frequency',unit:'Hz'}],[0,0.25],[proof]));
  for(const [kind,value,choices] of [['boolean',false,[]],['enum','A',['A','B']]]){const item=structuredClone(n);item.path='Export.'+kind;item.definition.kind=kind;item.definition.unit='';item.definition.choices=choices;item.original=[value];item.values=[value];p.parameters.push(item);}
  p.parameters[0].axes[1].reverse();const v=validateReal(p);
  assert.equal(edit(v,'Export.boolean',0,true).parameters.at(-2).values[0],true);assert.equal(edit(v,'Export.enum',0,'B').parameters.at(-1).values[0],'B');
  assert.throws(()=>edit(v,'Export.enum',0,'C'));assert.throws(()=>edit(v,'Export.boolean',0,1));
});
test('unknown units and partial Holley definition remain read-only',()=>{
  const p=project();p.parameters[0].definition.status='UNVERIFIED';p.parameters[0].definition.unit=null;
  const loaded=parse(JSON.stringify(p));assert.equal(projectDefinition(loaded,'HPT.ECM.P42'),null);assert.throws(()=>edit(loaded,'HPT.ECM.P42',0,1),/read-only/);assert.deepEqual(restore(loaded),loaded);
  p.parameters[0].definition.status='EXPORTED_VALUES';assert.throws(()=>validateReal(p),/Unknown units/);
});
test('reject forged gates, malformed definitions, sparse cells, extra fields and ambiguous axes',()=>{
  for(const patch of [{writeStrategy:'FLASH'},{controller:'E92'},{status:'RELEASED'},{definitionSet:'BINARY_VALIDATED'},{nativeFileExport:true}])assert.throws(()=>validateReal({...project(),...patch}));
  for(const mutate of [p=>p.parameters[0].axes[0]=[1000,1000],p=>p.parameters[0].axes[0]=[1000,undefined],p=>delete p.parameters[0].values[1],p=>p.parameters[0].definition.min=100,p=>p.parameters[0].definition.encoding='f32',p=>p.parameters.push(p.parameters[0]),p=>p.source.operatingSystem='unverified-claim']){const p=project();mutate(p);assert.throws(()=>validateReal(p));}
  for(const v of [NaN,Infinity,1e10,'10',null])assert.throws(()=>edit(project(),'HPT.ECM.P42',0,v));
});
test('real review binds definition metadata, evidence and source; snapshots before hashing',async()=>{
  const p=edit(project(),'HPT.ECM.P42',0,1),pending=review(p,'note');p.parameters[0].values[0]=2;const r=await pending;assert.equal(r.items[0].after,1);
  const renamed=parse(JSON.stringify(r.project));renamed.name='Other name';assert.equal((await review(renamed,'another note')).originalSha256,r.originalSha256);
  renamed.parameters[0].definition.unit='radians';assert.notEqual((await review(renamed,'different metadata')).originalSha256,r.originalSha256);
  await assert.rejects(review(project(),'note'));await assert.rejects(review(r.project,''));
});
function mafExport(){return {format:'DD84_SIERRA_ABSOLUTE_MAF_V1',tables:[12160,12159].map(id=>{const unit=id===12160?'g/s':'lb/h';return {id,name:'Fixture MAF '+id,unit,final:{source:originalSource,frequencyHz:[0,150,300],airflow:[0,0.3,0.6],airflowUnit:unit}};})};}
test('import MAF preserves zero, units, stage, source hash and export fingerprint',async()=>{
  const text=JSON.stringify(mafExport()),p=await importRealExport(text,'maf.json','final');assert.equal(p.parameters.length,2);assert.equal(p.source.sha256,source.sha256);assert.equal(p.parameters[0].original[0],0);assert.equal(p.parameters[1].definition.unit,'lb/h');assert.equal(p.parameters[0].evidence[0].sha256,await sha256(new TextEncoder().encode(text)));
  await assert.rejects(importRealExport(text,'maf.json','original'));const bad=mafExport();bad.tables[1].final.source={...originalSource,sha256:'c'.repeat(64)};await assert.rejects(importRealExport(JSON.stringify(bad),'maf.json','final'),/mixes/);
  bad.tables[1].final.source=originalSource;bad.tables[1].final.airflowUnit='g/s';await assert.rejects(importRealExport(JSON.stringify(bad),'maf.json','final'),/units/);
});
test('spark import rejects incomplete rows, retains full matrices and merges only matching distinct parameters',async()=>{
  const table={source:originalSource,rpm:[1000,2000],airmass:[0.2,0.5],values:[[1,2],[3,4]]};
  const e={format:'DD84_SIERRA_SPARK_STAGES_V1',parameterId:12600,original:table};const p=await importRealExport(JSON.stringify(e),'spark.json','original');assert.deepEqual(p.parameters[0].values,[1,2,3,4]);
  assert.equal(mergeRealDrafts(project(),p).parameters.length,2);assert.throws(()=>mergeRealDrafts(p,p),/Duplicate/);const other=project();other.source.sha256='f'.repeat(64);assert.throws(()=>mergeRealDrafts(other,p),/different source/);
  table.values[0].pop();await assert.rejects(importRealExport(JSON.stringify(e),'spark.json','original'),/ragged/);
});
test('Holley candidate import cannot promote partial checks to editable definitions',async()=>{
  const e={format:'DD84_CANDIDATE_RAW_SPARK_EXTRACTION_V1',tables:{base:{source:{path:'C:/synthetic.terx',sha256:'c'.repeat(64)},rpm:[500,1000],map:[0,100],valuesByAscendingMap:[[1,2],[3,4]]}}};
  const p=await importRealExport(JSON.stringify(e),'candidate.json','base');assert.equal(p.source.vendor,'HOLLEY');assert.equal(projectDefinition(p,'Holley.Spark.Base'),null);assert.equal(p.parameters[0].definition.unit,null);assert.throws(()=>edit(p,'Holley.Spark.Base',0,10));
});
test('source verification requires exact bytes and rejects oversized inputs before reading',async()=>{
  const bytes=new Uint8Array([72,80,84,32,1,2]),file={size:bytes.length,arrayBuffer:async()=>bytes.buffer};const expected={...source,sha256:await sha256(bytes)};
  assert.equal((await verifyTuneSource(file,expected)).matches,true);assert.equal((await verifyTuneSource(file,source)).matches,false);
  await assert.rejects(verifyTuneSource({...file,size:100*1024*1024},expected),/64 MB/);
  await assert.rejects(verifyTuneSource({...file,size:7},expected),/changed/);
});
test('unsupported native files, names-only differences and oversized exports are rejected',async()=>{
  for(const input of ['HPT binary contents','{"format":"DD84_DIFFERENCES_V1"}','{"format":"UNKNOWN"}'])await assert.rejects(importRealExport(input,'file.json','original'));
  await assert.rejects(importRealExport(' '.repeat(4*1024*1024+1),'file.json','original'));
});
