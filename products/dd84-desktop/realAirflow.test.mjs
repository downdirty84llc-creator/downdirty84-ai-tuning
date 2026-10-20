import {test} from 'node:test';
import assert from 'node:assert/strict';
import {importRealExport,mergeRealDrafts} from './realImport.mjs';
import {attachControllerIdentity} from './realAirflow.mjs';
import {parse,edit,backup,projectDefinition} from './project.mjs';
import {compareReal,reportRealComparison} from './realCompare.mjs';
const evidence={name:'synthetic-native-capture.txt',sha256:'a'.repeat(64)};
const source={path:'C:/synthetic.hpt',sha256:'b'.repeat(64),bytes:10};
const stages=['original','intermediate','final'],indices=n=>Array.from({length:n},(_,i)=>i);
const modes=['Manifold Switch Closed','Manifold Switch Closed (DOD)','Manifold Switch Open (DOD)','Manifold Switch Open'];
function captured(rows,columns,decimals=4){
  const values=indices(rows).map(y=>indices(columns).map(x=>y*columns+x));
  return {evidence,displayDecimals:decimals,values,displayValues:values.map(r=>r.map(v=>v.toFixed(decimals)))};
}
function coefficientExport(){return {format:'DD84_SIERRA_VE_THREE_STAGES_V1',tables:[[13400,'Constant'],[13407,'MAP'],[13410,'MAP²'],[13409,'MAP.RPM'],[13412,'RPM'],[13414,'RPM²']].map(([parameterId,term])=>({parameterId,term,...Object.fromEntries(stages.map(stage=>[stage,{source,rowModes:modes,columnIndices:indices(30),...captured(4,30,12)}]))}))};}
function boundaryExport(){return {format:'DD84_SIERRA_VE_OPERATING_CONTEXT_V1',sources:Object.fromEntries(stages.map(s=>[s,source])),boundaryStages:Object.fromEntries(stages.map(s=>[s,{
  rpm:{parameterId:12171,columnLabels:indices(4).map(i=>`RPM Zone ${i}-${i+1}`),rowLabels:['Boundary RPM','Boundary RPM DoD'],...captured(2,4,0)},
  pressureRatio:{parameterId:32840,columnLabels:indices(5).map(i=>`RPM Zone ${i}`),rowLabels:indices(5).map(i=>`PRatio Zone ${i}-${i+1}`),...captured(5,5)},
  pressureRatioDod:{parameterId:32841,columnLabels:indices(5).map(i=>`RPM Zone ${i}`),rowLabels:indices(5).map(i=>`PRatio Zone ${i}-${i+1}`),...captured(5,5)}
}]))};}
const load=(data,stage='final')=>importRealExport(JSON.stringify(data),'fixture-export.json',stage);
function identityExport(){return {format:'DD84_SIERRA_AIRFLOW_APPLICABILITY_V1',stages:Object.fromEntries(stages.map(stage=>[stage,{source,controller:{hardware:'E92, ECM, GM SIDI',operatingSystem:'12664769',evidence,vehicleIdentitySha256:'c'.repeat(64),controllerSerialSha256:'d'.repeat(64)}}]))};}
const attach=(p,data=identityExport(),stage='final')=>attachControllerIdentity(p,JSON.stringify(data),'identity.json',stage);

test('all coefficient stages preserve complete tables, small residuals and categorical modes without becoming editable',async()=>{
  const e=coefficientExport();for(const s of stages){e.tables[3][s].values[0][29]=9.1e-11;e.tables[3][s].displayValues[0][29]='0.000000000091';}
  for(const s of stages){
    const p=await load(e,s);assert.equal(p.parameters.length,6);assert.equal(p.parameters[3].values[29],9.1e-11);
    assert.deepEqual(p.parameters[0].definition.axes[1].labels,modes);assert.equal(p.parameters[0].definition.unit,null);
    for(const t of p.parameters){assert.equal(t.values.length,120);assert.equal(projectDefinition(p,t.path),null);assert.throws(()=>edit(p,t.path,0,99),/read-only/);}
    assert.deepEqual(parse(JSON.stringify(p)),p);assert.equal(compareReal(p,p).summary.incompatible,6);
  }
});
test('coefficient imports reject truncation, reordered modes, mixed sources, duplicate IDs and precision mismatches',async()=>{
  for(const mutate of [e=>e.tables.pop(),e=>e.tables[0].parameterId=13407,e=>e.tables[0].term='VE %',e=>e.tables[0].final.rowModes=[...modes].reverse(),e=>e.tables[0].final.columnIndices[29]=30,e=>delete e.tables[0].final,e=>e.tables[0].final.source={...source,sha256:'f'.repeat(64)},e=>e.tables[0].final.values[0].pop(),e=>e.tables[0].final.displayValues[0][0]='0.01',e=>e.tables[0].final.values[0][0]=0.1,e=>delete e.tables[0].final.evidence,e=>e.tables[0].final.displayDecimals=13]){
    const e=coefficientExport();mutate(e);await assert.rejects(load(e));
  }
  await assert.rejects(load(coefficientExport(),'base'));
});
test('zone boundaries edit exact captured values and preserve category labels, originals and review snapshots',async()=>{
  for(const stage of stages){
    const p=await load(boundaryExport(),stage);assert.equal(p.parameters.reduce((n,t)=>n+t.values.length,0),58);
    assert.equal(p.parameters[0].definition.unit,'rpm');assert.equal(p.parameters[1].definition.unit,'ratio');
    const changed=edit(p,'HPT.ECM.P12171',4,1200);assert.deepEqual(backup(changed),p);assert.deepEqual(parse(JSON.stringify(changed)),changed);
    const report=await reportRealComparison(p,changed,'Synthetic boundary editing test');assert.equal(report.summary.changedCells,1);assert.deepEqual(report.parameters.find(t=>t.path==='HPT.ECM.P12171').items[0].coordinates,{x:0,y:1});
    assert.equal(report.drafts.current.parameters[0].definition.axes[1].labels[1],'Boundary RPM DoD');assert.equal(report.vehicleWriting,false);
  }
});
test('boundary imports and draft parsing reject incomplete or ambiguous categorical coordinates',async()=>{
  for(const mutate of [e=>delete e.boundaryStages.final.rpm,e=>e.boundaryStages.final.pressureRatio.parameterId=32841,e=>e.boundaryStages.final.rpm.rowLabels.reverse(),e=>e.boundaryStages.final.rpm.values.pop(),e=>delete e.boundaryStages.final.rpm.evidence,e=>e.boundaryStages.final.rpm.displayValues[0][0]='1,23']){const e=boundaryExport();mutate(e);await assert.rejects(load(e));}
  const p=await load(boundaryExport());
  for(const labels of [[],['Mode','Mode'],['Mode',null]]){const bad=structuredClone(p);bad.parameters[0].definition.axes[1].labels=labels;assert.throws(()=>parse(JSON.stringify(bad)));}
  const other=structuredClone(p);other.parameters[0].definition.axes[1].labels.reverse();assert.equal(compareReal(p,other).summary.incompatible,1);
});
test('controller evidence binds to exact source, excludes private identities, remains undoable and survives merging',async()=>{
  const p=await load(boundaryExport()),identified=await attach(p),coeff=await load(coefficientExport());
  assert.equal(p.source.controllerFamily,null);assert.equal(identified.source.controllerFamily,'E92, ECM, GM SIDI');assert.equal(identified.source.operatingSystem,'12664769');
  assert.match(identified.source.identityEvidence,/identity.json SHA-256/);assert(!JSON.stringify(identified).includes('vehicleIdentitySha256'));assert(!JSON.stringify(identified).includes('controllerSerialSha256'));
  for(const [a,b] of [[identified,coeff],[coeff,identified]]){const merged=mergeRealDrafts(a,b);assert.equal(merged.parameters.length,9);assert.deepEqual(merged.source,identified.source);assert.equal(merged.writeStrategy,'SIMULATION_ONLY');}
  assert.deepEqual(parse(JSON.stringify(identified)),identified);
});
test('identity attachment rejects wrong stage, vendor, fingerprint, size, unsupported identity and conflicts',async()=>{
  const p=await load(boundaryExport());
  for(const mutate of [e=>e.stages.final.source={...source,sha256:'f'.repeat(64)},e=>e.stages.final.source={...source,bytes:11},e=>e.stages.final.source={...source,bytes:null},e=>e.stages.final.controller.hardware='E38',e=>e.stages.final.controller.operatingSystem='1',e=>delete e.stages.final.controller.evidence,e=>e.stages.final.controller.evidence={...evidence,sha256:'bad'}]){const e=identityExport();mutate(e);await assert.rejects(attach(p,e));}
  await assert.rejects(attach(p,identityExport(),'base'));
  const bad=structuredClone(p);bad.source.controllerFamily='Other';bad.source.identityEvidence='Conflicting claim';await assert.rejects(attach(bad),/conflicts/);
  const other=await load(coefficientExport());other.source.bytes=11;assert.throws(()=>mergeRealDrafts(p,other),/byte counts/);
});
