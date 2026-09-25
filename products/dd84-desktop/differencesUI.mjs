import {MAX_DIFFERENCE_BYTES,parseDifferences,summarizeDifferences,differenceReport} from './differences.mjs';
import {parseCase} from './filePair.mjs';
const $=id=>document.getElementById(id);
let raw=null,name='',pair=null,request=0,pairRequest=0,dirty=false;
const status=t=>$('diff-status').textContent=t;
function render(){
  $('diff-save').disabled=raw===null||!pair;
  $('diff-pair-label').textContent=pair?`${pair.original.name} → ${pair.final.name}. Operator-supplied association; source HPTs have not been verified in this panel.`:'No file-pair reference loaded.';
  if(raw===null){$('diff-results').textContent='No detailed comparison loaded.';return;}
  const result=summarizeDifferences(parseDifferences(raw),$('diff-direction').value);
  $('diff-results').textContent=result.map(b=>b.cells!==undefined?`${b.name}: ${b.changedCells}/${b.cells} cells differ; ${b.min} to ${b.max} ${b.unit} (${b.meaning==='AFTER_MINUS_BEFORE'?'after minus before':'raw export; direction unknown'}). Operating coordinates unavailable.`:`${b.name}: ${b.detail}`).join('\n\n');
}
$('diff-open').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;const id=++request;raw=null;name='';$('diff-direction').value='UNKNOWN';$('diff-evidence').value='';render();try{if(file.size>MAX_DIFFERENCE_BYTES)throw Error('Comparison export exceeds 2 MB.');const text=await file.text();if(id!==request)return;parseDifferences(text);raw=text;name=file.name;dirty=true;render();status('Detailed comparison imported locally. Confirm the file-pair association and direction; these are not encoded in the CSV.');}catch(error){if(id===request)status(error.message);}};
$('diff-pair').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;const id=++pairRequest;pair=null;render();try{if(file.size>16384)throw Error('File-pair reference exceeds 16 KB.');const c=parseCase(await file.text());if(id!==pairRequest)return;pair=c;dirty=true;render();status('File-pair reference loaded. Verify this is the pair used to create the CSV.');}catch(error){if(id===pairRequest)status(error.message);}};
$('diff-direction').onchange=()=>{dirty=true;render();};
$('diff-evidence').oninput=()=>{dirty=true;};
$('diff-save').onclick=async()=>{try{const r=await differenceReport(raw,name,pair,$('diff-direction').value,$('diff-evidence').value);const url=URL.createObjectURL(new Blob([JSON.stringify(r,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='DD84-comparison-evidence.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);status('Save requested for a read-only evidence report. No tables were edited or approved. Confirm the download before closing.');}catch(error){status(error.message);}};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
render();
