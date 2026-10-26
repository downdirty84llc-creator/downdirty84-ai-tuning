import {sample,parse,validate,edit,restore,backup,changes,coordinates,review,OPEN_LIMIT,isReal,projectDefinition} from './project.mjs';
import {importRealExport,mergeRealDrafts,verifyTuneSource} from './realImport.mjs';
import {compareReal,reportRealComparison} from './realCompare.mjs';
import {attachControllerIdentity} from './realAirflow.mjs';
import {previewTableEdit,applyTableEdit} from './tableEdit.mjs';
import {retainTableTabOrder,showMessage as message,setupNavigation} from './navigation.mjs';
import {saveJson} from './saveFileUI.mjs';
import {openWorkspace} from './workspaces.mjs';
const $=id=>document.getElementById(id);
let project=null,history=[],dirty=false,request=0,sourceRevision=0,selected='',sourceCheck='Source file not rechecked in this session.';
let comparisonProject=null,comparisonResult=null,comparisonSelected='';
let rangePreview=null;
const definition=path=>projectDefinition(project,path);
setupNavigation();
function element(tag,text){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;}
function replace(next){sourceRevision++;sourceCheck='Source file not rechecked in this session.';project=next;comparisonProject=null;comparisonSelected='';$('real-compare-note').value='';history=[];dirty=false;selected=next.parameters[0].path;$('parameter-search').value='';$('note').value='';render();openWorkspace('projects','edit-title');}
function mutate(next){request++;history.push(project);if(history.length>100)history.shift();project=next;dirty=true;$('real-compare-note').value='';render();}
function axisValue(p,d,axis,index){return d.axes[axis].labels?.[index]??String(p.axes[axis][index]);}
function location(p,index){const d=definition(p.path)??p.definition;return Object.values(coordinates(p,index)).map((v,i)=>d?.axes[i].labels?.[p.axes[i].indexOf(v)]??`${d?.axes[i].label??['X','Y'][i]} ${v} ${d?.axes[i].unit??''}`.trim()).join(', ')||'Value';}
function difference(before,after){
  if(before===after)return 'Unchanged';
  if(typeof before!=='number'||typeof after!=='number')return `${before} → ${after}`;
  const delta=after-before;return `${delta>0?'+':''}${Number(delta.toPrecision(8))}${before===0?' (from zero)':` (${((after/before-1)*100).toFixed(2)}%)`}`;
}
function inputFor(p,index,d){
  const input=element(d.kind==='enum'||d.kind==='boolean'?'select':'input');
  if(input.tagName==='SELECT'){
    const choices=d.kind==='boolean'?[false,true]:d.choices;
    for(const choice of choices){const option=element('option',String(choice));option.value=String(choice);input.append(option);}
  }else{input.type='number';input.step=d.integer?'1':'any';input.min=String(d.min);input.max=String(d.max);}
  input.value=String(p.values[index]);input.setAttribute('aria-label',`${d.label}: ${location(p,index)}`);
  input.addEventListener('input',()=>{request++;clearRangePreview();});
  input.addEventListener('change',()=>{
    try{
      if(!input.value.trim())throw Error('Enter a value.');
      const value=d.kind==='boolean'?input.value==='true':d.kind==='enum'?input.value:Number(input.value);
      const focused=document.activeElement===input;
      mutate(edit(project,p.path,index,value));message('Working value updated; original preserved.');
      if(focused)$('parameter-table').querySelectorAll('input,select')[index]?.focus();
    }catch(e){message(e.message);input.value=String(p.values[index]);}
  });retainTableTabOrder(input,index);return input;
}
function renderParameter(){
  clearRangePreview();$('range-editor').hidden=true;
  const p=project.parameters.find(item=>item.path===selected);
  $('parameter-table').replaceChildren();$('parameter-raw').hidden=true;
  $('reset-selected').disabled=!p||!definition(p.path);
  if(!p){$('parameter-description').textContent='No parameters match your search.';return;}
  const editable=!!definition(p.path),d=definition(p.path)??p.definition;
  if(!d){
    $('parameter-description').textContent=`${p.path} · Read-only: no definition installed. ${p.definition?.reason??'Units and meaning are unknown.'} Values are preserved on save.`;
    $('parameter-raw').hidden=false;$('parameter-raw').textContent=JSON.stringify(p,null,2);return;
  }
  const bounds=d.kind==='enum'?`Choices: ${d.choices.join(', ')}`:d.kind==='boolean'?'Choices: false / true':`Format bounds: ${d.exclusiveMin?'>':'≥'} ${d.min} to ${d.max} ${d.unit}${d.integer?' (integer)':''}`;
  $('parameter-description').textContent=editable?`${d.label} · ${p.path} · ${bounds}. ${isReal(project)?'Exported values only; controller encoding and tuning limits are not validated. '+d.reason:'These are synthetic definitions, not vehicle tuning limits.'} Axes stay fixed.`:`${d.label} · ${p.path} · Read-only. ${d.reason} Unknown units are not inferred. Values are preserved on save.`;
  const table=$('parameter-table'),head=element('thead'),tr=element('tr'),body=element('tbody');
  const titles=d.kind==='map'?[`${d.axes[1].label} (${d.axes[1].unit??'unknown units'}) ↓ / ${d.axes[0].label} (${d.axes[0].unit??'unknown units'}) →`,...p.axes[0].map((_,i)=>axisValue(p,d,0,i))]:[p.axes.length?`${d.axes[0].label} (${d.axes[0].unit??'unknown units'})`:'Setting',`Original${d.unit?` (${d.unit})`:''}`,`Working${d.unit?` (${d.unit})`:''}`,'Change'];
  for(const title of titles){const th=element('th',title);th.scope='col';tr.append(th);}head.append(tr);table.append(head,body);
  if(d.kind==='map'){
    for(let y=0;y<p.axes[1].length;y++){
      const row=element('tr'),axis=element('th',axisValue(p,d,1,y));axis.scope='row';row.append(axis);
      for(let x=0;x<p.axes[0].length;x++){
        const i=y*p.axes[0].length+x,td=element('td');td.classList.toggle('edited-cell',p.values[i]!==p.original[i]);
        td.append(element('small',`Original: ${p.original[i]} ${d.unit??'(units unverified)'}`),editable?inputFor(p,i,d):element('span',String(p.values[i])),element('small',difference(p.original[i],p.values[i])));row.append(td);
      }body.append(row);
    }
  }else p.values.forEach((value,i)=>{
    const row=element('tr');row.classList.toggle('edited-cell',value!==p.original[i]);
    row.append(element('td',p.axes.length?axisValue(p,d,0,i):d.label),element('td',String(p.original[i])));
    const working=element('td');working.append(editable?inputFor(p,i,d):element('span',String(value)));row.append(working,element('td',difference(p.original[i],value)));body.append(row);
  });
  renderRangeEditor(p,editable?d:null);
}
function clearRangePreview(){
  rangePreview=null;$('range-apply').disabled=true;$('range-preview-summary').textContent='Preview the selected working values before applying.';$('range-preview-values').textContent='';
}
function rangeSelection(){
  if(!$('range-amount').value.trim())throw Error('Enter an adjustment amount.');
  return {path:selected,xStart:Number($('range-x-start').value),xEnd:Number($('range-x-end').value),yStart:Number($('range-y-start').value),yEnd:Number($('range-y-end').value),operation:$('range-operation').value,amount:Number($('range-amount').value)};
}
function highlightRange(){
  const p=project?.parameters.find(p=>p.path===selected);if(!p)return;
  const xs=Number($('range-x-start').value),xe=Number($('range-x-end').value),ys=Number($('range-y-start').value),ye=Number($('range-y-end').value),width=p.axes[0]?.length??1;
  $('parameter-table').querySelectorAll('input').forEach((input,index)=>{
    const x=index%width,y=Math.floor(index/width);input.closest('td').classList.toggle('range-cell',x>=xs&&x<=xe&&y>=ys&&y<=ye);
  });
}
function renderRangeEditor(p,d){
  if(!d||!['curve','map'].includes(d.kind))return;
  $('range-editor').hidden=false;$('range-y-controls').hidden=d.kind!=='map';
  for(const [axis,key] of [[0,'x'],[1,'y']]){
    for(const edge of ['start','end']){
      const select=$(`range-${key}-${edge}`);select.replaceChildren();
      for(let i=0;i<(p.axes[axis]?.length??1);i++){
        const option=element('option',p.axes[axis]?`${i+1}: ${axisValue(p,d,axis,i)}${d.axes[axis].labels?'':` ${d.axes[axis].unit}`}`:'1');option.value=String(i);select.append(option);
      }
    }
    $(`range-${key}-label`).textContent=p.axes[axis]?`${axis===0?'Columns':'Rows'} · ${d.axes[axis].label}`:'Rows';
  }
  $('range-operation').value='ADD';$('range-amount').value='';$('range-amount').step=d.integer?'1':'any';
  $('range-unit').textContent=`Set / add use ${d.unit||'the table units'}. Percent scales each working value by 1 + amount ÷ 100; +5 means ×1.05. Range endpoints include both positions, in displayed order.`;
  highlightRange();
}
for(const id of ['range-x-start','range-x-end','range-y-start','range-y-end','range-operation','range-amount'])$(id).addEventListener('input',()=>{request++;clearRangePreview();highlightRange();});
$('range-preview').onclick=()=>{
  clearRangePreview();
  try{
    rangePreview=previewTableEdit(project,rangeSelection());const p=project.parameters.find(p=>p.path===selected);
    $('range-preview-summary').textContent=`${rangePreview.selectedCount} selected values · ${rangePreview.changedCount} will change. Apply commits the entire range as one undoable edit.`;
    $('range-preview-values').textContent=rangePreview.items.slice(0,200).map(c=>`${location(p,c.index)}: ${c.before} → ${c.after}`).join('\n')+(rangePreview.items.length>200?`\nShowing the first 200 of ${rangePreview.items.length} selected values. Apply includes all selected values.`:'');
    $('range-apply').disabled=!rangePreview.changedCount;message('Range preview ready. Check the values before applying.');
  }catch(e){$('range-preview-summary').textContent=e.message;message(e.message);}
};
$('range-apply').onclick=()=>{
  try{
    if(!rangePreview||JSON.stringify(rangeSelection())!==JSON.stringify(rangePreview.selection))throw Error('Preview the range again before applying.');
    const count=rangePreview.changedCount;if(!count)return;
    mutate(applyTableEdit(project,rangePreview));message(`${count} values updated in one undoable edit; originals preserved.`);
  }catch(e){clearRangePreview();message(e.message);}
};
function renderLibrary(){
  const filter=$('parameter-search').value.trim().toLowerCase(),list=$('parameter-list');list.replaceChildren();
  const visible=project.parameters.filter(p=>{const d=definition(p.path)??p.definition;return `${p.path} ${d?.label??''} ${d?.group??''}`.toLowerCase().includes(filter);});
  if(!visible.some(p=>p.path===selected))selected=visible[0]?.path??'';
  for(const p of visible){const d=definition(p.path)??p.definition,count=p.values.filter((v,i)=>v!==p.original[i]).length,option=element('option',`${d?.group??'Unknown'} / ${d?.label??p.path}${!definition(p.path)?' [read-only]':''}${count?` · ${count} changed`:''}`);option.value=p.path;list.append(option);}
  list.value=selected;list.disabled=!visible.length;
  const editable=project.parameters.filter(p=>definition(p.path)).length;
  $('parameter-count').textContent=`${project.parameters.length} parameters · ${editable} editable · ${project.parameters.length-editable} read-only · ${visible.length} shown`;
  renderParameter();
}
function render(){
  $('workspace').hidden=!project;$('project-navigation').hidden=!project;if(!project)return;
  $('name').value=project.name;$('identity').textContent=`${project.controller} · ${project.definitionSet} · ${dirty?'Unsaved edits':'Project loaded'}`;
  $('editor-mode').textContent=isReal(project)?'Real exported values — local draft only. The source tune is not modified; native tune export and vehicle writing are unavailable. Displayed precision may differ from native stored precision.':'Synthetic simulation examples; no vehicle data.';
  $('real-source-details').hidden=!isReal(project);
  if(isReal(project))$('real-source-details').textContent=`Source: ${project.source.name} · SHA-256 ${project.source.sha256}\nController: ${project.source.controllerFamily??'unverified'} · OS: ${project.source.operatingSystem??'unverified'}\n${project.source.identityEvidence??'No captured controller identity attached.'}\n${sourceCheck} Matching the source hash does not validate table extraction or controller definitions.`;
  renderLibrary();const diff=changes(project);
  $('summary').textContent=`${diff.length} changed values across ${new Set(diff.map(d=>d.path)).size} parameters · Originals preserved · ${isReal(project)?'Real-data draft; no native export':'Simulation only'}`;
  $('comparison').textContent=diff.length?diff.map(d=>{
    const p=project.parameters.find(p=>p.path===d.path);
    return `${d.path} · ${location(p,d.index)}: ${d.before} → ${d.after}${d.unit?` ${d.unit}`:''}${!d.definitionKnown?' [unknown definition; imported difference]':''}`;
  }).join('\n'):'No changes yet.';
  $('undo').disabled=!history.length;$('export').disabled=!diff.length;
  renderRealComparison();
}
const comparisonStatus={CHANGED:'Changed',UNCHANGED:'Unchanged',MISSING_REFERENCE:'Missing in reference',MISSING_CURRENT:'Missing in open draft',INCOMPATIBLE:'Not comparable'};
function renderComparisonDetails(){
  const item=comparisonResult?.parameters.find(p=>p.path===comparisonSelected);
  if(!item){$('real-compare-details').textContent='';return;}
  const p=project.parameters.find(p=>p.path===item.path);
  const rows=item.items.slice(0,200).map(c=>`${location(p,c.index)}: ${c.before} → ${c.after}${c.unit?' '+c.unit:''}${c.delta===null?'':` · change ${c.delta>0?'+':''}${Number(c.delta.toPrecision(10))}`}`);
  $('real-compare-details').textContent=`${item.label} · ${comparisonStatus[item.status]}\n${item.reason}\n${rows.join('\n')}${item.items.length>200?`\nShowing 200 of ${item.items.length} changes. The saved report includes all changes.`:''}`;
}
function renderRealComparison(){
  $('real-compare-workspace').hidden=!isReal(project);comparisonResult=null;
  const list=$('real-compare-list');list.replaceChildren();$('real-compare-save').disabled=true;
  $('real-compare-clear').disabled=!comparisonProject;
  if(!isReal(project)||!comparisonProject){$('real-compare-summary').textContent='Choose a real DD84 draft to use as the reference.';renderComparisonDetails();return;}
  comparisonResult=compareReal(comparisonProject,project);const s=comparisonResult.summary;
  $('real-compare-summary').textContent=`Reference: ${comparisonProject.source.name}\nOpen draft: ${project.source.name}\nOpen working values minus reference working values. File names do not establish chronology.\n${s.changedCells} changed values across ${s.changed} parameters; ${s.unchanged} unchanged parameters; ${s.missingReference} missing in reference; ${s.missingCurrent} missing in open draft; ${s.incompatible} not comparable.\n${comparisonResult.identityConflicts.join(' ')} Matching exported metadata does not validate controller compatibility.`;
  if(!comparisonResult.parameters.some(p=>p.path===comparisonSelected))comparisonSelected=comparisonResult.parameters[0]?.path??'';
  for(const p of comparisonResult.parameters){const option=element('option',`${p.label} · ${comparisonStatus[p.status]}${p.items.length?` (${p.items.length})`:''}`);option.value=p.path;list.append(option);}
  list.value=comparisonSelected;$('real-compare-save').disabled=false;renderComparisonDetails();
}
const discard=()=>!dirty||confirm('Discard unsaved project edits?');
$('new').onclick=()=>{if(discard()){request++;replace(sample());message('Six synthetic parameters opened. These do not represent a vehicle tune.');}};
$('open').onchange=async event=>{
  const file=event.target.files[0];event.target.value='';if(!file||!discard())return;const id=++request;
  try{if(file.size>OPEN_LIMIT)throw Error('Project exceeds 4 MB.');const p=parse(await file.text());if(id!==request)return;replace(p);message(`Opened ${file.name}. ${isReal(p)?'Real-data draft; source-file verification is available below.':'Legacy V1 projects upgrade to V2 when saved.'}`);}catch(e){if(id===request)message(e.message);}
};
$('parameter-search').oninput=()=>{if(project)renderLibrary();};
$('parameter-list').onchange=()=>{selected=$('parameter-list').value;renderParameter();};
$('name').oninput=()=>{request++;};
$('name').onchange=()=>{try{mutate(validate({...project,name:$('name').value}));}catch(e){message(e.message);$('name').value=project.name;}};
$('undo').onclick=()=>{if(history.length){request++;project=history.pop();dirty=true;$('real-compare-note').value='';render();message('Last project edit undone.');}};
$('reset').onclick=()=>{if(confirm('Restore all editable parameters from their originals?'))mutate(restore(project));};
$('reset-selected').onclick=()=>{if(confirm('Restore this parameter from its original?'))mutate(restore(project,selected));};
function download(value,suffix){
  return saveJson(value,`DD84-${suffix}.json`);
}
$('save').onclick=()=>download(validate(project),isReal(project)?'real-calibration-draft':'project');
$('backup').onclick=()=>download(backup(project),isReal(project)?'exported-original-values':'original');
$('export').onclick=async()=>{
  const id=++request;
  try{const result=await review(project,$('note').value);if(id!==request){message('Project changed while preparing the review. Export again after finishing edits.');return;}download(result,isReal(project)?'real-review-draft':'review-draft');}catch(e){if(id===request)message(e.message);}
};
$('note').addEventListener('input',()=>{request++;dirty=true;});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});

$('real-import').onchange=async event=>{
  const file=event.target.files[0];event.target.value='';if(!file)return;
  const add=$('real-import-mode').value==='ADD';
  if(add&&!isReal(project)){message('Open a real-data draft before adding tables.');return;}
  if(!add&&!discard())return;const id=++request,stage=$('real-import-stage').value;
  try{if(file.size>OPEN_LIMIT)throw Error('Export exceeds 4 MB.');const incoming=await importRealExport(await file.text(),file.name,stage);if(id!==request)return;
    if(add)mutate(mergeRealDrafts(project,incoming));else replace(incoming);
    message('Readable tables imported as local draft values. Source tune remains unchanged.');
  }catch(e){if(id===request)message(e.message);}
};
for(const key of ['real-import-stage','real-import-mode'])$(key).onchange=()=>{request++;};
$('real-identity-import').onchange=async event=>{
  const file=event.target.files[0];event.target.value='';if(!file)return;
  if(!isReal(project)){message('Open a real-data draft before attaching captured controller identity.');return;}
  const id=++request,stage=$('real-import-stage').value;
  try{
    if(file.size>OPEN_LIMIT)throw Error('Identity export exceeds 4 MB.');
    const next=await attachControllerIdentity(project,await file.text(),file.name,stage);if(id!==request)return;
    mutate(next);message('Captured controller identity attached to this source fingerprint. Native definitions remain unavailable.');
  }catch(e){if(id===request)message(e.message);}
};
$('real-source-file').onchange=async event=>{
  const file=event.target.files[0];event.target.value='';if(!file)return;
  if(!isReal(project)){message('Open a real-data draft before verifying its source. Native file decoding is not available.');return;}
  const id=++sourceRevision;sourceCheck='Checking source bytes…';render();
  try{const result=await verifyTuneSource(file,project.source);if(id!==sourceRevision)return;sourceCheck=result.matches?'Source bytes match the recorded fingerprint.':'SOURCE MISMATCH — this file does not match the draft.';render();message(sourceCheck);}catch(e){if(id===sourceRevision){sourceCheck='Source verification failed: '+e.message;render();message(sourceCheck);}}
};

$('real-compare-open').onchange=async event=>{
  const file=event.target.files[0];event.target.value='';if(!file||!isReal(project))return;const id=++request;
  try{
    if(file.size>OPEN_LIMIT)throw Error('Reference draft exceeds 4 MB.');
    const next=parse(await file.text());if(!isReal(next))throw Error('Choose a real exported-value DD84 draft, not a simulation project.');
    if(id!==request)return;comparisonProject=next;comparisonSelected='';$('real-compare-note').value='';renderRealComparison();message('Reference draft loaded for comparison. No values copied into your project.');
  }catch(e){if(id===request)message(e.message);}
};
$('real-compare-clear').onclick=()=>{request++;comparisonProject=null;comparisonSelected='';$('real-compare-note').value='';renderRealComparison();message('Reference comparison cleared.');};
$('real-compare-list').onchange=()=>{comparisonSelected=$('real-compare-list').value;renderComparisonDetails();};
$('real-compare-note').oninput=()=>{request++;dirty=true;};
$('real-compare-save').onclick=async()=>{
  const id=++request;
  try{const result=await reportRealComparison(comparisonProject,project,$('real-compare-note').value);if(id!==request){message('Comparison changed while preparing the report. Finish edits and export again.');return;}download(result,'tune-stage-comparison');}catch(e){if(id===request)message(e.message);}
};
