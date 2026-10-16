import {validate,projectDefinition,coordinates} from './project.mjs';

// Preview handles are local, immutable, and bound to the entire validated project.
// Saved or caller-constructed objects cannot be used to bypass preview validation.
const previews=new WeakMap();
function selectionFor(project,input){
  const keys=['path','xStart','xEnd','yStart','yEnd','operation','amount'];
  if(!input||typeof input!=='object'||Object.keys(input).length!==keys.length||keys.some(k=>!Object.hasOwn(input,k)))throw Error('Invalid range selection.');
  const p=project.parameters.find(p=>p.path===input.path),d=projectDefinition(project,input.path);
  if(!p||!d||!['curve','map'].includes(d.kind))throw Error('Range editing requires an editable numeric curve or map.');
  const width=p.axes[0].length,height=p.axes[1]?.length??1;
  for(const [start,end,size] of [[input.xStart,input.xEnd,width],[input.yStart,input.yEnd,height]]){
    if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start||end>=size)throw Error('Choose an inclusive range from an earlier to a later table position.');
  }
  if(!['SET','ADD','PERCENT'].includes(input.operation)||typeof input.amount!=='number'||!Number.isFinite(input.amount))throw Error('Choose an operation and a finite numeric amount.');
  return Object.freeze(Object.fromEntries(keys.map(k=>[k,input[k]])));
}
function calculate(project,selection){
  const next=validate(project),p=next.parameters.find(p=>p.path===selection.path),items=[];
  const {xStart,xEnd,yStart,yEnd,operation,amount}=selection;
  for(let y=yStart;y<=yEnd;y++)for(let x=xStart;x<=xEnd;x++){
    const index=y*p.axes[0].length+x,before=p.values[index];
    const after=operation==='SET'?amount:operation==='ADD'?before+amount:before*(1+amount/100);
    p.values[index]=after;
    items.push(Object.freeze({index,coordinates:Object.freeze(coordinates(p,index)),before,after}));
  }
  // Validate every result before returning anything that can be applied. Never clamp
  // or partially apply a rectangle when one of its values fails the definition.
  return {next:validate(next),items:Object.freeze(items)};
}
export function previewTableEdit(project,input){
  const baseline=validate(project),selection=selectionFor(baseline,input),{items}=calculate(baseline,selection);
  const preview=Object.freeze({selection,selectedCount:items.length,changedCount:items.filter(c=>c.before!==c.after).length,items});
  previews.set(preview,{baseline:JSON.stringify(baseline),selection});
  return preview;
}
export function applyTableEdit(project,preview){
  const record=previews.get(preview);
  if(!record||JSON.stringify(validate(project))!==record.baseline)throw Error('This preview is no longer current. Preview the range again before applying.');
  return calculate(project,record.selection).next;
}
