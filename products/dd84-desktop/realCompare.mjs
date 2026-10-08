import {validateReal,sha256} from './realDraft.mjs';

const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const meaning=d=>({label:d.label,kind:d.kind,unit:d.unit,axes:d.axes,choices:d.choices});
function identityConflicts(a,b){
  const reasons=[];
  if(a.vendor!==b.vendor)reasons.push('Different source vendors.');
  for(const key of ['controllerFamily','operatingSystem'])if(a[key]&&b[key]&&a[key]!==b[key])reasons.push(`Conflicting ${key} claims.`);
  return reasons;
}
function compareValidated(reference,current){
  const conflicts=identityConflicts(reference.source,current.source);
  const before=new Map(reference.parameters.map(p=>[p.path,p])),after=new Map(current.parameters.map(p=>[p.path,p]));
  const paths=[...new Set([...before.keys(),...after.keys()])].sort();
  const parameters=paths.map(path=>{
    const a=before.get(path),b=after.get(path),base={path,label:(b??a).definition.label,referenceCells:a?.values.length??null,currentCells:b?.values.length??null};
    if(!a||!b)return {...base,status:!a?'MISSING_REFERENCE':'MISSING_CURRENT',reason:!a?'Not captured in the reference draft.':'Not captured in the open draft.',items:[]};
    let reason=conflicts.join(' ');
    if(!reason&&(a.definition.status!=='EXPORTED_VALUES'||b.definition.status!=='EXPORTED_VALUES'))reason='Unverified parameter metadata; values are not compared.';
    if(!reason&&!equal(meaning(a.definition),meaning(b.definition)))reason='Parameter labels, kinds, units, axis metadata or choices differ.';
    if(!reason&&!equal(a.axes,b.axes))reason='Axes differ; values are not interpolated or aligned by position.';
    if(reason)return {...base,status:'INCOMPATIBLE',reason,items:[]};
    const items=b.values.flatMap((value,i)=>{
      if(value===a.values[i])return [];
      const coordinates=b.axes.length===2?{x:b.axes[0][i%b.axes[0].length],y:b.axes[1][Math.floor(i/b.axes[0].length)]}:b.axes.length?{x:b.axes[0][i]}:{};
      return [{index:i,coordinates,before:a.values[i],after:value,delta:typeof value==='number'?value-a.values[i]:null,unit:b.definition.unit}];
    });
    return {...base,status:items.length?'CHANGED':'UNCHANGED',reason:'Matching exported metadata and axes only; controller compatibility is not established.',items};
  });
  const count=status=>parameters.filter(p=>p.status===status).length;
  return {format:'DD84_CALIBRATION_COMPARISON_V1',status:'LOCAL_DRAFT_NOT_RELEASED',writeStrategy:'SIMULATION_ONLY',direction:'OPEN_DRAFT_MINUS_REFERENCE',valueBasis:'WORKING_VALUES',nativeFileExport:false,vehicleWriting:false,controllerDefinitionsValidated:false,automaticLearningEligible:false,
    reference:{name:reference.name,source:reference.source},current:{name:current.name,source:current.source},identityConflicts:conflicts,
    summary:{parameters:parameters.length,changed:count('CHANGED'),unchanged:count('UNCHANGED'),missingReference:count('MISSING_REFERENCE'),missingCurrent:count('MISSING_CURRENT'),incompatible:count('INCOMPATIBLE'),comparedCells:parameters.filter(p=>['CHANGED','UNCHANGED'].includes(p.status)).reduce((n,p)=>n+p.currentCells,0),changedCells:parameters.reduce((n,p)=>n+p.items.length,0)},parameters};
}
export function compareReal(reference,current){return compareValidated(validateReal(reference),validateReal(current));}
export async function reportRealComparison(reference,current,note){
  if(typeof note!=='string'||!note.trim()||note.length>2000)throw Error('Enter a comparison note of 1–2,000 characters.');
  // Snapshot both drafts before asynchronous hashing; exported evidence must agree.
  reference=validateReal(reference);current=validateReal(current);
  const result=compareValidated(reference,current),encode=p=>new TextEncoder().encode(JSON.stringify(p));
  const [referenceDraftSha256,currentDraftSha256]=await Promise.all([sha256(encode(reference)),sha256(encode(current))]);
  const report={...result,note,referenceDraftSha256,currentDraftSha256,drafts:{reference,current}};
  if(new TextEncoder().encode(JSON.stringify(report,null,2)).length>16*1024*1024)throw Error('Comparison report exceeds 16 MB.');
  return report;
}
