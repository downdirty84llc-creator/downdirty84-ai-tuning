import {blankCase,validateCase,parseCase,caseReport,assessCase,issues,commonChecks,fields,sources,catalogVersion} from './troubleshooting.mjs';

export function mountTroubleshooting(root, {save, externalLinks=false}={}) {
  let state=blankCase(), dirty=false, revision=0, pending=null, saving=false, disposed=false, openRequest=0;
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const button=(text,action)=>{const n=el('button',text);n.type='button';n.onclick=action;return n;};
  root.classList.add('troubleshooting');
  const intro=el('section',undefined,'card');
  intro.append(el('p','DD84 / TROUBLESHOOTING','eyebrow'),el('h1','Find the next useful check.'),el('p','Describe the symptom, collect the missing evidence and prepare a clear handoff for your tuner. This workspace does not analyze logs or prescribe tune values.'));
  const tools=el('div',undefined,'row');
  const saveButton=button('Save troubleshooting case',async()=>{
    if(saving)return;
    saving=true; saveButton.disabled=true; const snapshot=revision;
    try{const result=await save(caseReport(state),'DD84-troubleshooting-case.json');
      if(disposed)return;
      if(result?.status==='saved'&&snapshot===revision)dirty=false;
      status.textContent=result?.status==='saved'?'Case saved. Your original tune and log need separate backups.':result?.status==='unconfirmed'?'Download requested. Verify the JSON file in Downloads; this browser cannot confirm completion.':result?.status==='canceled'?'Save canceled. Your case is still open.':'Save did not complete. Keep this case open and retry.';
    }catch(e){if(!disposed)status.textContent=`Save failed: ${e.message}`;}
    finally{saving=false;if(!disposed)saveButton.disabled=false;}
  });
  const open=el('input');open.type='file';open.accept='.json';open.id='trouble-open';
  const openLabel=el('label','Open saved troubleshooting case');openLabel.htmlFor=open.id;openLabel.append(open);
  const status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const replace=next=>{state=validateCase(next);dirty=false;revision++;pending=null;confirm.hidden=true;renderInputs();status.textContent='Case opened. Checklist findings are operator statements; the assessment was recalculated.';};
  const confirm=el('div',undefined,'trouble-confirm');confirm.hidden=true;
  confirm.append(el('p','Replace the current unsaved case? Save it first if you want to keep it.'),button('Keep current case',()=>{pending=null;confirm.hidden=true;open.value='';}),button('Replace current case',()=>{if(pending)replace(pending);}));
  const stage=next=>{if(dirty){pending=next;confirm.hidden=false;}else replace(next);};
  const newButton=button('New case',()=>stage(blankCase()));newButton.className='secondary';
  open.onchange=async()=>{const file=open.files?.[0];if(!file)return;const token=revision,request=++openRequest;
    try{if(file.size>128*1024)throw Error('Choose a case smaller than 128 KiB.');const next=parseCase(await file.text());if(disposed||request!==openRequest)return;if(token!==revision)throw Error('The case changed while loading. Choose the file again.');stage(next);}
    catch(e){if(!disposed&&request===openRequest)status.textContent=`Could not open case: ${e.message}`;}finally{if(request===openRequest)open.value='';}
  };
  tools.append(saveButton,newButton);intro.append(tools,openLabel,status,confirm);
  const symptomSection=el('section',undefined,'card');
  const issueLabel=el('label','What needs attention?');const select=el('select');select.id='trouble-issue';issueLabel.htmlFor=select.id;
  for(const issue of issues){const option=el('option',issue.title);option.value=issue.id;select.append(option);}
  issueLabel.append(select);const summary=el('p');symptomSection.append(issueLabel,summary);
  const contextSection=el('section',undefined,'card');contextSection.append(el('h2','1. Describe the vehicle and event'),el('p','Use a job reference instead of customer contact details. Leave uncertain facts blank. Files are not uploaded by this workspace.'));
  const contextGrid=el('div',undefined,'trouble-fields'),inputs={};
  for(const [id,label,limit] of fields){const wrapper=el('label',label),input=el(limit>300?'textarea':'input');input.id=`trouble-${id}`;wrapper.htmlFor=input.id;input.maxLength=limit;if(limit>300)input.rows=3;inputs[id]=input;input.oninput=()=>{state.context[id]=input.value;changed();};wrapper.append(input);contextGrid.append(wrapper);}
  const relationshipLabel=el('label','Did this exact tune run during this log?'),relationship=el('select');relationship.id='trouble-relationship';relationshipLabel.htmlFor=relationship.id;
  for(const [value,text]of [['unknown','Not confirmed'],['confirmed','Confirmed by the operator'],['mismatch','No — the tune and log differ']]){const option=el('option',text);option.value=value;relationship.append(option);}
  relationship.onchange=()=>{state.relationship=relationship.value;changed();};relationshipLabel.append(relationship);contextSection.append(contextGrid,relationshipLabel);
  const checksSection=el('section',undefined,'card');checksSection.append(el('h2','2. Record the checks'),el('p','Choose a status and record the evidence or why a check does not apply. Nothing is marked checked automatically. Changing the symptom keeps your notes.'));
  const checksRoot=el('div');checksSection.append(checksRoot);
  const result=el('section',undefined,'card trouble-result');result.setAttribute('aria-labelledby','trouble-result-title');result.append(el('h2','3. Prepare the handoff'));result.firstChild.id='trouble-result-title';
  const resultStatus=el('p',undefined,'trouble-status');resultStatus.setAttribute('role','status');
  const concerns=el('ul'),missing=el('ul'),next=el('p'),channelList=el('ul'),sourceList=el('ul',undefined,'trouble-sources');
  const sourcesDetails=el('details');sourcesDetails.append(el('summary',`Sources and limitations · catalog ${catalogVersion}`),el('p','Community reports informed the problem categories. Manufacturer guidance supports the checks. No forum tune maps, proprietary definitions or customer logs are bundled. Coverage is a researched sample, not every forum or controller. Manufacturer-specific examples do not establish DD84 compatibility.'),sourceList);
  const missingTitle=el('h3','Information still needed'),concernsTitle=el('h3','Concerns to resolve');
  result.append(resultStatus,concernsTitle,concerns,missingTitle,missing,el('h3','Suggested evidence to request'),el('p','Use supported channels from the installed controller; names and availability vary. Preserve the full original recording.'),channelList,el('h3','Next step'),next,el('p','Human review is always required. This worksheet does not diagnose a fault, approve calibration changes or establish that a vehicle is safe to operate. No numeric tune targets are generated.'),sourcesDetails);
  root.append(intro,symptomSection,contextSection,checksSection,result);
  function changed(){dirty=true;revision++;renderAssessment();}
  function fillList(node,items){node.replaceChildren(...items.map(text=>el('li',text)));}
  function renderAssessment(){const a=assessCase(state);resultStatus.textContent=a.status==='CONCERNS_RECORDED'?'Concerns recorded — resolve these with the tuner':a.status==='NEEDS_INFORMATION'?'More evidence needed':'Prepared for human review — not approval to tune';fillList(concerns,a.concerns);concernsTitle.hidden=!a.concerns.length;fillList(missing,a.missing);missingTitle.hidden=!a.missing.length;fillList(channelList,a.channels);next.textContent=a.next;}
  function renderChecks(){checksRoot.replaceChildren();const issue=issues.find(i=>i.id===state.issueId);summary.textContent=issue.summary;
    for(const c of [...commonChecks,...issue.checks]){const wrapper=el('fieldset'),legend=el('legend',c.label),detail=el('p',c.detail),statusLabel=el('label','Check status'),control=el('select'),noteLabel=el('label','Evidence, result or explanation'),note=el('textarea');
      control.id=`trouble-check-${c.id}`;statusLabel.htmlFor=control.id;note.id=`trouble-note-${c.id}`;noteLabel.htmlFor=note.id;note.rows=2;note.maxLength=1000;
      for(const [value,text]of [['unknown','Not checked'],['checked','Checked — evidence recorded'],['issue','Concern found'],['na','Not applicable — explain']]){const option=el('option',text);option.value=value;control.append(option);}
      control.value=state.checks[c.id]?.status??'unknown';note.value=state.checks[c.id]?.note??'';
      const update=()=>{state.checks[c.id]={status:control.value,note:note.value};changed();};control.onchange=update;note.oninput=update;statusLabel.append(control);noteLabel.append(note);wrapper.append(legend,detail,statusLabel,noteLabel);checksRoot.append(wrapper);
    }
    sourceList.replaceChildren(...issue.sourceIds.map(id=>{const source=sources[id],item=el('li');item.append(el('strong',source.title),el('span',source.kind));if(externalLinks){const link=el('a','Read source');link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';item.append(link);}else item.append(el('span',source.url));return item;}));renderAssessment();
  }
  function renderInputs(){select.value=state.issueId;for(const[id]of fields)inputs[id].value=state.context[id];relationship.value=state.relationship;renderChecks();}
  select.onchange=()=>{state.issueId=select.value;changed();renderChecks();};
  const unload=e=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',unload);
  renderInputs();
  return ()=>{disposed=true;window.removeEventListener('beforeunload',unload);root.replaceChildren();};
}
