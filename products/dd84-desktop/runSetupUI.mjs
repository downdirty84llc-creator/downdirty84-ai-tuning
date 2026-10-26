import {runSetupFields} from './runSetup.mjs';

export function setupRunSetup(container,onChange) {
  const controls={};
  for(const [side,title] of [['before','Earlier run'],['after','Later run']]) {
    const details=document.createElement('details'),summary=document.createElement('summary');
    summary.textContent=title+' setup';details.append(summary);controls[side]={};
    for(const field of [...runSetupFields,{key:'evidenceNote',label:'Source and sensor-check evidence',max:2000}]) {
      const label=document.createElement('label'),control=document.createElement(field.numeric?'input':'textarea');
      label.textContent=title+': '+field.label;
      if(field.numeric){control.type='number';control.step='any';}
      else {control.rows=field.key==='evidenceNote'?3:2;control.maxLength=field.max;}
      control.placeholder=field.key==='evidenceNote'?'Where these details came from; dates, records and methods used. A note does not verify a sensor.':'Leave blank if unknown';
      control.oninput=onChange;label.append(control);details.append(label);controls[side][field.key]=control;
    }
    container.append(details);
  }
  return {
    get:()=>Object.fromEntries(['before','after'].map(side=>[side,Object.fromEntries(
      [...runSetupFields,{key:'evidenceNote'}].map(f=>[f.key,f.numeric?(controls[side][f.key].value===''?null:controls[side][f.key].valueAsNumber):controls[side][f.key].value]))])),
    set:value=>{for(const side of ['before','after'])for(const key of Object.keys(controls[side]))controls[side][key].value=value?.[side]?.[key]??'';}
  };
}
export function runSetupTable(review) {
  const section=document.createElement('div'),heading=document.createElement('h4'),notice=document.createElement('p');
  heading.textContent='Run setup review';
  notice.textContent=`${review.counts.missing} items incomplete · ${review.counts.differentReported} different reported values · ${review.counts.sameReported} same reported values. These are operator statements; comparable conditions are not established.`;
  const details=document.createElement('details'),summary=document.createElement('summary');
  summary.textContent='Show setup and sensor notes';details.open=review.fields.some(f=>f.before!==null||f.after!==null);
  const table=document.createElement('table');table.className='context-table';
  const head=document.createElement('thead'),header=document.createElement('tr');
  for(const text of ['Recorded setup','Earlier run','Later run','Review']){const cell=document.createElement('th');cell.scope='col';cell.textContent=text;header.append(cell);}
  head.append(header);const body=document.createElement('tbody');
  const labels={NOT_RECORDED:'Not recorded for either run',MISSING_EARLIER:'Earlier detail missing',MISSING_LATER:'Later detail missing',
    SAME_REPORTED_VALUE:'Same reported value — unverified',DIFFERENT_REPORTED_VALUES:'Different reported values — review required'};
  for(const field of review.fields){
    const row=document.createElement('tr'),label=document.createElement('th');label.scope='row';label.textContent=field.label;row.append(label);
    for(const text of [field.before??'Unknown',field.after??'Unknown',labels[field.status]]){const cell=document.createElement('td');cell.textContent=String(text);row.append(cell);}body.append(row);
  }
  const row=document.createElement('tr'),label=document.createElement('th');label.scope='row';label.textContent='Source and sensor-check evidence';row.append(label);
  for(const text of [review.evidenceNotes.before||'Not recorded',review.evidenceNotes.after||'Not recorded','Notes are not sensor validation']){const cell=document.createElement('td');cell.textContent=text;row.append(cell);}body.append(row);
  table.append(head,body);details.append(summary,table);
  const limits=document.createElement('p');limits.textContent='Exact text equality does not prove the same hardware or fuel. Setup notes are saved in this comparison report, not in the learning case. Sensor accuracy and controller identity remain unverified.';
  section.append(heading,notice,details,limits);return section;
}
