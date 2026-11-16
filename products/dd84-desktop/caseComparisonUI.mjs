import {parseCase,caseReport,MAX_CASE_BYTES} from './troubleshooting.mjs';
import {prepareCaseComparison,comparisonGroups} from './caseComparison.mjs';
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const text=value=>!value.present?'Not present':value.value===null?'Unavailable':value.value===''?'Empty':String(value.value);
export function mountCaseComparison(root,getCurrent,{getRevision=()=>0,save}={}){
  let disposed=false,request=0,reference=null,model=null,page=0;
  root.classList.add('case-comparison');
  const details=el('details'),summary=el('summary','Compare saved case revisions');details.append(summary);
  const intro=el('p','Choose a reference JSON or use a saved job snapshot as the reference. Compare it with the current case without replacing either. Reference/current describe your selection, not vehicle test order.');
  const input=el('input');input.type='file';input.accept='.json,application/json';input.setAttribute('aria-label','Reference troubleshooting case JSON');
  const referenceLabel=el('p','No comparison reference selected.'),status=el('p');status.setAttribute('role','status');
  const compare=el('button','Compare with current case');compare.type='button';compare.disabled=true;
  const clear=el('button','Clear comparison');clear.type='button';clear.className='secondary';
  const result=el('section');result.setAttribute('aria-label','Case revision comparison');result.hidden=true;
  const headline=el('h3'),identities=el('div'),notice=el('p'),sourceNotice=el('p'),controls=el('div'),list=el('div'),paging=el('p'),prev=el('button','Previous changes'),next=el('button','Next changes'),download=el('button','Save case comparison');
  for(const b of [prev,next,download])b.type='button';
  const search=el('input');search.type='search';search.setAttribute('aria-label','Search case changes');search.placeholder='Search changes';
  const group=el('select');group.setAttribute('aria-label','Case change category');
  for(const name of ['All categories',...comparisonGroups]){const option=el('option',name);option.value=name==='All categories'?'':name;group.append(option);}
  const fingerprints=el('details');fingerprints.append(el('summary','Comparison fingerprints and limits'));const fingerprintText=el('div');fingerprints.append(fingerprintText);
  controls.append(search,group);result.append(headline,identities,notice,sourceNotice,controls,list,paging,prev,next,download,fingerprints);
  details.append(intro,input,referenceLabel,compare,clear,status,result);root.append(details);
  function hide(message=''){model=null;result.hidden=true;status.textContent=message;}
  function invalidate(){request++;hide(reference?'The current case changed. Compare again to refresh the result.':'');}
  function renderRows(){
    const query=search.value.toLowerCase(),rows=model.changes.filter(c=>(!group.value||c.group===group.value)&&[c.label,text(c.reference),text(c.current),c.kind].some(v=>v.toLowerCase().includes(query)));
    page=Math.max(0,Math.min(page,Math.ceil(rows.length/50)-1));const shown=rows.slice(page*50,(page+1)*50);
    const table=el('table'),head=el('thead'),tr=el('tr'),body=el('tbody');
    for(const title of ['Changed item','Reference','Current']){const th=el('th',title);th.scope='col';tr.append(th);}head.append(tr);
    for(const c of shown){const row=el('tr'),name=el('th',`${c.group} · ${c.label} (${c.kind})`);name.scope='row';row.append(name,el('td',text(c.reference)),el('td',text(c.current)));body.append(row);}table.append(head,body);list.replaceChildren(table);
    paging.textContent=rows.length?`Showing ${page*50+1}–${page*50+shown.length} of ${rows.length} matching changes. ${model.changes.length} total changes are included when saved.`:`No matching changes. ${model.changes.length} total changes are included when saved.`;
    prev.disabled=page===0;next.disabled=(page+1)*50>=rows.length;
  }
  async function run(){
    if(!reference)return;const token=++request,version=getRevision();hide('Comparing selected case contents…');
    try{const prepared=await prepareCaseComparison(reference.report,getCurrent());if(disposed||token!==request)return;if(version!==getRevision())throw Error('The current case changed while comparing. Compare again.');
      model=prepared;page=0;search.value='';group.value='';details.open=true;result.hidden=false;
      headline.textContent=`${model.changes.length} changed items between selected revisions`;
      identities.replaceChildren(...[['Reference',model.reference],['Current',model.current]].map(([label,r])=>el('p',`${label}: ${r.context.caseName||'Untitled case'} · ${r.context.vehicle||'Vehicle not recorded'} · ${r.context.controller||'Controller not recorded'}`)));
      notice.textContent='Changes describe saved contents. They do not establish improvement or verify sensor readings. Neither case is modified.';
      sourceNotice.textContent=model.sourceChanges.length?'CSV source changed or was added/removed: '+model.sourceChanges.map(s=>s==='before'?'Earlier recording':'Later recording').join(', ')+'. Channel and filter values from different sources are not paired.':'No CSV source changes detected. Any stored summaries still require original-file rechecks.';
      fingerprintText.replaceChildren(el('p','Reference SHA-256: '+model.referenceSha256),el('p','Current SHA-256: '+model.currentSha256),el('p',model.fingerprintBasis),...model.limitations.map(v=>el('p',v)));
      status.textContent='Comparison ready. The saved report includes all changes and both complete case snapshots.';renderRows();
    }catch(error){if(!disposed&&token===request)hide('Could not compare cases: '+error.message);}
  }
  async function setReference(value,label='Saved case'){
    request++;hide();
    try{reference={report:caseReport(value),label};referenceLabel.textContent='Reference: '+label;compare.disabled=false;details.open=true;await run();}
    catch(error){reference=null;compare.disabled=true;referenceLabel.textContent='No comparison reference selected.';status.textContent='Could not use reference: '+error.message;}
  }
  input.onchange=async()=>{const file=input.files?.[0];if(!file)return;const token=++request;hide('Reading reference JSON…');
    try{if(file.size>MAX_CASE_BYTES)throw Error('Choose a saved DD84 case smaller than 1 MiB.');const value=parseCase(await file.text());if(disposed||token!==request)return;await setReference(value,file.name);}
    catch(error){if(!disposed&&token===request)status.textContent='Could not read reference: '+error.message;}
    finally{if(!disposed)input.value='';}
  };
  compare.onclick=()=>void run();clear.onclick=()=>{request++;reference=null;compare.disabled=true;referenceLabel.textContent='No comparison reference selected.';input.value='';hide('Comparison cleared. Both original cases are unchanged.');};
  for(const control of [search,group])control.oninput=()=>{page=0;if(model)renderRows();};
  prev.onclick=()=>{page--;renderRows();};next.onclick=()=>{page++;renderRows();};
  download.onclick=async()=>{
    if(!model)return;const snapshot=model,token=request;download.disabled=true;
    try{let saved;if(save)saved=await save(snapshot,'DD84-case-comparison.json');else{const url=URL.createObjectURL(new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download='DD84-case-comparison.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);saved={status:'unconfirmed'};}
      if(!disposed&&token===request)status.textContent=saved?.status==='saved'?'Comparison saved. Keep the editable case JSON files separately.':saved?.status==='canceled'?'Comparison save canceled.':saved?.status==='unconfirmed'?'Download requested. Check Downloads; this browser cannot confirm completion. The comparison is read-only and cannot replace an editable case.':'Comparison was not saved. Keep it open and retry.';
    }catch(error){if(!disposed&&token===request)status.textContent='Comparison save failed: '+error.message;}
    finally{if(!disposed)download.disabled=false;}
  };
  return Object.assign(()=>{disposed=true;request++;root.replaceChildren();},{invalidate,setReference});
}
