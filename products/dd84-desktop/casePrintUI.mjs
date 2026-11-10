import {prepareCasePrint} from './casePrint.mjs';
import {fields} from './troubleshooting.mjs';
import {measuredChannelEntries,channelStatistics} from './measuredChannels.mjs';

const logo=new URL('./assets/dd84-logo.png',import.meta.url).href;
const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
const statusLabels={unknown:'Not checked',checked:'Checked — evidence recorded',issue:'Concern found',na:'Not applicable — explanation recorded'};
const number=v=>v===null||v===undefined?'Unavailable':String(v);
function paragraphs(root,items){for(const [title,value]of items){const p=el('p');p.append(el('strong',title+': '),el('span',value||'Not recorded'));root.append(p);}}
function list(root,title,items){root.append(el('h3',title));const ul=el('ul');for(const text of items)ul.append(el('li',text));root.append(items.length?ul:el('p','None recorded.'));}
function statsTable(root,before,after,delta){
  const table=el('table'),head=el('thead'),row=el('tr'),body=el('tbody');
  for(const title of ['Statistic','Earlier','Later','Later − earlier']){const th=el('th',title);th.scope='col';row.append(th);}head.append(row);
  for(const [key,title]of Object.entries(channelStatistics)){const tr=el('tr'),th=el('th',title);th.scope='row';tr.append(th);for(const v of [before?number(before[key]):'Not recorded',after?number(after[key]):'Not recorded',delta?number(delta[key]):'Not paired'])tr.append(el('td',v));body.append(tr);}
  table.append(head,body);root.append(table);
}
function checks(root,title,records){
  if(!records.length)return;root.append(el('h2',title));
  for(const check of records){const section=el('section');section.className='case-print-check';section.append(el('h3',check.label),el('p',statusLabels[check.status]),el('p',check.note||'No evidence or explanation recorded.'));root.append(section);}
}
function renderReport(root,model,includeTables){
  const {report:r,sha256}=model;root.replaceChildren();
  const header=el('header'),img=el('img');img.src=logo;img.alt='DD84 — Down Dirty 84 LLC';img.width=120;
  header.append(img,el('p','DOWN DIRTY 84 LLC / CALIBRATION STUDIO'),el('h1','Troubleshooting handoff'),el('p',r.context.caseName||'Case reference not recorded'));root.append(header);
  root.append(el('p','Snapshot for human review. Printing does not save the editable case, attach it to a job, or send it to anyone. Keep the JSON and original tune/log files separately.'));
  paragraphs(root,[['Issue',model.issue],['Assessment',r.assessment.status==='CONCERNS_RECORDED'?'Concerns recorded':r.assessment.status==='NEEDS_INFORMATION'?'More evidence needed':'Prepared for human review — not calibration approval']]);
  root.append(el('p',r.assessment.notice));
  root.append(el('h2','Vehicle and event'));paragraphs(root,fields.map(([id,label])=>[label,r.context[id]]));
  paragraphs(root,[['Tune / log relationship',r.relationship==='confirmed'?'Confirmed by the operator':r.relationship==='mismatch'?'The tune and log differ':'Not confirmed']]);
  list(root,'Concerns to resolve',r.assessment.concerns);list(root,'Information still needed',r.assessment.missing);
  paragraphs(root,[['Next step',r.assessment.next]]);list(root,'Suggested evidence to request',r.assessment.channels);
  checks(root,'Recorded checks — selected issue',model.checks);
  checks(root,'Retained checks from other issues — not used in this assessment',model.otherChecks);
  const m=r.measuredReview;
  if(!m){root.append(el('h2','Measured review'),el('p','No measured review attached.'));}
  else{
    root.append(el('h2','Measured differences and recorded outcome'),el('p',`${m.comparisons.length} comparable channel labels; ${m.unmatched.length} unpaired entries. Differences are later minus earlier independent window statistics, not measured performance gains.`));
    paragraphs(root,[['Reported outcome',m.outcome.result+' — operator statement'],['Why the tune changed',m.outcome.changeReason],['Changes made',m.outcome.changes],['Conditions and sensor checks',m.outcome.conditions],['Success criterion',m.outcome.criterion],['Observed result and evidence',m.outcome.observation],['Next action',m.outcome.nextAction],['Reviewed by',m.outcome.reviewer]]);
    root.append(el('p','Source summaries are not independently authenticated by this report. Session-only CSV checks are not printed as verification claims. Tune associations and outcomes remain operator statements.'));
    for(const [title,s]of [['Earlier',m.before],['Later',m.after]]){
      root.append(el('h3',title+' recording'));
      if(!s){root.append(el('p','No readable recording attached.'));continue;}
      paragraphs(root,[['CSV',s.source.name],['Format / encoding / size',`${s.source.format} / ${s.source.encoding} / ${s.source.bytes} bytes`],['CSV SHA-256',s.source.sha256],['Window',`${s.selection.start}–${s.selection.end} seconds`],['Rows',`${s.windowRows} in window; ${s.rows} included; ${s.invalidFilterRows} excluded for missing/nonnumeric filter values; ${s.outsideFilterRows} outside filters; ${s.duplicateTimes} repeated included timestamps`],['Filters',s.selection.filters.map(f=>`${f.name||'Unnamed channel'} (ID ${f.id}) [${f.unit||'unspecified'}]: ${f.min}–${f.max}`).join('; ')||'None'],['Tune',s.tune?`${s.tune.name} / ${s.tune.bytes} bytes`:'Not recorded'],['Tune SHA-256',s.tune?.sha256],['Operator tune association',s.tune?.associationNote]]);
    }
    list(root,'Measured evidence still needed',m.missing);list(root,'Measurement limitations',m.limitations);
    root.append(el('h2',includeTables?'Complete channel measurements':'Channel measurements omitted'),el('p',includeTables?'All source channels are represented below, including time/index columns. Search and channel-view filters do not limit this report. Numeric / missing / text counts use included rows. Statistics exclude missing and text readings and are weighted by rows, not time.':'This summary omits channel statistics and reading counts. The complete normalized case JSON retains them; reopen the preview and include full channel tables to print them.'));
    if(includeTables){
      const entries=measuredChannelEntries(m),represented={before:new Set(),after:new Set()};
      const card=entry=>{
        const section=el('section');section.className='case-print-channel';
        section.append(el('h3',(entry.name||'Unnamed channel')+' ['+(entry.unit||'Unspecified units')+']'),el('p',entry.paired?'Comparable exported label and units; physical meaning and conditions still require review.':entry.reason));
        for(const [title,key]of [['Earlier','before'],['Later','after']]){const c=entry[key];if(!c)continue;represented[key].add(c.id);section.append(el('p',`${title} ID ${c.id}: ${c.numeric} numeric / ${c.missing} missing / ${c.text} text; ${m[key].rows} included rows.`));}
        statsTable(section,entry.before,entry.after,entry.delta);root.append(section);
      };
      entries.forEach(card);
      for(const side of ['before','after'])for(const c of m[side]?.channels??[])if(!represented[side].has(c.id))card({name:c.name,unit:c.unit,[side]:c,paired:false,reason:'Time / index column — inventoried, not compared.',delta:null});
    }
  }
  root.append(el('h2','Sources and snapshot identity'),el('p','Catalog '+r.catalogVersion+' · '+r.format));
  for(const source of r.sources)root.append(el('p',source.title+' — '+source.kind+'\n'+source.url));
  paragraphs(root,[['Case content SHA-256 (normalized JSON)',sha256]]);
  root.append(el('p','The fingerprint identifies the complete normalized case JSON, encoded as UTF-8 with two-space indentation and no final newline. It is not a signature, authentication, sensor check or approval. A PDF cannot be reopened as an editable case.'));
}

export async function openCasePrintPreview(input,{isCurrent=()=>true,returnFocus=document.activeElement}={}){
  const model=await prepareCasePrint(input);
  if(!isCurrent())return ()=>{};
  if(document.querySelector('.case-print-dialog'))throw Error('Close the existing report preview first.');
  const previous=returnFocus,dialog=el('dialog');dialog.className='case-print-dialog';dialog.setAttribute('aria-label','DD84 case report preview');
  const tools=el('div');tools.className='case-print-tools';tools.append(el('h2','Preview your handoff report'));
  const description=el('p','Review what you intend to share. Print opens the system dialog; choose a printer or Save as PDF where available. Canceling does not save a report.');tools.append(description);
  const label=el('label'),include=el('input');include.type='checkbox';include.checked=true;label.append(include,document.createTextNode(' Include full channel tables'));if(model.report.measuredReview)tools.append(label);
  const print=el('button','Print / Save as PDF'),close=el('button','Close preview'),status=el('p');print.type=close.type='button';status.setAttribute('role','status');tools.append(print,close,status);
  const article=el('article');article.className='case-print-document';dialog.append(tools,article);renderReport(article,model,true);
  const dispose=()=>{if(dialog.open)dialog.close();dialog.remove();if(previous?.isConnected)previous.focus();};
  close.onclick=dispose;dialog.addEventListener('cancel',event=>{event.preventDefault();dispose();});
  include.onchange=()=>renderReport(article,model,include.checked);
  print.onclick=()=>{status.textContent='Print requested. Confirm the destination and completion in the system dialog; the application cannot verify a printed page or saved PDF.';try{window.print();}catch{status.textContent='Could not open printing. Keep this preview open and retry, or save the case JSON.';}};
  document.body.append(dialog);
  try{dialog.showModal();close.focus();}catch(error){dispose();throw error;}
  return dispose;
}

// Shared snapshot button for customer/shop case details. Cleanup cancels delayed
// preparation and closes any report when its owning snapshot is removed.
export function mountCasePrint(root,getCase,{getRevision=()=>0}={}){
  let active=true,busy=false,close=null;
  const button=el('button','Preview printable case report'),status=el('p');button.type='button';status.setAttribute('role','status');root.append(button,status);
  button.onclick=async()=>{if(busy)return;busy=true;button.disabled=true;status.textContent='Preparing report…';const revision=getRevision();try{close=await openCasePrintPreview(getCase(),{isCurrent:()=>active&&root.isConnected&&revision===getRevision(),returnFocus:button});status.textContent=revision===getRevision()?'':'Case changed while preparing the report. Open the preview again.';}catch(e){if(active)status.textContent=e.message;}finally{busy=false;if(active)button.disabled=false;}};
  const closePreview=()=>{close?.();close=null;};
  return Object.assign(()=>{active=false;closePreview();root.replaceChildren();},{closePreview});
}
