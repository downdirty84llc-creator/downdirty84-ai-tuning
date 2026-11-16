import {caseReport,fields,commonChecks,issues} from './troubleshooting.mjs';

const groups=['Vehicle and event','Checklist','Reported outcome','Earlier recording','Later recording'];
export const comparisonGroups=Object.freeze(groups);
const checkLabels=new Map([...commonChecks,...issues.flatMap(i=>i.checks)].map(c=>[c.id,c.label]));
const outcomeLabels={result:'Reported result',changeReason:'Reason for changes',changes:'Changes made',conditions:'Test conditions',criterion:'Success criterion',observation:'Observation and evidence',nextAction:'Next action',reviewer:'Reviewer'};
const labels={name:'Filename',sha256:'SHA-256',bytes:'Bytes',encoding:'Encoding',format:'Format',associationNote:'Operator tune association',start:'Start (seconds)',end:'End (seconds)',windowRows:'Rows in window',rows:'Included rows',invalidFilterRows:'Invalid filter rows',outsideFilterRows:'Outside filter rows',duplicateTimes:'Repeated timestamps',numeric:'Numeric readings',missing:'Missing readings',text:'Nonnumeric readings',min:'Minimum',max:'Maximum',mean:'Mean',median:'Median',p95:'95th percentile'};
function entries(report){
  const result=new Map();
  const add=(key,group,label,value)=>result.set(JSON.stringify(key),{group,label,value});
  for(const [id,label]of fields)add(['context',id],groups[0],label,report.context[id]);
  add(['issue'],groups[0],'Selected issue',issues.find(i=>i.id===report.issueId).title);
  add(['relationship'],groups[0],'Operator tune / log association',report.relationship);
  for(const [id,c]of Object.entries(report.checks))for(const key of ['status','note'])add(['checks',id,key],groups[1],`${checkLabels.get(id)} · ${key}`,c[key]);
  const measured=report.measuredReview;
  if(measured)for(const [id,label]of Object.entries(outcomeLabels))add(['outcome',id],groups[2],label,measured.outcome[id]);
  for(const side of ['before','after']){
    const value=measured?.[side],group=side==='before'?groups[3]:groups[4];
    if(!value)continue;
    add([side,'present'],group,'Recording attached',true);
    for(const key of ['source','tune'])if(value[key])for(const [id,v]of Object.entries(value[key]))add([side,key,id],group,`${key==='source'?'CSV':'Tune'} · ${labels[id]??id}`,v);
    for(const key of ['start','end'])add([side,'window',key],group,`Window · ${labels[key]}`,value.selection[key]);
    for(const key of ['windowRows','rows','invalidFilterRows','outsideFilterRows','duplicateTimes'])add([side,key],group,labels[key],value[key]);
    // Source bytes, channel ID, name and units must all match before values are
    // aligned across revisions. New recordings are additions/removals, never
    // silently treated as repeated samples of the same channel.
    for(const f of value.selection.filters)for(const key of ['min','max'])add([side,'filter',value.source.sha256,f.id,f.name,f.unit,key],group,`Filter ${f.name||'Unnamed'} [${f.unit||'unit unspecified'}] · ID ${f.id} · ${labels[key]}`,f[key]);
    for(const c of value.channels)for(const key of ['numeric','missing','text','min','max','mean','median','p95'])add([side,'channel',value.source.sha256,c.id,c.name,c.unit,key],group,`Channel ${c.name||'Unnamed'} [${c.unit||'unit unspecified'}] · ID ${c.id} · ${labels[key]}`,c[key]);
  }
  return result;
}
export function compareCases(reference,current){
  const a=caseReport(reference),b=caseReport(current),left=entries(a),right=entries(b),changes=[];
  for(const key of new Set([...left.keys(),...right.keys()])){
    const x=left.get(key),y=right.get(key);
    if(x&&y&&x.value===y.value)continue;
    const row=y??x;changes.push({key,group:row.group,label:row.label,kind:!x?'added':!y?'removed':'changed',reference:x?{present:true,value:x.value}:{present:false},current:y?{present:true,value:y.value}:{present:false}});
  }
  const sourceChanges=['before','after'].filter(side=>a.measuredReview?.[side]?.source.sha256!==b.measuredReview?.[side]?.source.sha256);
  return {format:'DD84_CASE_COMPARISON_V1',writeStrategy:'SIMULATION_ONLY',learningReady:false,automaticApplication:false,reference:a,current:b,changes,
    counts:Object.fromEntries(groups.map(group=>[group,changes.filter(c=>c.group===group).length])),sourceChanges,
    limitations:[
      'Reference and current are the selected case revisions, not proof of chronological order or the same vehicle. Review their vehicle, controller and case references.',
      'This compares stored case contents, not native calibration tables or raw sensor samples. Same-source values align only on exact channel ID, name and units. Changed source bytes are shown as removed and added channel/filter values.',
      'Stored measurements are not independently verified. Reselect original CSVs to recheck them. Outcomes and tune associations remain operator statements.',
      'Derived assessments and measured differences are recalculated. Imported approval, status and verification claims are not trusted or compared.',
      'A changed value is not proof of better performance, a diagnosis, calibration approval or permission to flash. No automatic learning or application occurs.'
    ]};
}
export async function prepareCaseComparison(reference,current){
  // Canonical copies are captured before asynchronous hashing.
  const report=compareCases(reference,current);
  const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value,null,2))))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const [referenceSha256,currentSha256]=await Promise.all([hash(report.reference),hash(report.current)]);
  return {...report,referenceSha256,currentSha256,fingerprintBasis:'SHA-256 of UTF-8 JSON.stringify(caseReport, null, 2), without trailing newline. Identifies canonical contents, not authenticity or the original JSON bytes.'};
}
