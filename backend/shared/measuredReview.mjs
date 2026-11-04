// Saved measurements are source-derived locally and submitted as evidence, not
// authenticated sensor readings. Recompute deltas and gaps on every import.
export const MAX_MEASURED_REPORT_BYTES=768*1024;
const stats=['min','max','mean','median','p95'];
const string=(v,max,label)=>{if(typeof v!=='string'||v.length>max)throw Error('Invalid '+label+'.');return v;};
const count=v=>{if(!Number.isInteger(v)||v<0||v>100000)throw Error('Invalid measurement count.');return v;};
function source(v,tune=false){
  if(!v||typeof v.sha256!=='string'||!/^[a-f0-9]{64}$/.test(v.sha256)||!Number.isInteger(v.bytes)||v.bytes<1||v.bytes>(tune?256:32)*1024*1024)throw Error('Invalid source fingerprint.');
  const name=string(v.name,255,'source filename');if(!name||/[\\/]/.test(name))throw Error('Keep folder paths out of shared reports.');
  if(tune)return {name,sha256:v.sha256,bytes:v.bytes,associationNote:string(v.associationNote,2000,'tune association')};
  if(!name.toLowerCase().endsWith('.csv')||!['UTF-8','WINDOWS-1252'].includes(v.encoding)||!['HP_TUNERS_CSV_1','HOLLEY_CSV_RTC'].includes(v.format))throw Error('Unsupported measurement source.');
  return {name,sha256:v.sha256,bytes:v.bytes,encoding:v.encoding,format:v.format};
}
function side(v){
  if(v===null)return null;
  if(!v||!Array.isArray(v.channels)||v.channels.length<2||v.channels.length>512)throw Error('Invalid measured channel inventory.');
  const rows=count(v.rows),windowRows=count(v.windowRows),invalidFilterRows=count(v.invalidFilterRows),outsideFilterRows=count(v.outsideFilterRows),duplicateTimes=count(v.duplicateTimes);
  if(rows+invalidFilterRows+outsideFilterRows!==windowRows||duplicateTimes>Math.max(0,rows-1))throw Error('Inconsistent window counts.');
  const ids=new Set();
  const channels=v.channels.map(c=>{
    const id=string(c.id,240,'channel ID');if(!id||ids.has(id))throw Error('Duplicate or empty channel ID.');ids.add(id);
    const n=count(c.numeric),missing=count(c.missing),text=count(c.text);if(n+missing+text!==rows)throw Error('Channel coverage differs from included rows.');
    const r={id,name:string(c.name,240,'channel name'),unit:string(c.unit,64,'exported unit'),numeric:n,missing,text};
    for(const k of stats){const x=c[k];if(n?typeof x!=='number'||!Number.isFinite(x):x!==null)throw Error('Invalid channel statistic.');r[k]=x;}
    if(n&&(r.min>r.max||stats.slice(2).some(k=>r[k]<r.min-Math.abs(r.min)*1e-12||r[k]>r.max+Math.abs(r.max)*1e-12)))throw Error('Statistics fall outside the recorded range.');
    return r;
  });
  const s=v.selection;
  if(!s||!Number.isFinite(s.start)||!Number.isFinite(s.end)||s.start>s.end||!Array.isArray(s.filters)||s.filters.length>4)throw Error('Invalid measurement window.');
  const used=new Set();const filters=s.filters.map(f=>{
    const channel=channels.find(c=>c.id===f.id);
    if(!channel||used.has(f.id)||channel.name!==f.name||channel.unit!==f.unit||!Number.isFinite(f.min)||!Number.isFinite(f.max)||f.min>f.max)throw Error('Invalid source-bound filter.');
    used.add(f.id);return {id:channel.id,name:channel.name,unit:channel.unit,min:f.min,max:f.max};
  });
  return {source:source(v.source),tune:v.tune===null?null:source(v.tune,true),selection:{start:s.start,end:s.end,filters},windowRows,rows,invalidFilterRows,outsideFilterRows,duplicateTimes,channels};
}
export function normalizeMeasuredReview(v){
  if(!v||v.format!=='DD84_MEASURED_REVIEW_V1'||v.learningReady!==false||v.automaticApplication!==false||v.writeStrategy!=='SIMULATION_ONLY')throw Error('Unsupported measured review.');
  const before=side(v.before),after=side(v.after);
  if(!before&&!after)throw Error('Attach at least one readable CSV.');
  const raw=v.outcome;
  if(!raw||!['unassessed','improved','unchanged','worse','inconclusive'].includes(raw.result))throw Error('Invalid reported outcome.');
  const outcome={result:raw.result};
  for(const k of ['changeReason','changes','conditions','criterion','observation','nextAction','reviewer'])outcome[k]=string(raw[k],2000,k);
  const comparisons=[],unmatched=[];
  const key=c=>JSON.stringify([c.name,c.unit]);
  const counts=channels=>{const m=new Map();for(const c of channels)m.set(key(c),(m.get(key(c))??0)+1);return m;};
  const earlier=before?.channels??[],later=after?.channels??[],aCounts=counts(earlier),bCounts=counts(later),laterMap=new Map(later.map(c=>[key(c),c]));
  const paired=new Set();
  for(const a of earlier){
    if(['Offset','RTC','Point Number'].includes(a.name))continue;
    const b=laterMap.get(key(a));let reason='';
    if(!a.name||!a.unit)reason='Unnamed channel or unspecified units';
    else if(aCounts.get(key(a))!==1||(b&&bCounts.get(key(a))!==1))reason='Ambiguous duplicate channel label and units';
    else if(!b)reason='No later channel with the same label and units';
    else if(!a.numeric||!b.numeric)reason='No numeric readings on one or both sides';
    if(reason){unmatched.push({side:'before',id:a.id,name:a.name,unit:a.unit,reason});continue;}
    paired.add(b.id);const delta={};
    for(const k of stats){const d=b[k]-a[k];delta[k]=Number.isFinite(d)?d:null;}
    comparisons.push({name:a.name,unit:a.unit,beforeId:a.id,afterId:b.id,delta,flags:[...(a.min===a.max||b.min===b.max?['CONSTANT_RECORDED_VALUE']:[]),...(a.missing+b.missing?['MISSING_READINGS']:[]),...(a.text+b.text?['NONNUMERIC_READINGS']:[])]});
  }
  for(const b of later)if(!paired.has(b.id)&&!['Offset','RTC','Point Number'].includes(b.name))unmatched.push({side:'after',id:b.id,name:b.name,unit:b.unit,reason:'Not uniquely paired with numeric earlier readings and explicit units'});
  const missing=[];
  for(const [label,s]of [['Earlier',before],['Later',after]]){
    if(!s){missing.push(label+' readable recording');continue;}
    if(!s.tune?.associationNote.trim())missing.push(label+' exact tune and operator-confirmed log association');
    if(!s.rows)missing.push(label+' readings in the selected window and filters');
  }
  if(before&&after&&before.source.sha256===after.source.sha256)missing.push('Independent later recording: both sides contain the same CSV bytes');
  if(!comparisons.length)missing.push('At least one unambiguous shared numeric channel with explicit, identical units');
  for(const k of ['changeReason','changes','conditions','criterion','observation','nextAction','reviewer'])if(!outcome[k].trim())missing.push(k);
  if(outcome.result==='unassessed')missing.push('Operator outcome review');
  const report={format:'DD84_MEASURED_REVIEW_V1',writeStrategy:'SIMULATION_ONLY',learningReady:false,automaticApplication:false,
    before,after,outcome,comparisons,unmatched,missing,
    status:missing.length?'NEEDS_MORE_EVIDENCE':'DOCUMENTED_FOR_HUMAN_REVIEW',
    provenance:'SOURCE_SUMMARIES_NOT_SERVER_VERIFIED',
    limitations:[
      'Deltas are later minus earlier independent window statistics, not paired samples, calibration corrections or measured performance gains.',
      'Means and percentiles are weighted by exported rows, including repeated readings. They are not time-weighted; channels may be asynchronous.',
      'Only identical nonempty labels and exported units are paired automatically. Review physical sensor meaning; no cross-vendor mapping or unit conversion is inferred.',
      'Blank, nonnumeric, constant and unmatched channels remain visible. A constant or zero reading does not prove a healthy or failed sensor.',
      'Tune associations, change descriptions and outcomes are operator statements. Reopen and reselect source files to recompute saved statistics. Original files are not included.',
      'Different fuel, load, temperature, hardware, sensor calibration or test setup can explain differences. Timing optimization and power gains require suitable controlled evidence.',
      'This report does not enable adaptive learning, calibration approval, automatic application or ECU writes.'
    ]};
  if(new TextEncoder().encode(JSON.stringify(report,null,2)).length>MAX_MEASURED_REPORT_BYTES)throw Error('Measured review exceeds 768 KiB. Use a smaller channel export.');
  return report;
}
export function parseMeasuredReview(text){
  if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_MEASURED_REPORT_BYTES)throw Error('Measured review exceeds 768 KiB.');
  return normalizeMeasuredReview(JSON.parse(text));
}
