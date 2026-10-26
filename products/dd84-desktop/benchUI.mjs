import {makeBenchPlan,readBenchPlan,benchSession,MAX_CAPTURE_BYTES,MAX_PLAN_BYTES} from './bench.mjs';
import {saveJson as saveRecord} from './saveFileUI.mjs';

const section=document.createElement('section');
section.id='bench-workspace';section.setAttribute('aria-labelledby','bench-title');
section.innerHTML=`<h2 id="bench-title">CAN test workspace</h2>
  <p class="notice">Offline preparation · No board or vehicle connection</p>
  <p>Create a known test pattern, then check a saved capture against it. A software rehearsal lets you try this workflow while your cable parts are on the way.</p>
  <fieldset><legend>1. Prepare a test pattern</legend>
    <label>Number of test frames <input id="bench-count" type="number" min="1" max="10000" step="1" value="1000"></label>
    <button id="bench-new">Create test pattern</button><button id="bench-plan-save" disabled>Save test pattern</button>
    <label>Open saved test pattern <input id="bench-plan-open" type="file" accept=".json"></label>
    <p id="bench-plan-summary">No test pattern selected.</p>
  </fieldset>
  <fieldset><legend>2. Compare a capture</legend>
    <label>Recording session ID (decimal) <input id="bench-session" inputmode="numeric" maxlength="20" placeholder="Use the session from the recording"></label>
    <label>Saved D84W binary capture <input id="bench-capture" type="file" accept=".bin,.d84w"></label>
    <p>Use the session ID recorded by the capture tool. HPT, HPL, CSV and internal-loopback JSON are different formats. Bench 0.2.0 cannot produce an external capture yet.</p>
    <button id="bench-compare" disabled>Compare saved capture</button>
    <button id="bench-rehearse" disabled>Run software rehearsal</button>
    <button id="bench-cancel" disabled>Cancel comparison</button>
    <p>The rehearsal uses session 1 and synthetic bytes made here. It does not operate your board.</p>
  </fieldset>
  <p id="bench-status" role="status" aria-live="polite">Create or open a test pattern to begin.</p>
  <div id="bench-result" hidden>
    <h3 id="bench-outcome"></h3><p id="bench-scope"></p><pre id="bench-summary"></pre>
    <details><summary>Comparison issues</summary><pre id="bench-issues"></pre></details>
    <details><summary>First 20 decoded frames</summary><pre id="bench-preview"></pre></details>
    <button id="bench-report-save" disabled>Save comparison report</button>
    <p>Keep the original capture and test pattern. The report contains fingerprints and a limited preview, not a backup of the capture.</p>
  </div>`;
const boardSection=document.querySelector('#board-workspace');
if(boardSection)boardSection.after(section);else document.getElementById('device-panels').append(section);
const $=id=>section.querySelector('#bench-'+id);
let plan=null,report=null,worker=null,revision=0,busy=false;
function controls(){
  $('plan-save').disabled=!plan;
  $('rehearse').disabled=!plan||busy;
  $('compare').disabled=!plan||!$('capture').files.length||!$('session').value.trim()||busy;
  $('cancel').disabled=!busy;$('report-save').disabled=!report||busy;
}
function invalidate(){
  revision++;worker?.terminate();worker=null;busy=false;report=null;
  $('result').hidden=true;controls();
}
function showPlan(){
  $('plan-summary').textContent=plan ? `${plan.count} frames · 500 kbit/s classic CAN · Run tag ${plan.runTag} · Synthetic bench pattern` : 'No test pattern selected.';
  controls();
}
function status(text){$('status').textContent=text;}
function saveJson(value,name){
  return saveRecord(value,name,status,{trailingNewline:true});
}
$('new').onclick=()=>{
  invalidate();plan=null;
  try{
    const tag=Array.from(crypto.getRandomValues(new Uint8Array(4)),b=>b.toString(16).padStart(2,'0')).join('');
    plan=makeBenchPlan(tag,$('count').valueAsNumber);
    status('Test pattern prepared. Save it to use the same pattern in a later bench test.');
  }catch(error){status(error.message);}showPlan();
};
$('count').oninput=()=>{invalidate();plan=null;showPlan();status('Create a new pattern for the changed frame count.');};
$('plan-open').onchange=async event=>{
  const file=event.target.files[0];event.target.value='';if(!file)return;
  invalidate();plan=null;showPlan();const token=revision;
  status('Reading saved test pattern…');
  try{
    if(file.size>MAX_PLAN_BYTES)throw Error('Bench plan exceeds 4 MiB.');
    const text=await file.text();if(token!==revision)return;
    plan=readBenchPlan(text);$('count').value=String(plan.count);showPlan();
    status('Saved pattern validated. Its frame contents match the supported DD84 pattern.');
  }catch(error){if(token===revision)status(error.message);}
};
$('plan-save').onclick=()=>{if(plan)saveJson(plan,`DD84-bench-plan-${plan.runTag}.json`);};
for(const [id,event] of [['session','oninput'],['capture','onchange']])$(id)[event]=()=>{
  invalidate();status('Inputs changed. Run comparison to see results for these inputs.');
};
function display(result){
  report=result;const c=result.comparison,rehearsal=result.source==='SOFTWARE_REHEARSAL';
  $('result').hidden=false;
  $('outcome').textContent=`${rehearsal?'Software rehearsal':'Imported capture'}: ${c.comparisonPassed?'bytes match the pattern':'comparison failed'}`;
  $('scope').textContent=rehearsal ? 'SYNTHETIC DATA — no hardware tested. Learning and vehicle writing remain disabled.' : 'Imported bytes only — source is unverified. This does not validate wiring, silent operation, physical timing or hardware loss. Learning and vehicle writing remain disabled.';
  $('summary').textContent=`Expected: ${c.expectedFrames} · Received: ${c.receivedFrames} · Matched: ${c.matchedFrames}\nSession: ${c.session} · Status records: ${c.statusRecords}\nCapture: ${result.input.filename} (${result.input.byteLength} bytes)\nSHA-256: ${result.input.sha256}\nHardware loss: not measured`;
  $('issues').textContent=Object.keys(c.issueCounts).length ? JSON.stringify({counts:c.issueCounts,first20Issues:c.issues},null,2) : 'No byte-comparison issues. Electrical behavior and capture completeness are not established.';
  $('preview').textContent='Reported microseconds; physical timing accuracy is not established.\nSeq | CAN ID | Type | Time (µs) | Payload\n'+result.preview.map(f=>`${f.sequence} | 0x${f.id.toString(16)} | ${f.extended?'extended':'standard'} | ${f.timestampUs} | ${f.data}`).join('\n');
  status('Comparison finished. Review the result and save its report.');controls();
}
async function run(mode){
  if(!plan)return;invalidate();const token=revision,selectedPlan=plan;
  busy=true;controls();status(mode==='rehearse'?'Running software-only rehearsal…':'Reading and comparing capture…');
  try{
    const session=mode==='rehearse'?'1':benchSession($('session').value.trim());
    let buffer,filename;
    if(mode==='compare'){
      const file=$('capture').files[0];if(!file)throw Error('Select a binary capture.');
      if(file.size>MAX_CAPTURE_BYTES)throw Error('Capture exceeds 16 MiB.');
      filename=file.name;buffer=await file.arrayBuffer();if(token!==revision)return;
    }
    worker=new Worker(new URL('./benchWorker.mjs',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{
      if(token!==revision)return;
      worker.terminate();worker=null;busy=false;
      if(data.error){status(data.error);controls();}else display(data.report);
    };
    worker.onerror=()=>{
      if(token!==revision)return;invalidate();status('Comparison could not run. Reopen the app and try again.');
    };
    worker.postMessage({mode,plan:selectedPlan,session,buffer,filename},buffer?[buffer]:[]);
  }catch(error){if(token===revision){busy=false;status(error.message);controls();}}
}
$('compare').onclick=()=>run('compare');$('rehearse').onclick=()=>run('rehearse');
$('cancel').onclick=()=>{invalidate();status('Comparison canceled. No result was saved.');};
$('report-save').onclick=()=>{if(report)saveJson(report,`DD84-bench-${report.source==='SOFTWARE_REHEARSAL'?'rehearsal':'comparison'}-${report.plan.runTag}.json`);};
