import {measurementChecks,reviewedMapping} from './measurements.mjs';
// Independent read-only adapter for a supported text export, not native HPL data.
export const MAX_LOG_BYTES=16*1024*1024;
const numeric=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
function* rows(text){
  let row=[],cell='',quoted=false,closed=false,count=0,cells=0;
  const field=()=>{if(cell.length>4096||row.length>=256||++cells>5000000)throw Error('CSV field or cell limit exceeded.');row.push(cell);cell='';closed=false;};
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;}
    else if(c===',')field();
    else if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;field();if(++count>100100)throw Error('CSV row limit exceeded.');yield row;row=[];}
    else if(c==='"'&&!cell&&!closed)quoted=true;
    else {if(closed||c==='"')throw Error('Malformed CSV quoting.');cell+=c;}
    if(cell.length>4096)throw Error('CSV field too long.');
  }
  if(quoted)throw Error('Unclosed CSV field.');
  if(cell||row.length||closed){field();yield row;}
}
export function inspectLog(raw){
  if(typeof raw!=='string'||new TextEncoder().encode(raw).length>MAX_LOG_BYTES)throw Error('Log export must be at most 16 MB.');
  const stream=rows(raw.replace(/^\uFEFF/,''));
  const next=()=>stream.next().value;
  if(JSON.stringify(next())!==JSON.stringify(['HP Tuners CSV Log File'])||JSON.stringify(next())!==JSON.stringify(['Version: 1.0']))throw Error('Unsupported log export. Use the supported CSV log format version 1.0.');
  let r,metadataRows=0;
  while((r=next())&&!(r.length===1&&r[0]==='[Channel Information]'))if(++metadataRows>100)throw Error('Channel header not found.');
  if(!r)throw Error('Channel header missing.');
  const ids=next(),names=next(),units=next();
  if(!ids||!names||!units||ids.length<2||ids.length!==names.length||ids.length!==units.length||ids.some(x=>!x.trim())||new Set(ids).size!==ids.length||names.some(x=>!x.trim()))throw Error('Invalid channel definitions.');
  if(names[0]!=='Offset'||units[0]!=='s')throw Error('Time must be Offset in seconds; no units are guessed.');
  do{r=next();}while(r&&r.every(x=>!x.trim()));
  if(!r||r.length!==1||r[0]!=='[Channel Data]')throw Error('Channel data marker missing.');
  const channels=ids.map((id,i)=>({id,name:names[i],unit:units[i],numericCount:0,textCount:0,missingCount:0,min:null,max:null}));
  let rowCount=0,first=null,last=null,duplicateTimes=0;
  for(const row of stream){
    if(row.every(x=>!x.trim()))continue;
    if(row.length!==ids.length)throw Error('Data row width differs from channel definitions.');
    const t=row[0].trim();if(!numeric.test(t)||!Number.isFinite(Number(t)))throw Error('Invalid time value.');
    const time=Number(t);if(last!==null&&time<last)throw Error('Time moves backwards; split separate recordings before import.');
    if(time===last)duplicateTimes++;if(first===null)first=time;last=time;
    if(++rowCount>100000)throw Error('Log exceeds 100,000 rows.');
    row.forEach((value,i)=>{const c=channels[i],s=value.trim();if(!s){c.missingCount++;return;}if(numeric.test(s)&&Number.isFinite(Number(s))){const n=Number(s);c.numericCount++;c.min=c.min===null?n:Math.min(c.min,n);c.max=c.max===null?n:Math.max(c.max,n);}else c.textCount++;});
  }
  if(!rowCount)throw Error('Log has no data rows.');
  return {rowCount,time:{unit:'s',first,last,span:last-first,duplicateTimes},channels};
}
export async function logReport(raw,name,tuneSha256='',associationNote='',selections=[]){
  if(typeof name!=='string'||name.length>255||/[\\/]/.test(name)||!name.toLowerCase().endsWith('.csv'))throw Error('Expected a CSV filename.');
  if(typeof tuneSha256!=='string'||(tuneSha256&&!/^[a-f0-9]{64}$/i.test(tuneSha256)))throw Error('Calibration SHA-256 must contain 64 hexadecimal characters.');
  if(typeof associationNote!=='string'||associationNote.length>2000||(tuneSha256&&!associationNote.trim()))throw Error('Explain the calibration association before saving it.');
  const summary=inspectLog(raw),digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
  return {format:'DD84_LOG_INSPECTION_V1',status:'EVIDENCE_ONLY_NOT_RELEASED',writeStrategy:'SIMULATION_ONLY',source:{name,textSha256:Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join(''),hashScope:'UTF8_DECODED_TEXT'},calibration:{sha256:tuneSha256.toLowerCase()||null,association:tuneSha256?'OPERATOR_SUPPLIED_NOT_VERIFIED':'UNCONFIRMED',note:associationNote.trim()},...summary,measurementChecks:measurementChecks(summary),channelSelection:reviewedMapping(summary,selections),automaticApplication:false,learningReady:false,limitations:['Blank cells remain missing; no interpolation or forward fill is performed.','Row counts are export rows, not a uniform sampling rate.','Ranges are observed values, not validated measurements or recommended settings.','Exact label/unit matches identify candidates only; no sensor role is verified or automatically selected.','This inspection does not establish performance improvement or enable correction learning.']};
}
