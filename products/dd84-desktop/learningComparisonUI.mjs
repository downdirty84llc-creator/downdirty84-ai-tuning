import {checkedMeasurement,measurementRoles} from './learningMeasurements.mjs';
import {compareLearningWindows,reopenLearningComparison,MAX_LEARNING_COMPARISON_BYTES} from './learningComparison.mjs';
import {saveJson} from './saveFileUI.mjs';

export function setupLearningComparison({getCase,getReceipts}) {
  const $ = suffix => document.getElementById('learning-compare-'+suffix);
  let revision=0,report=null,dirty=false;
  const status = text => $('status').textContent=text;
  const stages = () => getCase().measurements;
  const title = role => role.replaceAll('_',' ').toLowerCase();
  function clear(clearNote=true) {
    revision++;report=null;$('save').disabled=true;$('results').replaceChildren();
    if(clearNote){$('note').value='';dirty=false;}
    status('Choose stages, a shared channel and time windows, then compare.');
  }
  function ranges() {
    for(const side of ['before','after']) {
      const ref=stages().find(m=>m.role===$(side).value),checked=ref&&checkedMeasurement(ref,getReceipts());
      $(side+'-start').value=checked?.time.first??'';$(side+'-end').value=checked?.time.last??'';
      $(side+'-source').textContent=ref?`${ref.source.name} · ${checked?'CSV checked this session':'Recheck this CSV above to enable comparison'}`:'Attach a reviewed CSV above.';
    }
  }
  function channels() {
    const before=stages().find(m=>m.role===$('before').value),after=stages().find(m=>m.role===$('after').value);
    $('channel').replaceChildren(new Option('Choose a shared reviewed channel',''));
    for(const s of before?.selections??[])if(after?.selections.some(a=>a.role===s.role))
      $('channel').add(new Option(title(s.role),s.role));
  }
  function invalidate(sources=false) {
    clear();
    if(!sources)return;
    const refs=measurementRoles.flatMap(role=>stages().filter(m=>m.role===role));
    for(const side of ['before','after']) {
      const previous=$(side).value;
      $(side).replaceChildren(new Option('Choose a stage',''));
      for(const ref of refs)$(side).add(new Option(title(ref.role),ref.role));
      $(side).value=refs.some(m=>m.role===previous)?previous:'';
    }
    channels();ranges();
  }
  function render(result) {
    report=result;dirty=true;
    const table=document.createElement('table'),caption=document.createElement('caption');
    caption.textContent=`${title(result.selection.channelRole)} · independent window summaries · ${result.vehicle}`;
    const head=document.createElement('thead'),header=document.createElement('tr');
    for(const text of ['Recorded evidence',title(result.selection.beforeRole),title(result.selection.afterRole)]) {
      const cell=document.createElement('th');cell.scope='col';cell.textContent=text;header.append(cell);
    }
    head.append(header);const body=document.createElement('tbody');
    const fields=[['CSV',s=>s.reference.source.name],['Channel',s=>`${s.timeline.channel.name} [${s.timeline.channel.unit}]`],
      ['Window (seconds, inclusive)',s=>`${s.timeline.time.first} to ${s.timeline.time.last}`],
      ['Export rows',s=>s.timeline.selectedRowCount],['Repeated timestamps',s=>s.timeline.time.duplicateTimes],
      ['Numeric readings',s=>s.timeline.numericCount],['Missing readings',s=>s.timeline.missingCount],
      ['Nonnumeric readings',s=>s.timeline.textCount],['Observed minimum',s=>s.timeline.min??'No numeric readings'],
      ['Observed maximum',s=>s.timeline.max??'No numeric readings'],
      ['Window quality',s=>!s.timeline.selectedRowCount?'Empty window':!s.timeline.numericCount?'No numeric readings':s.timeline.min===s.timeline.max?'Constant recorded value':'Recorded range'],
      ['Tune SHA-256',s=>s.reference.calibration.sha256]];
    for(const [label,value] of fields) {
      const row=document.createElement('tr'),heading=document.createElement('th');heading.scope='row';heading.textContent=label;row.append(heading);
      for(const side of ['before','after']){const cell=document.createElement('td');cell.textContent=String(value(result[side]));row.append(cell);}
      body.append(row);
    }
    table.append(caption,head,body);$('results').replaceChildren(table);$('save').disabled=false;
  }
  for(const side of ['before','after'])$(side).onchange=()=>{clear();channels();ranges();};
  $('channel').onchange=()=>clear();
  for(const id of ['before-start','before-end','after-start','after-end'])$(id).oninput=()=>clear();
  $('note').oninput=()=>{clear(false);dirty=Boolean($('note').value);};
  $('build').onclick=async()=>{
    const request=++revision;report=null;$('save').disabled=true;$('results').replaceChildren();
    const range=side=>({start:$(side+'-start').valueAsNumber,end:$(side+'-end').valueAsNumber});
    try {
      const result=await compareLearningWindows(getCase(),getReceipts(),{
        beforeRole:$('before').value,afterRole:$('after').value,channelRole:$('channel').value,
        beforeRange:range('before'),afterRange:range('after'),note:$('note').value
      });
      if(request!==revision)return;render(result);
      status('Compared from checked CSV contents. Windows remain independent; this does not establish an improvement or enable tuning.');
    }catch(error){if(request===revision)status(error.message);}
  };
  $('save').onclick=async()=>{
    if(!report)return;const snapshot=report;
    const saved=await saveJson(snapshot,'DD84-log-window-comparison.json',status);
    if(saved.status==='saved'&&snapshot===report)dirty=false;
  };
  $('open').onchange=async e=>{
    const file=e.target.files[0];e.target.value='';if(!file)return;
    const request=++revision;
    try {
      if(file.size>MAX_LEARNING_COMPARISON_BYTES)throw Error('Saved log-window comparison exceeds 1 MB.');
      const saved=await file.text();if(request!==revision)return;
      const result=await reopenLearningComparison(saved,getCase(),getReceipts());if(request!==revision)return;
      $('before').value=result.selection.beforeRole;$('after').value=result.selection.afterRole;
      channels();ranges();$('channel').value=result.selection.channelRole;
      for(const side of ['before','after']){
        $(side+'-start').value=result.selection[side+'Range'].start;$(side+'-end').value=result.selection[side+'Range'].end;
      }
      $('note').value=result.note;render(result);dirty=false;
      status('Comparison reopened for the matching case and checked CSVs. All summaries were recomputed from the sources.');
    }catch(error){if(request===revision)status(error.message+' Current comparison retained.');}
  };
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  return {invalidate};
}
