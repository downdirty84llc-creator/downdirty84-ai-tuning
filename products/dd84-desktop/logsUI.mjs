import {renderTimeline} from './timelineUI.mjs';
import {measurementChecks,measurementCheckText} from './measurements.mjs';
import {MAX_LOG_BYTES,inspectLog,logReport,reopenLogReport,MAX_LOG_REPORT_BYTES} from './logs.mjs';
const $=id=>document.getElementById(id);let raw=null,name='',request=0,dirty=false;
const selections=new Map();
function renderSelections(checks,restored=[]){
  selections.clear();$('log-mapping').replaceChildren();
  for(const role of checks.candidates){
    const group=document.createElement('fieldset'),legend=document.createElement('legend'),label=document.createElement('label'),select=document.createElement('select'),noteLabel=document.createElement('label'),note=document.createElement('textarea');
    legend.textContent=role.role.replaceAll('_',' ');label.textContent='Channel for '+legend.textContent;select.id='map-'+role.role;label.htmlFor=select.id;select.add(new Option('Leave unselected',''));
    for(const c of role.candidates){const o=new Option(c.name+' ['+c.unit+'] — '+c.id+(c.flags.length?' — '+c.flags.join(', '):''),c.id);o.disabled=c.numericCount===0;select.add(o);}
    select.disabled=!role.candidates.some(c=>c.numericCount>0);noteLabel.textContent='Selection evidence for '+legend.textContent;note.id='evidence-'+role.role;noteLabel.htmlFor=note.id;note.maxLength=2000;note.rows=2;note.disabled=true;
    select.onchange=()=>{request++;dirty=true;note.value='';note.disabled=!select.value;if(select.value)selections.set(role.role,{role:role.role,channelId:select.value,evidence:''});else selections.delete(role.role);};
    note.oninput=()=>{request++;dirty=true;const s=selections.get(role.role);if(s)s.evidence=note.value;};
    const prior=restored.find(s=>s.role===role.role);if(prior){select.value=prior.channelId;note.value=prior.evidence;note.disabled=false;selections.set(prior.role,{role:prior.role,channelId:prior.channelId,evidence:prior.evidence});}
    group.append(legend,label,select,noteLabel,note);$('log-mapping').append(group);
  }
}

const status=t=>$('log-status').textContent=t;
$('log-open').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;const id=++request;raw=null;name='';$('log-trace-channel').replaceChildren(new Option('Choose a channel',''));$('log-trace-channel').disabled=true;renderTimeline(null,'');selections.clear();$('log-mapping').replaceChildren();$('log-save').disabled=true;$('log-results').textContent='';$('log-checks').textContent='';$('log-tune').value='';$('log-association').value='';try{if(file.size>MAX_LOG_BYTES)throw Error('Log export exceeds 16 MB.');const text=await file.text();if(id!==request)return;const r=inspectLog(text);raw=text;name=file.name;dirty=true;for(const c of r.channels.slice(1).filter(c=>c.numericCount>0))$('log-trace-channel').add(new Option(c.name+' ['+(c.unit||'unit not supplied')+'] — '+c.id,c.id));$('log-trace-channel').disabled=false;renderSelections(measurementChecks(r));$('log-checks').textContent=measurementCheckText(measurementChecks(r));$('log-results').textContent=r.rowCount+' export rows · '+r.time.span.toFixed(3)+' seconds · '+r.channels.length+' channels\nDuplicate timestamps: '+r.time.duplicateTimes+'\n\n'+r.channels.map(c=>c.name+' ['+(c.unit||'unit not supplied')+'] — numeric: '+c.numericCount+', text: '+c.textCount+', missing: '+c.missingCount+', observed range: '+(c.min===null?'none':c.min+' to '+c.max)).join('\n');$('log-save').disabled=false;status('Imported locally. Blank cells remain missing. Observed ranges are not tuning recommendations; learning remains blocked.');}catch(error){if(id===request)status(error.message);}};
for(const id of ['log-tune','log-association'])$(id).oninput=()=>{request++;dirty=true;};
$('log-save').onclick=async()=>{try{const result=await logReport(raw,name,$('log-tune').value.trim(),$('log-association').value,[...selections.values()]);const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='DD84-log-inspection.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);status('Inspection save requested. Confirm the saved file before closing. Raw samples are not included; retain the source CSV.');}catch(error){status(error.message);}};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});

$('log-review-open').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  if(raw===null){status('Open the original CSV before reopening its saved review.');return;}
  if(!confirm('Restore choices and notes from this saved review? Current choices and notes will be replaced only if its CSV fingerprint matches.'))return;
  const id=++request;try{
    if(file.size>MAX_LOG_REPORT_BYTES)throw Error('Saved log review exceeds 256 KB.');
    const saved=await file.text();if(id!==request)return;
    const result=await reopenLogReport(saved,raw,name);if(id!==request)return;
    renderSelections(result.measurementChecks,result.channelSelection.entries);
    $('log-tune').value=result.calibration.sha256??'';$('log-association').value=result.calibration.note;dirty=true;
    status('Saved review restored after CSV fingerprint verification. Measurements and flags were recomputed. Notes remain operator statements; sensors and calibration identity are not authenticated.');
  }catch(error){if(id===request)status(error.message);}
};

$('log-trace-channel').onchange=()=>renderTimeline(raw,$('log-trace-channel').value);
