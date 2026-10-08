import {fingerprint,makeCase,parseCase,matchFile} from './filePair.mjs';
const $=id=>document.getElementById(id);
let original=null,final=null,saved=null,dirty=false;
const requests={original:0,final:0,case:0};
const status=text=>$('pair-status').textContent=text;
function render(){
  for(const role of ['original','final']){
    const value=role==='original'?original:final;
    $(role+'-identity').textContent=value?`${value.name}\n${value.bytes.toLocaleString()} bytes\nSHA-256 ${value.sha256}`:'No file loaded';
  }
  $('pair-save').disabled=!original||!final;
  $('pair-summary').textContent=original&&final?(original.sha256===final.sha256?'Both selected files have identical contents.':'The selected files have different contents. This does not identify changed tables or confirm that both belong to the same vehicle.'):'Select both files to compare their identities.';
}
for(const role of ['original','final'])$(role+'-file').onchange=async event=>{
  const file=event.target.files[0];event.target.value='';if(!file)return;
  const id=++requests[role];requests.case++;
  if(role==='original')original=null;else final=null;render();status(`Reading ${role} file…`);
  try{
    const result=await fingerprint(file);if(id!==requests[role])return;
    if(saved&&!matchFile(saved[role],result))throw Error(`This file does not match the saved ${role} fingerprint. Clear the case to start a different pair.`);
    if(role==='original')original=result;else final=result;dirty=true;render();status(`${role} file ${saved?'verified against saved case':'fingerprinted'}. No calibration values were read or changed.`);
  }catch(e){if(id===requests[role])status(e.message);}
};
$('pair-open').onchange=async event=>{
  const file=event.target.files[0];event.target.value='';if(!file||dirty&&!confirm('Replace this unsaved file-pair case?'))return;
  const id=++requests.case;requests.original++;requests.final++;
  try{if(file.size>16384)throw Error('Case record exceeds 16 KB.');const c=parseCase(await file.text());if(id!==requests.case)return;saved=c;original=null;final=null;dirty=false;$('pair-vehicle').value=c.vehicle;$('pair-build').value=c.build;render();status('Case opened. Reselect both HPT files to verify their fingerprints before exporting. The case contains references, not file backups.');}catch(e){if(id===requests.case)status(e.message);}
};
$('pair-clear').onclick=()=>{if(dirty&&!confirm('Clear the unsaved file-pair case?'))return;requests.case++;requests.original++;requests.final++;original=final=saved=null;dirty=false;$('pair-vehicle').value='';$('pair-build').value='';render();status('Case cleared. Source files remain unchanged.');};
for(const name of ['pair-vehicle','pair-build'])$(name).addEventListener('input',()=>{requests.case++;dirty=true;});
$('pair-save').onclick=()=>{try{
  const c=makeCase($('pair-vehicle').value,$('pair-build').value,original,final);
  const url=URL.createObjectURL(new Blob([JSON.stringify(c,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='DD84-file-pair.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
  status('Save requested. This record contains notes and fingerprints only—not HPT backups, decoded tables or approval. Confirm the file was saved before closing.');
}catch(e){status(e.message);}};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
render();
