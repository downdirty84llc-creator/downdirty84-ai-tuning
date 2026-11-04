// Independent readers for observed text exports. No native tune/log decoding.
export const MAX_MEASURED_CSV_BYTES=32*1024*1024;
export const numberValue=text=>{const s=text.trim();return s!==''&&/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(s)&&Number.isFinite(Number(s))?Number(s):null;};
export async function byteFingerprint(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function decodeMeasuredCsv(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.byteLength>MAX_MEASURED_CSV_BYTES)throw Error('Choose a CSV no larger than 32 MiB.');
  try{return {text:new TextDecoder('utf-8',{fatal:true}).decode(bytes),encoding:'UTF-8'};}
  catch{const text=new TextDecoder('windows-1252',{fatal:true}).decode(bytes);if(!text.startsWith('Point Number,RTC,'))throw Error('Unsupported text encoding. Export a UTF-8 HP Tuners CSV or a Holley CSV.');return {text,encoding:'WINDOWS-1252'};}
}
function* csvRows(text){
  let row=[],cell='',quoted=false,closed=false,cells=0,lines=0;
  const field=()=>{if(row.length>=512||++cells>8000000)throw Error('CSV exceeds 512 columns or 8 million cells.');row.push(cell);cell='';closed=false;};
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;}
    else if(c===',')field();
    else if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;field();if(++lines>100110)throw Error('CSV exceeds 100,000 data rows.');yield row;row=[];}
    else if(c==='"'&&!cell&&!closed)quoted=true;
    else{if(closed||c==='"')throw Error('Malformed CSV quoting.');cell+=c;}
    if(cell.length>4096)throw Error('CSV field exceeds 4,096 characters.');
  }
  if(quoted)throw Error('Unclosed CSV field.');
  if(cell||row.length||closed){field();yield row;}
}
export function scanMeasuredCsv(text,visit=null){
  if(typeof text!=='string'||text.length>MAX_MEASURED_CSV_BYTES||text.includes('\0'))throw Error('Unsupported or oversized CSV text.');
  const rows=csvRows(text.replace(/^\uFEFF/,'')),next=()=>rows.next().value;
  const first=next();let names,units,ids,timeIndex,format;
  if(first?.length===1&&first[0]==='HP Tuners CSV Log File'){
    if(next()?.join()!=='Version: 1.0')throw Error('Unsupported HP Tuners CSV version.');
    let r,count=0;while((r=next())&&!(r.length===1&&r[0]==='[Channel Information]'))if(++count>100)throw Error('Channel header not found.');
    if(!r)throw Error('Channel header missing.');
    ids=next();names=next();units=next();timeIndex=0;format='HP_TUNERS_CSV_1';
    if(names?.[0]!=='Offset'||units?.[0]!=='s')throw Error('HP Tuners time must be Offset in seconds.');
    do{r=next();}while(r&&r.every(v=>!v.trim()));
    if(r?.length!==1||r[0]!=='[Channel Data]')throw Error('Channel data marker missing.');
  }else if(first?.[0]==='Point Number'&&first[1]==='RTC'){
    names=first;const rawUnits=next();
    if(rawUnits?.[1]!=='[sec]'||rawUnits.some(x=>x!==''&&!/^\[[^\[\]]+\]$/.test(x)))throw Error('Holley units must be bracketed and RTC must be [sec].');
    units=rawUnits.map(x=>x?x.slice(1,-1):'');ids=names.map((_,i)=>String(i));timeIndex=1;format='HOLLEY_CSV_RTC';
  }else throw Error('Use an HP Tuners version 1.0 CSV or a Holley Point Number / RTC CSV. Native HPL/DL files need a text export.');
  if(!names||!units||!ids||names.length<2||names.length>512||names.length!==units.length||names.length!==ids.length||ids.some(x=>!x.trim())||new Set(ids).size!==ids.length||names.some(x=>x.length>240)||units.some(x=>x.length>64))throw Error('Invalid channel definitions.');
  const channels=names.map((name,i)=>({id:ids[i],name,unit:units[i]}));
  let rowCount=0,start=null,end=null,duplicateTimes=0;
  for(const row of rows){
    if(row.every(x=>!x.trim()))continue;
    if(row.length!==channels.length)throw Error('Data row width differs from the channel header.');
    const time=numberValue(row[timeIndex]);
    if(time===null||end!==null&&time<end)throw Error('Time is missing, nonnumeric or moves backwards. Split separate recordings first.');
    if(++rowCount>100000)throw Error('CSV exceeds 100,000 data rows.');
    if(time===end)duplicateTimes++;start??=time;end=time;if(visit)visit(time,row,channels);
  }
  if(!rowCount||!Number.isFinite(end-start))throw Error('CSV has no usable time span.');
  return {format,channels,timeIndex,rowCount,start,end,duplicateTimes};
}
export async function inspectMeasuredFile(bytes,name){
  if(typeof name!=='string'||!name.toLowerCase().endsWith('.csv')||name.length>255||/[\\/]/.test(name))throw Error('Choose a CSV filename without a folder path.');
  const decoded=decodeMeasuredCsv(bytes),inspection=scanMeasuredCsv(decoded.text);
  return {text:decoded.text,inspection,source:{name,sha256:await byteFingerprint(bytes),bytes:bytes.byteLength,encoding:decoded.encoding,format:inspection.format}};
}
export function summarizeMeasuredFile(loaded,selection){
  const {start,end}=selection??{};
  if(!Number.isFinite(start)||!Number.isFinite(end)||start>end||start<loaded.inspection.start||end>loaded.inspection.end)throw Error('Choose ordered time windows within each recording.');
  const filters=selection.filters??[];
  if(!Array.isArray(filters)||filters.length>4||new Set(filters.map(f=>f.channelId)).size!==filters.length)throw Error('Use up to four distinct channel filters.');
  const checked=filters.map(f=>{
    const index=loaded.inspection.channels.findIndex(c=>c.id===f.channelId);
    if(index<0||!Number.isFinite(f.min)||!Number.isFinite(f.max)||f.min>f.max)throw Error('Choose a channel and finite, ordered filter limits.');
    return {...loaded.inspection.channels[index],index,min:f.min,max:f.max};
  });
  const values=loaded.inspection.channels.map(()=>[]),channels=loaded.inspection.channels.map(c=>({...c,numeric:0,missing:0,text:0,min:null,max:null,mean:null,median:null,p95:null}));
  let rows=0,windowRows=0,invalidFilterRows=0,outsideFilterRows=0,duplicateTimes=0,previous=null;
  scanMeasuredCsv(loaded.text,(time,row)=>{
    if(time<start||time>end)return;windowRows++;
    const context=checked.map(f=>numberValue(row[f.index]));
    if(context.some(v=>v===null)){invalidFilterRows++;return;}
    if(context.some((v,i)=>v<checked[i].min||v>checked[i].max)){outsideFilterRows++;return;}
    rows++;if(time===previous)duplicateTimes++;previous=time;
    row.forEach((v,i)=>{if(!v.trim())channels[i].missing++;else{const n=numberValue(v);if(n===null)channels[i].text++;else values[i].push(n);}});
  });
  channels.forEach((c,i)=>{
    const a=values[i].sort((a,b)=>a-b);c.numeric=a.length;if(!a.length)return;
    c.min=a[0];c.max=a.at(-1);let mean=0;for(let j=0;j<a.length;j++)mean=mean*(j/(j+1))+a[j]/(j+1);
    c.mean=mean;c.median=a.length%2?a[(a.length-1)/2]:a[a.length/2-1]/2+a[a.length/2]/2;c.p95=a[Math.ceil(a.length*.95)-1];
    if(![c.mean,c.median].every(Number.isFinite))throw Error('A channel exceeds supported numeric precision.');
  });
  return {source:{...loaded.source},selection:{start,end,filters:checked.map(({index,...f})=>f)},windowRows,rows,invalidFilterRows,outsideFilterRows,duplicateTimes,channels};
}
