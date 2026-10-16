import {numericParameter,validateReal,sha256,REAL_LIMIT} from './realDraft.mjs';

const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const indices=n=>Array.from({length:n},(_,i)=>i);
const stages=['original','intermediate','final'];
const terms=new Map([[13400,'Constant'],[13407,'MAP'],[13410,'MAP²'],[13409,'MAP.RPM'],[13412,'RPM'],[13414,'RPM²']]);
const modes=['Manifold Switch Closed','Manifold Switch Closed (DOD)','Manifold Switch Open (DOD)','Manifold Switch Open'];
const rpmColumns=indices(4).map(i=>`RPM Zone ${i}-${i+1}`);
const ratioColumns=indices(5).map(i=>`RPM Zone ${i}`);
const ratioRows=indices(5).map(i=>`PRatio Zone ${i}-${i+1}`);

function capturedValues(t,rows,columns){
  if(!t?.evidence||!Number.isInteger(t.displayDecimals)||t.displayDecimals<0||t.displayDecimals>12||
    !Array.isArray(t.values)||t.values.length!==rows||!Array.isArray(t.displayValues)||t.displayValues.length!==rows)throw Error('Incomplete captured table or precision metadata.');
  const pattern=new RegExp(`^[+-]?(?:\\d{1,3}(?:,\\d{3})+|\\d+)${t.displayDecimals?`\\.\\d{${t.displayDecimals}}`:''}$`);
  for(let y=0;y<rows;y++){
    if(!Array.isArray(t.values[y])||t.values[y].length!==columns||!Array.isArray(t.displayValues[y])||t.displayValues[y].length!==columns)throw Error('Incomplete captured rows.');
    for(let x=0;x<columns;x++){
      const s=t.displayValues[y][x];
      if(typeof s!=='string'||!pattern.test(s)||Number(s.replaceAll(',',''))!==t.values[y][x])throw Error('Captured numeric values disagree with displayed precision.');
    }
  }
  return t.values.flat();
}

// These are capture adapters, not implementations of a controller's VE algorithm.
export function importAirflowTables(data,stage,proof,takeSource){
  if(!stages.includes(stage))throw Error('Choose original, intermediate or final for airflow captures.');
  if(data.format==='DD84_SIERRA_VE_THREE_STAGES_V1'){
    const remaining=new Set(terms.keys());
    if(!Array.isArray(data.tables)||data.tables.length!==6)throw Error('Expected six complete VE coefficient tables.');
    return data.tables.map(t=>{
      const v=t[stage];
      if(!remaining.delete(t.parameterId)||t.term!==terms.get(t.parameterId)||!v||!equal(v.rowModes,modes)||!equal(v.columnIndices,indices(30)))throw Error('Unrecognized coefficient identity, mode order or zone indices.');
      takeSource(v.source);
      return numericParameter(`HPT.ECM.P${t.parameterId}`,`VE Normal — ${t.term} coefficient`,null,[v.columnIndices,indices(4)],
        [{label:'Coefficient zone',unit:'index'},{label:'Manifold mode',unit:'index',labels:modes}],capturedValues(v,4,30),[proof,v.evidence],'UNVERIFIED',
        'Complete displayed coefficients; physical units and controller scaling are unverified. Mode labels do not establish runtime selection. Read-only; these values are not VE percentages or airflow corrections.');
    });
  }
  if(data.format!=='DD84_SIERRA_VE_OPERATING_CONTEXT_V1')throw Error('Unsupported airflow capture format.');
  const captured=data.boundaryStages?.[stage];
  if(!captured||Object.keys(captured).length!==3)throw Error('Expected three complete zone boundary tables.');
  takeSource(data.sources?.[stage]);
  return [
    ['rpm',12171,'Dynamic airflow zone — RPM boundaries','rpm',rpmColumns,['Boundary RPM','Boundary RPM DoD']],
    ['pressureRatio',32840,'Dynamic airflow zone — pressure ratio boundaries','ratio',ratioColumns,ratioRows],
    ['pressureRatioDod',32841,'Dynamic airflow zone — pressure ratio boundaries (DoD)','ratio',ratioColumns,ratioRows]
  ].map(([key,id,label,unit,columns,rows])=>{
    const t=captured[key];
    if(t?.parameterId!==id||!equal(t.columnLabels,columns)||!equal(t.rowLabels,rows))throw Error('Unrecognized boundary table or category labels.');
    return numericParameter(`HPT.ECM.P${id}`,label,unit,[indices(columns.length),indices(rows.length)],
      [{label:unit==='rpm'?'RPM zone transition':'RPM zone',unit:'index',labels:columns},{label:unit==='rpm'?'Operating mode':'Pressure ratio transition',unit:'index',labels:rows}],
      capturedValues(t,rows.length,columns.length),[proof,t.evidence],'EXPORTED_VALUES',
      'Complete displayed zone boundaries. Category labels identify table positions; they are not physical axis breakpoints. Runtime selection, equality behavior and hysteresis application are not modeled.');
  });
}

export async function attachControllerIdentity(project,raw,fileName,stage){
  project=validateReal(project);
  if(new TextEncoder().encode(raw).length>REAL_LIMIT)throw Error('Identity export exceeds 4 MB.');
  const data=JSON.parse(raw),s=data.stages?.[stage];
  if(data.format!=='DD84_SIERRA_AIRFLOW_APPLICABILITY_V1'||!stages.includes(stage)||!s)throw Error('Choose a captured stage from an airflow applicability identity record.');
  if(project.source.vendor!=='HP_TUNERS'||s.source?.sha256!==project.source.sha256||!Number.isSafeInteger(s.source?.bytes)||s.source.bytes<4||s.source.bytes>64*1024*1024||
    (project.source.bytes!==null&&s.source.bytes!==project.source.bytes))throw Error('Identity evidence belongs to a different source tune.');
  const c=s.controller;
  if(c?.hardware!=='E92, ECM, GM SIDI'||c.operatingSystem!=='12664769'||typeof c.evidence?.name!=='string'||!c.evidence.name.trim()||c.evidence.name.length>255||/[\\/]/.test(c.evidence.name)||! /^[a-f0-9]{64}$/.test(c.evidence.sha256))throw Error('Missing or unsupported captured controller identity.');
  for(const [key,value] of [['controllerFamily',c.hardware],['operatingSystem',c.operatingSystem]])if(project.source[key]&&project.source[key]!==value)throw Error('Controller/OS metadata conflicts.');
  const name=fileName.split(/[\\/]/).at(-1);
  return validateReal({...project,source:{...project.source,bytes:s.source.bytes,controllerFamily:c.hardware,operatingSystem:c.operatingSystem,
    identityEvidence:`Captured identity only; no native definitions validated. ${name} SHA-256 ${await sha256(new TextEncoder().encode(raw))}; ${c.evidence.name} SHA-256 ${c.evidence.sha256}`}});
}
