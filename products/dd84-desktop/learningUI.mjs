import {saveJson} from './saveFileUI.mjs';
import {fingerprintEvidence,makeLearningCase,parseLearningCase,learningReadiness,
  attachLearningMeasurement,replaceLearningEvidence,MAX_LEARNING_CASE_BYTES} from './learning.mjs';
import {captureLearningMeasurement,recheckLearningMeasurement,measurementCoverage} from './learningMeasurements.mjs';
import {currentLogReviewInput} from './logsUI.mjs';
import {MAX_LOG_BYTES} from './logs.mjs';
import {setupLearningComparison} from './learningComparisonUI.mjs';
const $=id=>document.getElementById(id);
let files=[],measurements=[],receipts=[],dirty=false,generation=0;
const status=value=>$('learning-status').textContent=value;
const input=()=>({vehicle:$('learning-vehicle').value,displacementLiters:$('learning-displacement').value===''?null:Number($('learning-displacement').value),camNotes:$('learning-cam').value,buildNotes:$('learning-build').value,files,measurements});
function adopt(c){files=c.files;measurements=c.measurements;receipts=receipts.filter(r=>measurements.some(m=>JSON.stringify(m)===JSON.stringify(r.reference)));}
const comparison=setupLearningComparison({getCase:input,getReceipts:()=>receipts});
function coverageText(m){
  const c=measurementCoverage(m,receipts);
  if(c.sourceStatus==='SOURCE_RECHECK_REQUIRED')return 'Source recheck required. Saved choices are references only; no measurement counts are trusted.';
  return `${c.rows} export rows · CSV contents checked this session\n`+
    c.selected.map(s=>`${s.role}: ${s.name} [${s.unit}] · ${s.numericCount} numeric, ${s.missingCount} missing, ${s.textCount} nonnumeric${s.flags.length?' · '+s.flags.join(', '):''}`).join('\n')+
    '\nUnselected roles: '+c.unselected.join(', ')+'\nSensor accuracy and comparable operating conditions remain unverified.';
}
function renderMeasurements(){
  const container=$('learning-measurements');container.replaceChildren();
  if(!measurements.length){container.textContent='No reviewed CSVs attached.';return;}
  for(const m of measurements){
    const group=document.createElement('fieldset'),title=document.createElement('legend'),summary=document.createElement('pre');
    title.textContent=`${m.role.replaceAll('_',' ')}: ${m.source.name}`;
    summary.textContent=`CSV SHA-256: ${m.source.textSha256}\nTune SHA-256: ${m.calibration.sha256}\nAssociation: ${m.calibration.note}\nTimeline note: ${m.note}\n\n${coverageText(m)}`;
    const label=document.createElement('label'),file=document.createElement('input');
    file.type='file';file.accept='.csv';label.textContent=`Recheck CSV for ${m.role.replaceAll('_',' ')}`;label.append(file);
    file.onchange=async e=>{
      const source=e.target.files[0];e.target.value='';if(!source)return;const request=++generation;
      status('Rechecking CSV contents and selected channels…');
      try{
        if(source.size>MAX_LOG_BYTES)throw Error('Log export exceeds 16 MB.');
        const raw=await source.text();if(request!==generation)return;
        const result=await recheckLearningMeasurement(m,raw,source.name);if(request!==generation)return;
        receipts=[...receipts.filter(r=>r.reference.role!==m.role),result];render();
        status('CSV fingerprint matched; measurement counts and flags were recomputed. Calibration and timeline notes remain operator statements.');
      }catch(error){if(request===generation)status(error.message);}
    };
    const remove=document.createElement('button');remove.textContent=`Remove ${m.role.replaceAll('_',' ')} CSV`;
    remove.onclick=()=>{generation++;dirty=true;measurements=measurements.filter(x=>x.role!==m.role);receipts=receipts.filter(r=>r.reference.role!==m.role);render();status('CSV reference removed from this case. Source files were not changed.');};
    group.append(title,summary,label,remove);container.append(group);
  }
}
function render(){
  $('learning-files').textContent=files.length?files.map(f=>`${f.role}: ${f.name}\nSHA-256 ${f.sha256}\nLogged calibration: ${f.tuneSha256??'unconfirmed / not applicable'}`).join('\n\n'):'No evidence attached.';
  const select=$('learning-tune');select.replaceChildren(new Option('Unconfirmed',''));
  for(const f of files.filter(f=>f.name.toLowerCase().endsWith('.hpt')))select.add(new Option(`${f.role}: ${f.name}`,f.sha256));
  renderMeasurements();comparison.invalidate(true);$('learning-readiness').textContent='Select “Check learning readiness” to refresh the evidence requirements.';
}
for(const id of ['learning-vehicle','learning-displacement','learning-cam','learning-build'])$(id).oninput=()=>{dirty=true;generation++;comparison.invalidate();$('learning-readiness').textContent='Details changed. Check learning readiness again.';};
for(const id of ['learning-role','learning-tune'])$(id).onchange=()=>{generation++;};
$('learning-measurement-role').onchange=()=>{generation++;$('learning-measurement-note').value='';};
$('learning-measurement-note').oninput=()=>{generation++;dirty=true;};
$('learning-file').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  const role=$('learning-role').value,tuneSha256=$('learning-tune').value||null;
  if(files.some(f=>f.role===role)&&!confirm('Replace this timeline file? Associations and CSV references tied to the previous file or log stage will be cleared.'))return;
  const request=++generation;status('Fingerprinting local evidence…');
  try{
    const result=await fingerprintEvidence(file,role);if(request!==generation)return;
    if(role.endsWith('LOG'))result.tuneSha256=tuneSha256;
    adopt(replaceLearningEvidence(input(),result));dirty=true;render();status('Evidence added locally. No native log channels or tuning values were decoded.');
  }catch(error){if(request===generation)status(error.message);}
};
$('learning-measurement-add').onclick=async()=>{
  const role=$('learning-measurement-role').value,note=$('learning-measurement-note').value;
  if(measurements.some(m=>m.role===role)&&!confirm('Replace the reviewed CSV in this timeline stage?'))return;
  const request=++generation;
  try{
    const source=currentLogReviewInput();status('Checking the reviewed CSV and tune association…');
    const result=await captureLearningMeasurement(source,role,note);if(request!==generation)return;
    if(!source.isCurrent())throw Error('The log review changed during attachment. Review it and try again.');
    adopt(attachLearningMeasurement(input(),result));receipts=[...receipts.filter(r=>r.reference.role!==role),result];
    dirty=true;$('learning-measurement-note').value='';render();status('Reviewed CSV attached to the matching tune fingerprint. Save the learning case to retain its references; automatic learning remains disabled.');
  }catch(error){if(request===generation)status(error.message);}
};
$('learning-check').onclick=()=>{try{const r=learningReadiness(input(),receipts);$('learning-readiness').textContent=[...r.missing,...measurements.map(m=>`${m.role}\n${coverageText(m)}`),...r.areas.map(a=>`${a.area}: ${a.needs}`),r.next].join('\n\n');status('Evidence checklist updated. Learning remains blocked pending validated measurements and controller definitions.');}catch(e){status(e.message);}};
$('learning-save').onclick=()=>{try{saveJson(makeLearningCase(input()),'DD84-learning-case.json',status);}catch(e){status(e.message);}};
$('learning-open').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file||dirty&&!confirm('Replace this unsaved learning case?'))return;
  const request=++generation;
  try{
    if(file.size>MAX_LEARNING_CASE_BYTES)throw Error('Learning case exceeds 256 KB.');
    const c=parseLearningCase(await file.text());if(request!==generation)return;
    adopt(c);receipts=[];$('learning-vehicle').value=c.vehicle;$('learning-displacement').value=c.displacementLiters??'';
    $('learning-cam').value=c.camNotes;$('learning-build').value=c.buildNotes;$('learning-measurement-note').value='';
    dirty=false;render();status('Case opened. Reselect saved CSVs to recompute measurements. Native source files have not been verified this session; associations remain operator statements.');
  }catch(error){if(request===generation)status(error.message);}
};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
render();
