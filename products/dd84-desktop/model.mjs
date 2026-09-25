export const LIMIT=1024*1024;
export function validate(p) {
  if(!p||p.format!=='DD84_STUDIO_V1'||p.writeStrategy!=='SIMULATION_ONLY'||p.controller!=='SIM-ECM-01')throw Error('Unsupported project. This preview accepts DD84 simulation projects only.');
  if(typeof p.name!=='string'||!p.name.trim()||p.name.length>120)throw Error('Project name must contain 1–120 characters.');
  if(p.path!=='Airflow.MAF.Curve'||p.unit!=='g/s'||p.axisUnit!=='Hz')throw Error('Unsupported calibration table.');
  if(!Array.isArray(p.axis)||p.axis.length<2||p.axis.length>256||!Array.isArray(p.original)||!Array.isArray(p.values)||p.axis.length!==p.original.length||p.axis.length!==p.values.length)throw Error('Invalid table dimensions.');
  p.axis.forEach((n,i)=>{if(!Number.isFinite(n)||n<0||n>30000||(i&&n<=p.axis[i-1]))throw Error('Frequency axis must increase within 0–30,000 Hz.');});
  for(const row of [p.original,p.values])row.forEach(n=>{if(!Number.isFinite(n)||n<=0||n>5000)throw Error('Airflow values must be greater than zero and at most 5,000 g/s (format bounds, not tuning advice).');});
  return {format:p.format,writeStrategy:p.writeStrategy,controller:p.controller,name:p.name,path:p.path,unit:p.unit,axisUnit:p.axisUnit,axis:[...p.axis],original:[...p.original],values:[...p.values]};
}
export function parse(text){if(new TextEncoder().encode(text).length>LIMIT)throw Error('Project exceeds 1 MB.');return validate(JSON.parse(text));}
export function sample(){return validate({format:'DD84_STUDIO_V1',writeStrategy:'SIMULATION_ONLY',controller:'SIM-ECM-01',name:'My first calibration',path:'Airflow.MAF.Curve',unit:'g/s',axisUnit:'Hz',axis:[2000,3000,4000,5000,6000,7000],original:[10,25,50,90,150,230],values:[10,25,50,90,150,230]});}
export function changes(p){p=validate(p);return p.axis.flatMap((x,i)=>p.values[i]===p.original[i]?[]:[{path:p.path,type:'CURVE_POINT',coordinates:{x},before:p.original[i],after:p.values[i],unit:p.unit,multiplier:p.values[i]/p.original[i]}]);}
export function edit(p,index,value){p=validate(p);if(!Number.isInteger(index)||index<0||index>=p.values.length)throw Error('Invalid cell.');p.values[index]=value;return validate(p);}
export async function review(p,note){p=validate(p);if(typeof note!=='string'||!note.trim()||note.length>2000)throw Error('Add a review note (1–2,000 characters).');const items=changes(p);if(!items.length)throw Error('No changes to review.');const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({controller:p.controller,path:p.path,axis:p.axis,original:p.original})));return {format:'DD84_STUDIO_REVIEW_V1',writeStrategy:'SIMULATION_ONLY',status:'LOCAL_DRAFT_NOT_RELEASED',name:p.name,controller:p.controller,createdAt:new Date().toISOString(),originalSha256:[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join(''),note:note.trim(),items,project:p};}
