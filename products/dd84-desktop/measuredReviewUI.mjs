import {inspectMeasuredFile,summarizeMeasuredFile,byteFingerprint,MAX_MEASURED_CSV_BYTES} from './measuredCsv.mjs';
import {normalizeMeasuredReview} from './measuredReview.mjs';
import {recheckMeasuredSource,resumeMeasuredSource} from './measuredVerification.mjs';
import {updateMeasuredOutcome,assertMeasuredRebuildSources} from './measuredEditing.mjs';
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const shown=x=>x===null?'—':typeof x==='number'?Number(x.toPrecision(7)).toString():String(x);
const labels={changeReason:'Why was the tune changed?',changes:'Changes made to the calibration or hardware',conditions:'Fuel, hardware, sensor checks and test-condition differences',criterion:'What result would meet the goal?',observation:'What did you observe, and what supports it?',nextAction:'Next action and unresolved questions',reviewer:'Reviewed by'};
function table(headers,rows){const wrap=el('div');wrap.className='measured-table';wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label',headers.join(', '));const t=el('table'),head=el('thead'),tr=el('tr');headers.forEach(h=>{const th=el('th',h);th.scope='col';tr.append(th);});head.append(tr);const body=el('tbody');rows.forEach(row=>{const r=el('tr');row.forEach(v=>r.append(el('td',shown(v))));body.append(r);});t.append(head,body);wrap.append(t);return wrap;}
function sourceCheck(root,review,side,label){
  const box=el('div');box.className='measured-verification';
  const heading=el('h4','Recheck '+label.toLowerCase()+' source');
  const field=el('label','Select the original CSV to verify this saved summary'),input=el('input');
  input.type='file';input.accept='.csv';input.setAttribute('aria-label','Recheck '+label.toLowerCase()+' source CSV');field.append(input);
  const status=el('p','Not checked in this session. Saved measurements have not been verified against a selected source.');status.setAttribute('role','status');status.setAttribute('aria-label',label+' source verification');
  const mismatches=el('ul'),clear=el('button','Clear '+label.toLowerCase()+' source check');clear.type='button';clear.className='secondary';
  box.append(heading,el('p','This local check compares the CSV fingerprint and recomputes every channel statistic using the saved window and filters. It does not validate sensors, tune association or the reported outcome. The saved case stays unchanged.'),field,status,mismatches,clear);root.append(box);
  let request=0;
  const reset=()=>{request++;input.value='';mismatches.replaceChildren();status.textContent='Not checked in this session. Saved measurements have not been verified against a selected source.';};
  clear.onclick=reset;
  input.onchange=async()=>{
    const file=input.files?.[0];if(!file)return;const token=++request;mismatches.replaceChildren();status.textContent='Checking selected CSV locally…';
    try{
      if(file.size>MAX_MEASURED_CSV_BYTES)throw Error('CSV exceeds 32 MiB.');
      const result=await recheckMeasuredSource(review,side,new Uint8Array(await file.arrayBuffer()),file.name);
      if(token!==request||!box.isConnected)return;
      if(result.status==='SOURCE_AND_SUMMARY_MATCH')status.textContent='Source and saved statistics match in this session.'+(result.filenameChanged?' The selected filename differs; its bytes match.':'')+' Sensor accuracy, tune association and outcome are not verified.';
      else if(result.status==='FILE_MISMATCH')status.textContent='Different CSV selected. Its fingerprint does not match this saved source. Select the original export; no saved measurements were changed.';
      else{status.textContent=`CSV bytes match, but ${result.differences.length} saved summary item(s) differ. Rebuild from the source and review the differences before using this summary.`;for(const text of result.differences.slice(0,20))mismatches.append(el('li',text));if(result.differences.length>20)mismatches.append(el('li',`${result.differences.length-20} additional differences.`));}
    }catch(e){if(token===request&&box.isConnected)status.textContent='Source check did not complete: '+e.message+' No verification retained.';}
    finally{if(token===request)input.value='';}
  };
}
export function renderMeasuredReview(root,input){
  root.replaceChildren();if(!input)return;
  let r;try{r=normalizeMeasuredReview(input);}catch{root.append(el('p','This measurement summary is invalid. Reopen the source files to build a new review.'));return;}root.append(el('h3','Measured differences and recorded outcome'),el('p',`${r.comparisons.length} comparable channel labels · ${r.unmatched.length} unpaired entries · ${r.missing.length} remaining evidence items`),el('p','Reported outcome: '+r.outcome.result+' — operator statement, not a measured power or safety verdict.'));
  for(const [k,label]of Object.entries(labels))root.append(el('p',label+': '+(r.outcome[k]||'Not recorded')));
  for(const [label,s]of [['Earlier',r.before],['Later',r.after]]){
    const details=el('details');details.append(el('summary',label+' source, filters and complete channel inventory'));
    if(!s){details.append(el('p','No readable recording attached.'));root.append(details);continue;}
    details.append(el('p',`${s.source.name} · ${s.source.format} · ${s.source.encoding} · ${s.source.bytes} bytes`),el('p','CSV SHA-256: '+s.source.sha256),el('p',s.tune?`Tune: ${s.tune.name} · SHA-256: ${s.tune.sha256} · Association: ${s.tune.associationNote||'Not confirmed'}`:'Exact tune association not recorded.'),el('p',`${s.selection.start}–${s.selection.end} seconds · ${s.windowRows} window rows · ${s.rows} included · ${s.invalidFilterRows} missing/nonnumeric filter rows · ${s.outsideFilterRows} outside filters · ${s.duplicateTimes} repeated included timestamps`));
    details.append(el('p',s.selection.filters.length?s.selection.filters.map(f=>`${f.name} [${f.unit||'unit unspecified'}]: ${f.min}–${f.max}`).join('; '):'No channel filters. Whole-window summaries may reflect different operating conditions.'));
    sourceCheck(details,r,label==='Earlier'?'before':'after',label);
    details.append(table(['Channel','Unit','Numeric','Missing','Text','Min','Max','Mean','Median','P95'],s.channels.map(c=>[c.name||`Unnamed column ${c.id}`,c.unit||'Unspecified',c.numeric,c.missing,c.text,c.min,c.max,c.mean,c.median,c.p95])));root.append(details);
  }
  root.append(el('p','Later minus earlier statistics. No interpolation, time weighting, unit conversion, correction factors or automatic approval.'));
  root.append(table(['Channel','Unit','Earlier mean','Later mean','Δ mean','Δ median','Δ min','Δ max','Δ P95','Flags'],r.comparisons.map(c=>[c.name,c.unit,r.before.channels.find(a=>a.id===c.beforeId).mean,r.after.channels.find(a=>a.id===c.afterId).mean,c.delta.mean,c.delta.median,c.delta.min,c.delta.max,c.delta.p95,c.flags.join(', ')])));
  const missing=el('ul');r.missing.forEach(m=>missing.append(el('li',m)));root.append(el('h4','Evidence still needed'),missing);
  const extra=el('details');extra.append(el('summary','Unpaired channels and limitations'));const list=el('ul');r.unmatched.forEach(c=>list.append(el('li',`${c.side}: ${c.name||'Unnamed column '+c.id} [${c.unit||'unspecified'}] — ${c.reason}`)));r.limitations.forEach(x=>list.append(el('li',x)));extra.append(list);root.append(extra);
}
export function mountMeasuredReview(root,{onAttach,onDirty}){
  let attached=null,draft=false,measurementDraft=false,disposed=false,revision=0,working=false,reading=0;
  const sides={},inputs={};root.classList.add('measured-review');
  const heading=el('h2','Measured differences and outcome');root.append(heading,el('p','Compare readable HP Tuners or Holley CSV exports locally. Keep originals. Native HPT/Holley tunes can be fingerprinted here, but are not decoded or changed.'));
  const status=el('p');status.setAttribute('role','status');const display=el('div');
  const mark=(measurement=false)=>{draft=true;measurementDraft ||= measurement;revision++;onDirty();status.textContent=measurementDraft?'Pending recording changes: build and attach the measured review before saving the case, or discard these pending changes.':'Pending notes: choose Update outcome notes to keep the attached measurements, or build a review from selected CSVs.';};
  const markMeasurement=()=>mark(true),markOutcome=()=>mark();
  const input=(parent,label,type='text')=>{const l=el('label',label),i=el(type==='textarea'?'textarea':'input');if(type!=='textarea')i.type=type;i.setAttribute('aria-label',label);l.append(i);parent.append(l);return i;};
  const grid=el('div');grid.className='trouble-fields';root.append(grid);
  for(const [key,title]of [['before','Earlier'],['after','Later']]){
    const box=el('fieldset');box.append(el('legend',title+' recording'));grid.append(box);
    const resumeBox=el('div');resumeBox.hidden=true;box.append(resumeBox);
    resumeBox.append(el('p','Resume from the original CSV to restore the saved time window, filters and tune association. The CSV and all saved statistics must match. The stored tune association remains your statement; native tune bytes are not checked.'));
    const resume=input(resumeBox,'Resume saved '+title.toLowerCase()+' CSV','file');resume.accept='.csv';
    const csv=input(box,title+' CSV','file');csv.accept='.csv';const tune=input(box,title+' tune (optional fingerprint)','file');tune.accept='.hpt,.hefi,.terx,.sniper,.sniper2,.gcf,.bin';
    const note=input(box,title+' tune-to-log association','textarea');note.maxLength=2000;const info=el('p');box.append(info);
    const start=input(box,title+' start seconds','number'),end=input(box,title+' end seconds','number');start.step=end.step='any';
    const filters=[],extraFilters=el('details');extraFilters.append(el('summary',title+' additional filters (3–4)'));
    for(let n=0;n<4;n++){const parent=n<2?box:extraFilters,l=el('label',`${title} filter ${n+1}`),select=el('select');select.setAttribute('aria-label',`${title} filter ${n+1}`);l.append(select);parent.append(l);const min=input(parent,`${title} filter ${n+1} minimum`,'number'),max=input(parent,`${title} filter ${n+1} maximum`,'number');min.step=max.step='any';filters.push({select,min,max});select.onchange=markMeasurement;min.oninput=max.oninput=markMeasurement;}box.append(extraFilters);
    const clear=el('button','Clear '+title.toLowerCase()+' recording');clear.type='button';box.append(clear);
    const s={loaded:null,tune:null,cleared:false,resume,resumeBox,csv,tuneInput:tune,note,info,start,end,filters,request:0,tuneRequest:0};sides[key]=s;
    const resetFilters=()=>{extraFilters.open=false;for(const f of filters){f.select.replaceChildren();const none=el('option','No filter');none.value='';f.select.append(none);s.loaded?.inspection.channels.forEach(c=>{const o=el('option',`${c.name||'Unnamed column '+c.id} [${c.unit||'unspecified'}]`);o.value=c.id;f.select.append(o);});f.min.value=f.max.value='';}};s.resetFilters=resetFilters;resetFilters();
    for(const i of [note,start,end])i.oninput=markMeasurement;
    resume.onchange=async()=>{
      const file=resume.files?.[0];if(!file||!attached?.[key])return;markMeasurement();
      const token=++s.request,version=revision,snapshot=attached;reading++;status.textContent='Checking saved '+title.toLowerCase()+' CSV before resuming…';
      try{
        if(file.size>MAX_MEASURED_CSV_BYTES)throw Error('CSV exceeds 32 MiB.');
        const resumed=await resumeMeasuredSource(snapshot,key,new Uint8Array(await file.arrayBuffer()),file.name);
        if(disposed||token!==s.request)return;
        if(version!==revision)throw Error('Inputs changed while checking the CSV. Select the saved source again to resume.');
        s.loaded=resumed.loaded;s.tune=resumed.tune;s.cleared=false;s.tuneRequest++;tune.value='';note.value=s.tune?.associationNote??'';
        start.value=String(resumed.selection.start);end.value=String(resumed.selection.end);resetFilters();
        resumed.selection.filters.forEach((f,n)=>{filters[n].select.value=f.id;filters[n].min.value=String(f.min);filters[n].max.value=String(f.max);});extraFilters.open=resumed.selection.filters.length>2;
        info.textContent=title+' saved selection restored: '+s.loaded.source.name+'.'+(resumed.filenameChanged?' Selected filename differs; identical bytes match and the saved source name is retained.':'')+(s.tune?' Saved tune association retained; native tune file not rechecked.':' No tune association recorded.');
        revision++;status.textContent=title+' recording resumed. Saved time window, filters and tune association restored. Review any edits, then build and attach the review before saving.';
      }catch(e){if(!disposed&&token===s.request)status.textContent='Could not resume: '+e.message+' Existing editing inputs and attached measurements are unchanged.';}
      finally{reading--;if(token===s.request)resume.value='';}
    };
    csv.onchange=async()=>{const file=csv.files?.[0];if(!file)return;markMeasurement();const token=++s.request;reading++;
      try{if(file.size>MAX_MEASURED_CSV_BYTES)throw Error('CSV exceeds 32 MiB.');status.textContent='Reading '+file.name+'…';const loaded=await inspectMeasuredFile(new Uint8Array(await file.arrayBuffer()),file.name);if(disposed||token!==s.request)return;s.loaded=loaded;s.tune=null;tune.value='';s.tuneRequest++;note.value='';start.value=String(loaded.inspection.start);end.value=String(loaded.inspection.end);resetFilters();info.textContent=`${file.name}: ${loaded.inspection.rowCount} rows, ${loaded.inspection.channels.length} channels, ${loaded.source.encoding}. Tune association must be confirmed for this recording.`;revision++;status.textContent='Recording loaded locally. Review its time window and optional filters, then build the measured review.';}
      catch(e){if(!disposed&&token===s.request)status.textContent=e.message+' Previous loaded recording, if any, is retained.';}
      finally{reading--;if(token===s.request)csv.value='';}
    };
    tune.onchange=async()=>{const file=tune.files?.[0];if(!file)return;markMeasurement();const token=++s.tuneRequest;reading++;
      try{if(file.size<1||file.size>256*1024*1024||!/\.(hpt|hefi|terx|sniper2?|gcf|bin)$/i.test(file.name))throw Error('Choose a supported tune filename no larger than 256 MiB.');const bytes=new Uint8Array(await file.arrayBuffer()),sha256=await byteFingerprint(bytes);if(disposed||token!==s.tuneRequest)return;s.tune={name:file.name,bytes:bytes.length,sha256};note.value='';revision++;status.textContent=title+' tune fingerprinted: '+file.name+'. Explain why it matches the recording.';}
      catch(e){if(!disposed&&token===s.tuneRequest)status.textContent=e.message;}finally{reading--;if(token===s.tuneRequest)tune.value='';}
    };
    clear.onclick=()=>{markMeasurement();s.request++;s.tuneRequest++;s.loaded=null;s.tune=null;s.cleared=true;csv.value=tune.value=note.value=start.value=end.value='';info.textContent=attached?.[key]?'This saved recording will be removed when you build and attach the review. Discard pending changes to keep it.':'';resetFilters();};
  }
  const resultLabel=el('label','Reported outcome'),result=el('select');result.setAttribute('aria-label','Reported outcome');for(const value of ['unassessed','improved','unchanged','worse','inconclusive']){const o=el('option',value);o.value=value;result.append(o);}resultLabel.append(result);root.append(resultLabel);result.onchange=markOutcome;
  for(const [key,label]of Object.entries(labels)){inputs[key]=input(root,label,key==='reviewer'?'text':'textarea');inputs[key].maxLength=2000;inputs[key].oninput=markOutcome;}
  const outcome=()=>({result:result.value,...Object.fromEntries(Object.entries(inputs).map(([k,i])=>[k,i.value]))});
  const updateNotes=el('button','Update outcome notes');updateNotes.type='button';updateNotes.disabled=true;
  root.append(el('p','Already have a measured review? Update outcome notes keeps its measurements unchanged. To continue editing measurements, use Resume saved CSV on each saved recording. Regular CSV selection starts a replacement with the full time window, no filters and no tune association. Build and attach the review after editing.'));
  const actions=el('div');actions.className='row';const build=el('button','Build and attach measured review'),discard=el('button','Discard pending measured changes'),remove=el('button','Remove attached measured review');for(const b of [build,discard,remove])b.type='button';discard.className=remove.className='secondary';actions.append(updateNotes,build,discard,remove);root.append(actions,status,display);
  const reset=report=>{revision++;attached=report?normalizeMeasuredReview(report):null;draft=false;measurementDraft=false;updateNotes.disabled=!attached;for(const [key,s]of Object.entries(sides)){s.request++;s.tuneRequest++;s.loaded=null;s.tune=null;s.cleared=false;s.resume.value=s.csv.value=s.tuneInput.value=s.note.value=s.start.value=s.end.value='';s.resumeBox.hidden=!attached?.[key];s.info.textContent=attached?.[key]?'Saved summary retained: '+attached[key].source.name+'. Source CSV not loaded for editing.':'';s.resetFilters();}result.value=attached?.outcome.result??'unassessed';for(const k of Object.keys(labels))inputs[k].value=attached?.outcome[k]??'';renderMeasuredReview(display,attached);status.textContent=attached?'Saved measurement summary restored. Update outcome notes without CSVs, or use Resume saved CSV to restore each recording for editing.':'';};
  updateNotes.onclick=()=>{
    if(!attached||disposed)return;
    if(measurementDraft||reading||working){status.textContent='Recording changes are pending. Build and attach them, or discard pending measured changes before updating only the outcome notes.';return;}
    try{const report=updateMeasuredOutcome(attached,outcome());onAttach(report);attached=report;draft=false;revision++;onDirty();renderMeasuredReview(display,report);status.textContent='Outcome notes updated locally; saved measurements and tune associations are unchanged. Save the troubleshooting case to keep this revision. Source checks must be rerun for the displayed review.';}
    catch(e){status.textContent=e.message;}
  };
  discard.onclick=()=>reset(attached);
  remove.onclick=()=>{reset(null);onAttach(null);onDirty();status.textContent='Measured review removed from this local case. Saved job snapshots remain unchanged.';};
  build.onclick=async()=>{
    if(reading){status.textContent='Wait for selected files to finish loading, then build again.';return;}
    if(working)return;working=true;build.disabled=true;const token=revision;status.textContent='Calculating independent channel summaries…';
    try{await new Promise(resolve=>setTimeout(resolve,0));if(disposed||token!==revision)throw Error('Inputs changed. Build the review again.');
      assertMeasuredRebuildSources(attached,sides);
      const reports={};for(const [key,s]of Object.entries(sides)){
        if(!s.loaded){reports[key]=null;continue;}
        const filters=s.filters.filter(f=>f.select.value!=='').map(f=>{if(!f.min.value.trim()||!f.max.value.trim())throw Error('Enter both bounds for each selected filter.');return {channelId:f.select.value,min:Number(f.min.value),max:Number(f.max.value)};});
        if(!s.start.value.trim()||!s.end.value.trim())throw Error('Enter both time-window bounds.');
        reports[key]={...summarizeMeasuredFile(s.loaded,{start:Number(s.start.value),end:Number(s.end.value),filters}),tune:s.tune?{...s.tune,associationNote:s.note.value}:null};
      }
      const report=normalizeMeasuredReview({format:'DD84_MEASURED_REVIEW_V1',learningReady:false,automaticApplication:false,writeStrategy:'SIMULATION_ONLY',...reports,outcome:outcome()});
      onAttach(report);attached=report;draft=false;measurementDraft=false;updateNotes.disabled=false;for(const [key,s]of Object.entries(sides)){s.cleared=false;s.resumeBox.hidden=!report[key];}renderMeasuredReview(display,report);status.textContent='Measured review attached locally. Save the troubleshooting case to keep it or share it with the matching job.';
    }catch(e){if(!disposed)status.textContent=e.message;}finally{working=false;if(!disposed)build.disabled=false;}
  };
  return {set:reset,hasDraft:()=>draft||working||reading>0,dispose:()=>{disposed=true;revision++;for(const s of Object.values(sides)){s.request++;s.tuneRequest++;}root.replaceChildren();}};
}
