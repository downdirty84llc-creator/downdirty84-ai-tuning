import {validate as validateLegacy,LIMIT} from './model.mjs';
import {DEFINITION_SET,definition} from './parameters.mjs';
export {LIMIT};
const FORMAT='DD84_STUDIO_V2', MAX_CELLS=32768;
function keys(object,allowed){
  if(!object||typeof object!=='object'||Array.isArray(object)||Object.keys(object).some(k=>!allowed.includes(k)))throw Error('Unsupported project fields.');
}
function atom(value){return typeof value==='boolean'||(typeof value==='number'&&Number.isFinite(value))||(typeof value==='string'&&value.length<=120);}
function validateParameter(p){
  keys(p,['path','axes','original','values']);
  if(typeof p.path!=='string'||! /^[A-Za-z][A-Za-z0-9_.-]{0,119}$/.test(p.path))throw Error('Invalid parameter path.');
  const d=definition(p.path);
  if(!Array.isArray(p.axes)||p.axes.length>2||!Array.isArray(p.original)||!Array.isArray(p.values))throw Error(`Invalid parameter structure: ${p.path}`);
  if(d&&p.axes.length!==d.axes.length)throw Error(`Wrong axis count: ${p.path}`);
  p.axes.forEach((axis,i)=>{
    if(!Array.isArray(axis)||axis.length<2||axis.length>256)throw Error(`Invalid axis size: ${p.path}`);
    for(const [j,n] of axis.entries()){
      if(!Number.isFinite(n)||(j>0&&n<=axis[j-1])||(d&&(n<d.axes[i].min||n>d.axes[i].max)))throw Error(`Axis must increase within definition bounds: ${p.path}`);
    }
  });
  const cells=p.axes.reduce((n,a)=>n*a.length,1);
  if(cells>4096||p.original.length!==cells||p.values.length!==cells)throw Error(`Invalid table dimensions: ${p.path}`);
  for(const values of [p.original,p.values])for(const value of values){
    if(!atom(value))throw Error(`Invalid value: ${p.path}`);
    if(!d)continue; // Unknown definitions are preserved for inspection, never editable.
    if(d.kind==='enum'){if(!d.choices.includes(value))throw Error(`Unsupported choice: ${p.path}`);}
    else if(d.kind==='boolean'){if(typeof value!=='boolean')throw Error(`Expected a switch value: ${p.path}`);}
    else if(typeof value!=='number'||value<d.min||value>d.max||(d.exclusiveMin&&value===d.min)||(d.integer&&!Number.isInteger(value)))throw Error(`Value outside definition bounds: ${p.path}`);
  }
  return {path:p.path,axes:p.axes.map(a=>[...a]),original:[...p.original],values:[...p.values]};
}
export function validate(project){
  if(project?.format==='DD84_STUDIO_V1'){
    const p=validateLegacy(project);
    return validate({format:FORMAT,writeStrategy:p.writeStrategy,controller:p.controller,definitionSet:DEFINITION_SET,name:p.name,parameters:[{path:p.path,axes:[p.axis],original:p.original,values:p.values}]});
  }
  keys(project,['format','writeStrategy','controller','definitionSet','name','parameters']);
  if(project.format!==FORMAT||project.writeStrategy!=='SIMULATION_ONLY'||project.controller!=='SIM-ECM-01'||project.definitionSet!==DEFINITION_SET)throw Error('Unsupported project or definitions. This editor accepts DD84 simulation projects only.');
  if(typeof project.name!=='string'||!project.name.trim()||project.name.length>120)throw Error('Project name must contain 1–120 characters.');
  if(!Array.isArray(project.parameters)||!project.parameters.length||project.parameters.length>128)throw Error('A project must contain 1–128 parameters.');
  const parameters=project.parameters.map(validateParameter),seen=new Set();let cells=0;
  for(const p of parameters){if(seen.has(p.path))throw Error(`Duplicate parameter: ${p.path}`);seen.add(p.path);cells+=p.values.length;}
  if(cells>MAX_CELLS)throw Error('Project exceeds 32,768 cells.');
  const result={format:FORMAT,writeStrategy:'SIMULATION_ONLY',controller:'SIM-ECM-01',definitionSet:DEFINITION_SET,name:project.name,parameters};
  // Pretty-printed saves must also be reopenable under the same byte limit.
  if(new TextEncoder().encode(JSON.stringify(result,null,2)).length>LIMIT)throw Error('Project exceeds 1 MB.');
  return result;
}
export function parse(text){if(new TextEncoder().encode(text).length>LIMIT)throw Error('Project exceeds 1 MB.');return validate(JSON.parse(text));}
export function sample(){
  const p=(path,axes,values)=>({path,axes,original:values,values});
  return validate({format:FORMAT,writeStrategy:'SIMULATION_ONLY',controller:'SIM-ECM-01',definitionSet:DEFINITION_SET,name:'My multi-parameter simulation',parameters:[
    p('Airflow.MAF.Curve',[[2000,3000,4000,5000,6000,7000]],[10,25,50,90,150,230]),
    p('Airflow.VE.Map',[[1000,2000,3000,4000],[30,60,90]],[40,45,50,55,55,60,65,70,65,70,75,80]),
    p('Spark.Advance.Map',[[1000,2000,3000,4000],[0.2,0.5,0.8]],[10,15,20,25,5,10,15,20,0,5,10,15]),
    p('Idle.TargetSpeed',[],[800]),p('Demo.TableSelection',[],['PRIMARY']),p('Demo.Switch',[],[false]),
  ]});
}
export function edit(project,path,index,value){
  const p=validate(project),parameter=p.parameters.find(item=>item.path===path);
  if(!parameter||!definition(path))throw Error('Parameter has no editable definition.');
  if(!Number.isInteger(index)||index<0||index>=parameter.values.length)throw Error('Invalid cell.');
  parameter.values[index]=value;return validate(p);
}
export function restore(project,path){
  const p=validate(project);
  if(path&&!p.parameters.some(item=>item.path===path&&definition(path)))throw Error('Parameter has no editable definition.');
  for(const parameter of p.parameters)if(definition(parameter.path)&&(!path||parameter.path===path))parameter.values=[...parameter.original];
  return p;
}
export function backup(project){const p=validate(project);for(const parameter of p.parameters)parameter.values=[...parameter.original];return p;}
export function coordinates(parameter,index){
  const axes=parameter.axes;
  return axes.length===0?{}:axes.length===1?{x:axes[0][index]}:{x:axes[0][index%axes[0].length],y:axes[1][Math.floor(index/axes[0].length)]};
}
export function changes(project){
  return validate(project).parameters.flatMap(p=>{
    const d=definition(p.path);
    return p.values.flatMap((after,index)=>{
      const before=p.original[index];if(before===after)return [];
      const item={path:p.path,index,kind:d?.kind??'unknown',coordinates:coordinates(p,index),before,after,unit:d?.unit??null,definitionKnown:!!d};
      if(d&&!['boolean','enum'].includes(d.kind)){item.delta=after-before;if(before!==0)item.multiplier=after/before;}
      return [item];
    });
  });
}
export async function review(project,note){
  const p=validate(project);
  if(typeof note!=='string'||!note.trim()||note.length>2000)throw Error('Add a review note (1–2,000 characters).');
  const items=changes(p);if(!items.length)throw Error('No changes to review.');
  const baseline={controller:p.controller,definitionSet:p.definitionSet,parameters:p.parameters.map(({path,axes,original})=>({path,axes,original})).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)};
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(baseline)));
  return {format:'DD84_STUDIO_REVIEW_V2',writeStrategy:'SIMULATION_ONLY',status:'LOCAL_DRAFT_NOT_RELEASED',name:p.name,controller:p.controller,definitionSet:p.definitionSet,createdAt:new Date().toISOString(),originalSha256:[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join(''),note:note.trim(),items,project:p};
}
