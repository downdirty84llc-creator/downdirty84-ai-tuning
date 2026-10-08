// Editable exported values, deliberately separate from native ECU/container definitions.
export const REAL_FORMAT='DD84_CALIBRATION_DRAFT_V1';
export const REAL_LIMIT=4*1024*1024;
const hash=/^[a-f0-9]{64}$/;
function keys(o,names){if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>!names.includes(k)))throw Error('Unsupported real-draft fields.');}
function text(v,max,label){if(typeof v!=='string'||!v.trim()||v.length>max)throw Error(`Invalid ${label}.`);return v;}
function finite(v){return typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e9;}
function evidence(e){keys(e,['name','sha256']);text(e.name,255,'evidence name');if(!hash.test(e.sha256))throw Error('Invalid evidence fingerprint.');return {...e};}
function source(s){
  keys(s,['vendor','name','sha256','bytes','controllerFamily','operatingSystem','identityEvidence']);
  if(!['HP_TUNERS','HOLLEY'].includes(s.vendor))throw Error('Unsupported source vendor.');
  text(s.name,255,'source name');if(/[\\/]/.test(s.name)||!hash.test(s.sha256)||!(s.bytes===null||(Number.isSafeInteger(s.bytes)&&s.bytes>=4&&s.bytes<=64*1024*1024)))throw Error('Invalid source identity.');
  if(s.vendor==='HP_TUNERS'?!/\.hpt$/i.test(s.name):! /\.(hefi|terx|sniper|sniper2|gcf)$/i.test(s.name))throw Error('Source extension does not match vendor.');
  for(const k of ['controllerFamily','operatingSystem','identityEvidence'])if(s[k]!==null)text(s[k],k==='identityEvidence'?2000:160,k);
  if((s.controllerFamily||s.operatingSystem)&&!s.identityEvidence)throw Error('Controller/OS claims require identity evidence.');
  return {...s};
}
function descriptor(d,count){
  keys(d,['label','group','kind','unit','axes','min','max','choices','status','reason']);
  text(d.label,240,'parameter label');text(d.group,120,'parameter group');text(d.reason,2000,'definition evidence');
  if(!['scalar','curve','map','enum','boolean'].includes(d.kind)||!['EXPORTED_VALUES','UNVERIFIED'].includes(d.status))throw Error('Unsupported parameter descriptor.');
  if(!Array.isArray(d.axes)||d.axes.length!==count||count!==({scalar:0,curve:1,map:2,enum:0,boolean:0}[d.kind]))throw Error('Descriptor axes do not match parameter kind.');
  const units=d.unit===null?false:typeof d.unit==='string'&&d.unit.length<=80;
  if(d.unit!==null&&!units)throw Error('Invalid value units.');
  for(const a of d.axes){keys(a,['label','unit']);text(a.label,120,'axis label');if(a.unit!==null)text(a.unit,80,'axis unit');}
  for(const v of [d.min,d.max])if(v!==null&&!finite(v))throw Error('Invalid format bound.');
  if(d.min!==null&&d.max!==null&&d.min>d.max)throw Error('Reversed format bounds.');
  if(!Array.isArray(d.choices)||d.choices.length>128||new Set(d.choices).size!==d.choices.length)throw Error('Invalid enum choices.');
  d.choices.forEach(v=>text(v,120,'choice'));
  if(d.kind==='enum'?!d.choices.length:d.choices.length!==0)throw Error('Choices must be provided only for enums.');
  if(d.status==='EXPORTED_VALUES'&&(!units||d.axes.some(a=>a.unit===null)))throw Error('Unknown units must remain unverified.');
  return structuredClone(d);
}
export function validateReal(p){
  keys(p,['format','name','writeStrategy','status','controller','definitionSet','source','parameters']);
  if(p.format!==REAL_FORMAT||p.writeStrategy!=='SIMULATION_ONLY'||p.status!=='LOCAL_DRAFT_NOT_RELEASED'||p.controller!=='SOURCE_BOUND_EXPORT'||p.definitionSet!=='EXPORT_METADATA_ONLY')throw Error('Real exports are local drafts only; native definitions and vehicle writing are unavailable.');
  text(p.name,120,'project name');const s=source(p.source);
  if(!Array.isArray(p.parameters)||!p.parameters.length||p.parameters.length>1024)throw Error('Expected 1–1,024 parameters.');
  const seen=new Set();let total=0;
  const parameters=p.parameters.map(t=>{
    keys(t,['path','axes','original','values','definition','evidence']);
    if(typeof t.path!=='string'||! /^[A-Za-z][A-Za-z0-9_.-]{0,119}$/.test(t.path)||seen.has(t.path))throw Error('Invalid or duplicate parameter path.');seen.add(t.path);
    if(!Array.isArray(t.axes)||t.axes.length>2)throw Error('Invalid axes.');
    for(const axis of t.axes){if(!Array.isArray(axis)||axis.length<2||axis.length>256)throw Error('Invalid axis length.');let direction=0;for(const [i,n] of axis.entries()){if(!finite(n))throw Error('Invalid axis value.');if(i){const sign=Math.sign(n-axis[i-1]);if(!sign||(direction&&direction!==sign))throw Error('Axes must be strictly monotonic.');direction=sign;}}}
    const count=t.axes.reduce((n,a)=>n*a.length,1);total+=count;
    if(count>4096||!Array.isArray(t.original)||!Array.isArray(t.values)||t.original.length!==count||t.values.length!==count)throw Error('Invalid complete-table dimensions.');
    const d=descriptor(t.definition,t.axes.length);
    for(const row of [t.original,t.values])for(const v of row){
      if(d.kind==='boolean'){if(typeof v!=='boolean')throw Error('Expected a boolean.');}
      else if(d.kind==='enum'){if(!d.choices.includes(v))throw Error('Unknown enum choice.');}
      else if(!finite(v)||(d.min!==null&&v<d.min)||(d.max!==null&&v>d.max))throw Error('Value outside exported format bounds.');
    }
    if(!Array.isArray(t.evidence)||!t.evidence.length||t.evidence.length>8)throw Error('Missing parameter evidence.');
    return {path:t.path,axes:t.axes.map(a=>[...a]),original:[...t.original],values:[...t.values],definition:d,evidence:t.evidence.map(evidence)};
  });
  if(total>65536)throw Error('Project exceeds 65,536 values.');
  const result={format:REAL_FORMAT,name:p.name,writeStrategy:'SIMULATION_ONLY',status:'LOCAL_DRAFT_NOT_RELEASED',controller:'SOURCE_BOUND_EXPORT',definitionSet:'EXPORT_METADATA_ONLY',source:s,parameters};
  if(new TextEncoder().encode(JSON.stringify(result,null,2)).length>REAL_LIMIT)throw Error('Real draft exceeds 4 MB.');return result;
}
export function realDefinition(p,path){const d=p.parameters.find(t=>t.path===path)?.definition;return d?.status==='EXPORTED_VALUES'?{...d,min:d.min??-1e9,max:d.max??1e9,exportOnly:true}:null;}
export function editReal(p,path,index,value){p=validateReal(p);const t=p.parameters.find(t=>t.path===path);if(!t||!realDefinition(p,path))throw Error('Unverified parameters are read-only.');if(!Number.isInteger(index)||index<0||index>=t.values.length)throw Error('Invalid cell.');t.values[index]=value;return validateReal(p);}
export function restoreReal(p,path,all=false){p=validateReal(p);if(path&&!realDefinition(p,path))throw Error('Unverified parameters are read-only.');for(const t of p.parameters)if((all||realDefinition(p,t.path))&&(!path||path===t.path))t.values=[...t.original];return p;}
export function realChanges(p){p=validateReal(p);return p.parameters.flatMap(t=>t.values.flatMap((after,i)=>{
  const before=t.original[i];if(before===after)return [];
  return [{path:t.path,index:i,kind:t.definition.kind,coordinates:t.axes.length===2?{x:t.axes[0][i%t.axes[0].length],y:t.axes[1][Math.floor(i/t.axes[0].length)]}:t.axes.length?{x:t.axes[0][i]}:{},before,after,unit:t.definition.unit,definitionKnown:!!realDefinition(p,t.path),definitionStatus:t.definition.status}];
}));}
export async function sha256(bytes){const d=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(d)].map(v=>v.toString(16).padStart(2,'0')).join('');}
export async function reviewReal(p,note){
  p=validateReal(p);text(note,2000,'review note');const items=realChanges(p);if(!items.length)throw Error('No changes to review.');
  const baseline={source:p.source,parameters:p.parameters.map(({path,axes,original,definition,evidence})=>({path,axes,original,definition,evidence})).sort((a,b)=>a.path.localeCompare(b.path,'en'))};
  const originalSha256=await sha256(new TextEncoder().encode(JSON.stringify(baseline)));
  return {format:'DD84_CALIBRATION_REVIEW_V1',status:p.status,writeStrategy:p.writeStrategy,nativeFileExport:false,vehicleWriting:false,controllerDefinitionsValidated:false,originalSha256,note,items,project:p};
}
export function numericParameter(path,label,unit,axes,axisInfo,values,evidence,status='EXPORTED_VALUES',reason='Readable absolute values; displayed precision only. No native encoding or controller limits established.'){
  return {path,axes,original:values,values,definition:{label,group:path.split('.')[0],kind:axes.length===2?'map':axes.length?'curve':'scalar',unit,axes:axisInfo,min:null,max:null,choices:[],status,reason},evidence};
}
export function makeRealDraft(name,source,parameters){return validateReal({format:REAL_FORMAT,name,writeStrategy:'SIMULATION_ONLY',status:'LOCAL_DRAFT_NOT_RELEASED',controller:'SOURCE_BOUND_EXPORT',definitionSet:'EXPORT_METADATA_ONLY',source,parameters});}
