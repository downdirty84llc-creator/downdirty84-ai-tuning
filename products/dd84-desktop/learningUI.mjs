import {fingerprintEvidence,makeLearningCase,parseLearningCase,learningReadiness} from './learning.mjs';
const $=id=>document.getElementById(id);
let files=[],dirty=false,generation=0;
const status=value=>$('learning-status').textContent=value;
const input=()=>({vehicle:$('learning-vehicle').value,displacementLiters:$('learning-displacement').value===''?null:Number($('learning-displacement').value),camNotes:$('learning-cam').value,buildNotes:$('learning-build').value,files});
function render(){
  $('learning-files').textContent=files.length?files.map(f=>`${f.role}: ${f.name}\nSHA-256 ${f.sha256}\nLogged calibration: ${f.tuneSha256??'unconfirmed / not applicable'}`).join('\n\n'):'No evidence attached.';
  const select=$('learning-tune');select.replaceChildren(new Option('Unconfirmed',''));
  for(const f of files.filter(f=>f.name.toLowerCase().endsWith('.hpt')))select.add(new Option(`${f.role}: ${f.name}`,f.sha256));
  $('learning-readiness').textContent='Select “Check learning readiness” to refresh the evidence requirements.';
}
for(const id of ['learning-vehicle','learning-displacement','learning-cam','learning-build'])$(id).oninput=()=>{dirty=true;generation++;$('learning-readiness').textContent='Details changed. Check learning readiness again.';};
$('learning-file').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  const role=$('learning-role').value,tuneSha256=$('learning-tune').value||null;
  if(files.some(f=>f.role===role)&&!confirm('Replace the file in this timeline role? Existing log associations to the old file will be cleared.'))return;
  const request=++generation;status('Fingerprinting local evidence…');
  try{
    const result=await fingerprintEvidence(file,role);if(request!==generation)return;
    if(role.endsWith('LOG'))result.tuneSha256=tuneSha256;
    const previous=files.find(f=>f.role===role);
    const next=files.filter(f=>f.role!==role).map(f=>previous&&f.tuneSha256===previous.sha256?{...f,tuneSha256:null}:f);
    next.push(result);makeLearningCase({...input(),files:next});files=next;dirty=true;render();status('Evidence added locally. No log channels or tuning values were decoded.');
  }catch(error){if(request===generation)status(error.message);}
};
$('learning-check').onclick=()=>{try{const r=learningReadiness(input());$('learning-readiness').textContent=[...r.missing,...r.areas.map(a=>`${a.area}: ${a.needs}`),r.next].join('\n\n');status('Learning remains blocked pending readable, validated measurements.');}catch(e){status(e.message);}};
$('learning-save').onclick=()=>{try{const c=makeLearningCase(input());const url=URL.createObjectURL(new Blob([JSON.stringify(c,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='DD84-learning-case.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);status('Save requested. This saves references and owner notes, not source files or verified measurements. Confirm the download before closing.');}catch(e){status(e.message);}};
$('learning-open').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file||dirty&&!confirm('Replace this unsaved learning case?'))return;const request=++generation;try{if(file.size>32768)throw Error('Learning case exceeds 32 KB.');const c=parseLearningCase(await file.text());if(request!==generation)return;files=c.files;$('learning-vehicle').value=c.vehicle;$('learning-displacement').value=c.displacementLiters??'';$('learning-cam').value=c.camNotes;$('learning-build').value=c.buildNotes;dirty=false;render();status('Reference record opened. Source files have not been reselected or verified in this session; associations are owner statements.');}catch(error){if(request===generation)status(error.message);}};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
render();
