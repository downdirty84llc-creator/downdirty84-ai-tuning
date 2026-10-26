import {sensorCheckFields,sensorCheckOutcomes} from './sensorChecks.mjs';

export function setupSensorChecks(container,onChange) {
  const controls={},contexts={};
  for(const [side,title] of [['before','Earlier'],['after','Later']]){
    const details=document.createElement('details'),summary=document.createElement('summary'),context=document.createElement('p');
    summary.textContent=title+' channel check';contexts[side]=context;controls[side]={};details.append(summary,context);
    for(const field of sensorCheckFields){
      const label=document.createElement('label'),control=document.createElement(field.date?'input':'textarea');
      label.textContent=title+' check: '+field.label;
      if(field.date)control.type='date';else{control.rows=2;control.maxLength=field.max;control.placeholder='Leave blank if unknown';}
      control.oninput=onChange;label.append(control);details.append(label);controls[side][field.key]=control;
    }
    const label=document.createElement('label'),outcome=document.createElement('select');label.textContent=title+' check: Reported outcome';
    for(const [value,text] of Object.entries(sensorCheckOutcomes))outcome.add(new Option(text,value));
    outcome.onchange=onChange;controls[side].outcome=outcome;label.append(outcome);details.append(label);container.append(details);
  }
  return {
    get:()=>Object.fromEntries(['before','after'].map(side=>[side,Object.fromEntries(Object.entries(controls[side]).map(([key,control])=>[key,control.value]))])),
    set:value=>{for(const side of ['before','after'])for(const [key,control] of Object.entries(controls[side]))control.value=value?.[side]?.[key]??(key==='outcome'?'NOT_RECORDED':'');},
    context:value=>{for(const side of ['before','after']){
      contexts[side].textContent=value[side]||'Choose stages and a shared channel, and recheck both CSVs first.';
      for(const control of Object.values(controls[side]))control.disabled=!value[side];
    }}
  };
}
export function sensorChecksTable(review,before,after) {
  const section=document.createElement('div'),heading=document.createElement('h4'),notice=document.createElement('p');
  heading.textContent='Selected-channel check evidence';
  notice.textContent='Reported checks do not validate sensors or enable learning. Incomplete, failed and inconclusive records need review.';
  const table=document.createElement('table');table.className='context-table';
  const head=document.createElement('thead'),header=document.createElement('tr');
  for(const text of ['Check evidence','Earlier run','Later run']){const cell=document.createElement('th');cell.scope='col';cell.textContent=text;header.append(cell);}head.append(header);
  const body=document.createElement('tbody'),statusLabels={NOT_RECORDED:'No check recorded',INCOMPLETE_RECORD:'Incomplete check record',
    REPORTED_FAILURE:'Reported failure — review required',REPORTED_INCONCLUSIVE:'Reported inconclusive — review required',REPORTED_PASS_NOT_VALIDATED:'Reported pass — not independently validated'};
  const names=Object.fromEntries(sensorCheckFields.map(f=>[f.key,f.label]));names.outcome='Reported outcome';
  const row=(label,values)=>{const tr=document.createElement('tr'),th=document.createElement('th');th.scope='row';th.textContent=label;tr.append(th);
    for(const value of values){const td=document.createElement('td');td.textContent=value;tr.append(td);}body.append(tr);};
  row('Source channel',[before,after].map(s=>`${s.reference.source.name}\n${s.timeline.channel.name} [${s.timeline.channel.unit}] · ID ${s.timeline.channel.id}`));
  row('Record review',['before','after'].map(side=>statusLabels[review[side].status]));
  row('Missing details',['before','after'].map(side=>review[side].missingFields.map(k=>names[k]).join('; ')||'None — completeness is not validation'));
  row('Reported outcome',['before','after'].map(side=>sensorCheckOutcomes[review[side].record.outcome]));
  for(const field of sensorCheckFields)row(field.label,['before','after'].map(side=>review[side].record[field.key]??'Not recorded'));
  table.append(head,body);const limits=document.createElement('p');
  limits.textContent='Only this selected channel is covered. Dates are not checked against recording time. Methods, reference instruments, readings, units and acceptance limits remain unverified. These records are saved with this comparison only.';
  section.append(heading,notice,table,limits);return section;
}
