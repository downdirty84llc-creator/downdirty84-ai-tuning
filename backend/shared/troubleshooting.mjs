// DD84-authored evidence prompts. Forum reports identify needs, not tune values.
export const catalogVersion = '2026-10-26.1';
export const sources = Object.freeze({
  channels: {kind:'Manufacturer documentation', title:'HP Tuners: scanner channels and polling', url:'https://docs.hptuners.com/VCM_Scanner/Channels/Channels/'},
  transform: {kind:'Manufacturer documentation', title:'HP Tuners: transforming a channel', url:'https://docs.hptuners.com/VCM_Scanner/Channels/Transforming_A_Channel/'},
  learning: {kind:'Manufacturer guidance', title:'Holley: closed loop and self-learning limits', url:'https://www.holley.com/blog/post/holley_efi_self-learning_explained_how_closed_loop_and_learn_refine_your_tune/'},
  support: {kind:'Manufacturer documentation', title:'HP Tuners: supporting remote customers', url:'https://tdn.hptuners.com/help/content/Supporting_the_TDN_App.htm'},
  trigger: {kind:'Manufacturer documentation', title:'MaxxECU: trigger logger', url:'https://www.maxxecu.com/webhelp/settings-diagnostics-trigger_logger.html'},
  boost: {kind:'Manufacturer documentation', title:'Haltech: boost control', url:'https://support.haltech.com/portal/en/kb/articles/boost-control'},
  knock: {kind:'Manufacturer guidance', title:'COBB: Subaru data logging overview', url:'https://www.cobbtuning.com/subaru-data-logging-overview/'},
  history: {kind:'Manufacturer documentation', title:'HP Tuners: VCM Editor user guide / tune history', url:'https://files.hptuners.com/help/VCMEditorUserGuide.pdf'},
  fuelReport: {kind:'Community report — not a verified diagnosis', title:'LS1Tech: intermittent fuel-pressure drop', url:'https://ls1tech.com/forums/fueling-injection/1978142-fuel-pressure-spiking-low-log-attached.html'},
  triggerReport: {kind:'Community report — vehicle-specific resolution', title:'Link ECU: trigger errors and rough idle', url:'https://forums.linkecu.com/topic/9187-trigger-errors-troubleshooting/'},
  accessReport: {kind:'Community discussion — shop workflow', title:'HP Academy: locked customer tune files', url:'https://www.hpacademy.com/forum/motec-m1-software-tutorial/show/password-locks-for-tune-files/'},
  knockReport: {kind:'Community report — not a verified diagnosis', title:'NASIOC: uncertainty interpreting knock corrections', url:'https://forums.nasioc.com/forums/showthread.php?t=2910177'},
  versionReport: {kind:'First-party issue report — firmware-specific', title:'rusEFI: trigger decoding regression report', url:'https://github.com/rusefi/rusefi/issues/1488'}
});
const check = (id, label, detail) => ({id,label,detail});
export const commonChecks = [
  check('identity','Vehicle and calibration identified','Record controller/OS, software version, engine, fuel and modifications. Do not infer them from a filename.'),
  check('pair','Tune and log association reviewed','Confirm which exact calibration ran during the recording. Keep the untouched tune and full native log.'),
  check('health','Mechanical concerns reviewed','Record known faults, DTCs, leaks, misfire, overheating and pressure concerns before considering calibration changes.'),
  check('recording','Usable recording available','Keep channel names, units, timestamps and the event time. Screenshots alone cannot establish sequence or sample quality.')
];
export const issues = [
  {id:'logging',title:'Missing channels, slow logging or unreadable data',summary:'Establish what was actually recorded before interpreting an empty or delayed signal.',checks:[
    check('logging-channels','Channel availability verified','Record the requested channels and which the controller actually supplies. Missing data is unknown, not a zero measurement.'),
    check('logging-rate','Recording setup and timing reviewed','Keep the channel configuration, units and polling intervals. Request focused channels for the symptom; adding polled channels can reduce sample rate.')],channels:['Original log','Readable CSV with channel IDs, names and units','Channel configuration','Event time','Software and interface versions'],sourceIds:['channels','support'],next:'Open readable VCM Scanner CSVs in Recorded logs. Keep native HPL and other proprietary files; an unsupported export must not be treated as decoded data.'},
  {id:'wideband',title:'AFR / lambda or fuel trims disagree',summary:'Separate measurement and channel setup from a fuel-model error.',checks:[
    check('wideband-scaling','Wideband signal and units checked','Record controller model, analog/CAN input, scaling and fuel display basis. Compare the recorded signal with its own display; lambda and fuel-specific AFR must not be mixed.'),
    check('wideband-condition','Sensor and exhaust condition reviewed','Record sensor status, warm-up, placement and possible exhaust leakage. An oxygen reading alone does not prove a fuel-table error.')],channels:['Time','RPM','MAP / load','TPS','Commanded lambda / AFR with units','Measured lambda / AFR with units','STFT / LTFT where supported','Closed-loop state','Fuel pressure where measured'],sourceIds:['transform','channels','learning'],next:'Review the measurement chain and matching operating conditions before proposing MAF or VE changes.'},
  {id:'fuel',title:'Fuel pressure drops or fueling becomes inconsistent',summary:'Capture pressure, demand and electrical context together.',checks:[
    check('fuel-reference','Pressure reference and sensor verified','Record gauge/absolute/differential basis, regulator reference and sensor calibration. Obtain the required pressure from this fuel-system specification; no universal PSI target is assumed.'),
    check('fuel-supply','Supply fault investigated','Document pump, filter, regulator, wiring and voltage checks by a qualified technician. Do not use added fuel commands to compensate for a failing supply.')],channels:['Time','RPM','MAP / boost with pressure basis','Fuel pressure with units and reference','Battery / pump voltage where measured','Injector duty or pulse width','Measured and commanded lambda'],sourceIds:['learning','fuelReport'],next:'Resolve any supply or sensor concern before more load testing or calibration changes.'},
  {id:'idle',title:'Hunting idle, stalling or poor starting',summary:'Distinguish air, temperature, fuel and synchronization effects.',checks:[
    check('idle-condition','Event conditions recorded','Identify cold start, hot restart, in-gear idle or deceleration. Record cam/displacement and relevant hardware changes.'),
    check('idle-base','Base setup reviewed','Record vacuum-leak, throttle/IAC and timing-synchronization checks using the controller manual. Learning cannot establish that the mechanical setup is correct.')],channels:['Time','RPM and target RPM','Coolant and intake temperature','MAP','TPS / IAC where supported','Timing','Measured and commanded lambda','Closed-loop / learn state'],sourceIds:['learning','triggerReport'],next:'Review a recording that includes the lead-up to the stall or oscillation, not only its lowest RPM.'},
  {id:'knock',title:'Knock correction or unexpected timing reduction',summary:'Keep correction signals and their operating context together.',checks:[
    check('knock-fuel','Fuel and operating conditions documented','Record actual fuel, temperatures, load and recent changes. Do not classify a correction as harmless from its magnitude alone.'),
    check('knock-review','Cause reviewed by the tuner','Record DTCs and relevant mechanical/sensor findings. Preserve knock protection; a quiet log is not proof of optimal timing or power.')],channels:['Time','RPM','Load / MAP','Actual timing','Knock correction by supported channel','Fueling','Intake / coolant temperature','Controller-specific learned correction where available'],sourceIds:['knock','knockReport'],next:'Have the tuner evaluate the controller-specific signals. Do not add timing or repeat a high-load event just to test a forum explanation.'},
  {id:'sync',title:'RPM spikes, trigger errors or unexpected cutout',summary:'Use the controller’s trigger evidence to distinguish signal faults from missing samples.',checks:[
    check('sync-setup','Trigger configuration recorded','Document sensor type, trigger pattern and recent wiring or firmware changes. Timing and wiring checks must follow the exact controller manual.'),
    check('sync-scope','Trigger evidence captured or requested','Keep the native trigger/composite log, error counters and ordinary engine log. A transfer gap is not automatically a trigger fault.')],channels:['Time','RPM','Sync / trigger error counters','Battery voltage','ECU reset state where supported','Native trigger or composite capture'],sourceIds:['trigger','triggerReport','versionReport'],next:'Send the exact configuration and native trigger evidence to the responsible tuner or manufacturer.'},
  {id:'boost',title:'Boost misses target or overshoots',summary:'Identify what target and control mode were active at the event.',checks:[
    check('boost-mode','Boost mode and pressure basis recorded','Identify open/closed-loop mode, target, units and gauge/absolute basis. Control strategies differ by ECU.'),
    check('boost-hardware','Hardware and limits reviewed','Record wastegate, hose routing, solenoid and sensor checks against the installed-system manual. Preserve overboost protection.')],channels:['Time','RPM','Throttle','MAP / boost','Boost target if available','Boost control output / duty','Control mode','Relevant temperature and pressure limits'],sourceIds:['boost','channels'],next:'Review hardware, active target and control output together before changing duty or controller gains.'},
  {id:'connection',title:'Cannot read, connect, import or access a tune',summary:'Make the support request specific enough to reproduce.',checks:[
    check('connection-support','Exact support and access confirmed','Record device, controller/OS, application and firmware versions, license state and any lock. Ask the authorized tuner/manufacturer for access; do not bypass protections.'),
    check('connection-error','Failure details preserved','Record the exact error, operation and time, plus the manufacturer’s info log. Keep the original file; renaming a proprietary extension does not convert it.')],channels:['Exact error text','Software / firmware version','Controller identity','Manufacturer info log','Original native file and readable export if available'],sourceIds:['support','accessReport','history'],next:'Use the file guide for supported DD84 inputs, or send the evidence to the relevant manufacturer. DD84 cannot unlock or flash unsupported controllers.'},
  {id:'comparison',title:'Which tune changed, and did it help?',summary:'Make revisions traceable and compare like operating conditions.',checks:[
    check('compare-original','Original and revision preserved','Keep the original, revision, change reason and operator notes. File names such as final are labels, not proof of stage.'),
    check('compare-context','Before/after conditions reviewed','Record fuel, hardware, temperature, gear/load and event windows. Missing after-data or different conditions cannot establish improvement.')],channels:['Exact tune revisions','Linked before/after recordings','Matching operating window','Units and sensor checks','Known configuration differences'],sourceIds:['history','support'],next:'Use Tune comparisons for source fingerprints and Learning evidence for reviewed before/after windows. This worksheet does not import measurements.'},
  {id:'handoff',title:'Shop intake, repeat visits or remote handoff',summary:'Reduce missing information between the customer and technician.',checks:[
    check('handoff-scope','Request and ownership agreed','Record requested outcome, responsible tuner, permitted work and who supplies native files. Keep customer identifiers out of public forum posts.'),
    check('handoff-next','Next action assigned','Record tests already done, their results, remaining questions, next owner and an acceptance criterion. Request only channels the installed controller can supply.')],channels:['Vehicle and installed hardware','Exact calibration and recording association','Symptom / event time','Tests and results','Next owner and acceptance criterion'],sourceIds:['support','accessReport'],next:'Save this handoff with the original files. A checked box is an operator statement, not evidence that a vehicle is ready for release.'}
];
export const fields = [
  ['caseName','Case / job reference',120],['vehicle','Vehicle and engine / displacement',240],
  ['controller','Controller and OS / calibration ID',240],['software','Tuning software and firmware version',240],
  ['modifications','Installed modifications / cam specs',800],['fuel','Fuel and induction',240],
  ['symptom','What happens, and when?',1500],['conditions','Conditions and event time in the log',800],
  ['recentChanges','Recent changes and tests already done',1500],['tune','Exact tune filename / revision',240],
  ['log','Exact log filename',240],['nextOwner','Who handles the next step?',240],
  ['acceptance','What evidence would resolve the concern?',800]
];
const fieldLimits = Object.fromEntries(fields.map(([id,,limit])=>[id,limit]));
const statuses = new Set(['unknown','checked','issue','na']);
const allChecks = new Set([...commonChecks,...issues.flatMap(i=>i.checks)].map(c=>c.id));
export function blankCase() { return {format:'DD84_TROUBLESHOOTING_CASE_V1',catalogVersion,issueId:'handoff',context:Object.fromEntries(fields.map(([id])=>[id,''])),relationship:'unknown',checks:{}}; }
export function validateCase(value) {
  const fail=()=>{throw Error('This is not a supported DD84 troubleshooting case. Keep the current case and check the file.');};
  if (!value || value.format!=='DD84_TROUBLESHOOTING_CASE_V1' || value.catalogVersion!==catalogVersion || !issues.some(i=>i.id===value.issueId) || !value.context || typeof value.context!=='object' || Array.isArray(value.context) || !value.checks || typeof value.checks!=='object' || Array.isArray(value.checks) || !['unknown','confirmed','mismatch'].includes(value.relationship)) fail();
  const next=blankCase(); next.issueId=value.issueId; next.relationship=value.relationship;
  for (const key of Object.keys(value.context)) if (!Object.hasOwn(fieldLimits,key)) fail();
  for (const [key,limit] of Object.entries(fieldLimits)) {
    const text=value.context[key]; if(typeof text!=='string'||text.length>limit) fail(); next.context[key]=text;
  }
  for (const [key,answer] of Object.entries(value.checks)) {
    if(!allChecks.has(key)||!answer||!statuses.has(answer.status)||typeof answer.note!=='string'||answer.note.length>1000) fail();
    next.checks[key]={status:answer.status,note:answer.note};
  }
  // Any saved assessment or source list is derived anew from the trusted catalog.
  return next;
}
export function assessCase(value) {
  const state=validateCase(value), issue=issues.find(i=>i.id===state.issueId);
  const checks=[...commonChecks,...issue.checks];
  const concerns=checks.filter(c=>state.checks[c.id]?.status==='issue').map(c=>c.label);
  if(state.relationship==='mismatch')concerns.unshift('Tune and log do not match');
  const missing=fields.filter(([id])=>['vehicle','controller','symptom','tune','log','nextOwner','acceptance'].includes(id)&&!state.context[id].trim()).map(([,label])=>label);
  if(state.relationship==='unknown')missing.push('Confirmed tune-to-log relationship');
  for(const c of checks){const a=state.checks[c.id];if(!a||a.status==='unknown')missing.push(c.label);else if(!a.note.trim())missing.push(`${c.label}: evidence or explanation`);}
  return {status:concerns.length?'CONCERNS_RECORDED':missing.length?'NEEDS_INFORMATION':'READY_FOR_HUMAN_REVIEW',concerns,missing,next:issue.next,channels:issue.channels,sourceIds:issue.sourceIds,notice:'Operator-entered evidence only. No diagnosis, calibration approval or permission to operate/flash a vehicle. Community reports are not calibration specifications.'};
}
export function caseReport(value) {const state=validateCase(value);return {...state,assessment:assessCase(state),sources:issues.find(i=>i.id===state.issueId).sourceIds.map(id=>({id,...sources[id]}))};}
export function parseCase(text) {if(typeof text!=='string'||new TextEncoder().encode(text).length>128*1024)throw Error('Choose a troubleshooting JSON file smaller than 128 KiB.');return validateCase(JSON.parse(text));}
