// Independently authored evidence records. Fingerprints are not decoded calibration data.
import {measurementReference,measurementCoverage,checkedMeasurement} from './learningMeasurements.mjs';
export const MAX_EVIDENCE_BYTES = 64 * 1024 * 1024;
export const MAX_LEARNING_CASE_BYTES = 256 * 1024;
const roles = {ORIGINAL:'hpt', INTERMEDIATE:'hpt', FINAL:'hpt', EARLIER_LOG:'hpl', BEFORE_FINAL_LOG:'hpl', AFTER_FINAL_LOG:'hpl'};
function label(value, max, name, optional=false) {
  if (typeof value !== 'string' || value.length > max || (!optional && !value.trim())) throw Error(`Invalid ${name}.`);
  return value.trim();
}
function evidence(value) {
  if (!value || !Object.hasOwn(roles,value.role)) throw Error('Unknown evidence role.');
  const name=label(value.name,255,'filename');
  if (/[\\/]/.test(name) || !name.toLowerCase().endsWith('.'+roles[value.role])) throw Error('File type does not match its role.');
  if (!Number.isSafeInteger(value.bytes) || value.bytes<4 || value.bytes>MAX_EVIDENCE_BYTES || !/^[a-f0-9]{64}$/.test(value.sha256)) throw Error('Invalid evidence fingerprint.');
  const tuneSha256=value.tuneSha256 ?? null;
  if (tuneSha256 !== null && (roles[value.role]!=='hpl' || !/^[a-f0-9]{64}$/.test(tuneSha256))) throw Error('Invalid log-to-tune association.');
  return {role:value.role,name,bytes:value.bytes,sha256:value.sha256,tuneSha256};
}
export async function fingerprintEvidence(file,role) {
  if (!Object.hasOwn(roles,role)) throw Error('Unknown evidence role.');
  evidence({role,name:file.name,bytes:file.size,sha256:'0'.repeat(64)});
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(bytes.length!==file.size)throw Error('File length changed while reading.');
  if(roles[role]==='hpt' && ![72,80,84,32].every((v,i)=>bytes[i]===v))throw Error('Unrecognized HPT header.');
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return evidence({role,name:file.name,bytes:bytes.length,sha256:[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('')});
}
export function makeLearningCase(input) {
  const vehicle=label(input.vehicle,160,'vehicle');
  const displacementLiters=input.displacementLiters;
  if (displacementLiters!==null && (typeof displacementLiters!=='number' || !Number.isFinite(displacementLiters) || displacementLiters<=0 || displacementLiters>30)) throw Error('Enter a valid displacement or leave it unknown.');
  const camNotes=label(input.camNotes,2000,'cam notes',true);
  const buildNotes=label(input.buildNotes,4000,'build notes',true);
  if(!Array.isArray(input.files)||input.files.length>6)throw Error('Invalid evidence list.');
  const files=input.files.map(evidence);
  if(new Set(files.map(f=>f.role)).size!==files.length)throw Error('Each timeline role must be unique.');
  for(const log of files.filter(f=>f.tuneSha256)) {
    if(!files.some(f=>roles[f.role]==='hpt'&&f.sha256===log.tuneSha256))throw Error('An associated calibration must be included in the case.');
  }
  const measurementInput=input.measurements??[];
  if(!Array.isArray(measurementInput)||measurementInput.length>3)throw Error('Invalid CSV evidence list.');
  const measurements=measurementInput.map(measurementReference);
  if(new Set(measurements.map(m=>m.role)).size!==measurements.length)throw Error('Each CSV timeline role must be unique.');
  if(new Set(measurements.map(m=>m.source.textSha256)).size!==measurements.length)throw Error('The same CSV cannot represent multiple timeline stages.');
  for(const m of measurements){
    if(!files.some(f=>roles[f.role]==='hpt'&&f.sha256===m.calibration.sha256))throw Error('The CSV calibration must match an included tune fingerprint.');
    if(m.role==='AFTER_FINAL_LOG'&&!files.some(f=>f.role==='FINAL'&&f.sha256===m.calibration.sha256))throw Error('An after-final CSV must reference the included final tune.');
  }
  const result={format:'DD84_LEARNING_CASE_V2',status:'EVIDENCE_ONLY_NOT_RELEASED',writeStrategy:'SIMULATION_ONLY',vehicle,displacementLiters,camNotes,buildNotes,files,measurements,learningReady:false,automaticApplication:false};
  if(new TextEncoder().encode(JSON.stringify(result)).length>MAX_LEARNING_CASE_BYTES)throw Error('Learning case exceeds 256 KB.');
  return result;
}
export function parseLearningCase(raw) {
  if(typeof raw!=='string'||new TextEncoder().encode(raw).length>MAX_LEARNING_CASE_BYTES)throw Error('Learning case exceeds 256 KB.');
  const input=JSON.parse(raw);
  if(!['DD84_LEARNING_CASE_V1','DD84_LEARNING_CASE_V2'].includes(input?.format)||input.status!=='EVIDENCE_ONLY_NOT_RELEASED'||input.writeStrategy!=='SIMULATION_ONLY')throw Error('Unsupported learning case.');
  if(input.format==='DD84_LEARNING_CASE_V2'&&(input.learningReady!==false||input.automaticApplication!==false||!Array.isArray(input.measurements)))throw Error('Unsupported learning-case gates.');
  if(input.format==='DD84_LEARNING_CASE_V1'&&(input.measurements!==undefined||input.learningReady===true||input.automaticApplication===true))throw Error('Unsupported legacy learning case.');
  return makeLearningCase(input);
}
export function attachLearningMeasurement(input,receipt) {
  if(!receipt?.reference||!checkedMeasurement(receipt.reference,[receipt]))throw Error('Review the source CSV before attaching it.');
  const c=makeLearningCase(input);
  return makeLearningCase({...c,measurements:[...c.measurements.filter(m=>m.role!==receipt.reference.role),receipt.reference]});
}
export function replaceLearningEvidence(input,value) {
  const c=makeLearningCase(input),next=evidence(value),previous=c.files.find(f=>f.role===next.role);
  return makeLearningCase({...c,
    files:[...c.files.filter(f=>f.role!==next.role).map(f=>previous&&f.tuneSha256===previous.sha256?{...f,tuneSha256:null}:f),next],
    measurements:c.measurements.filter(m=>!previous||(m.calibration.sha256!==previous.sha256&&m.role!==previous.role))});
}
export function learningReadiness(input,receipts=[]) {
  const c=makeLearningCase(input);
  const logs=c.files.filter(f=>roles[f.role]==='hpl');
  const measurements=c.measurements.map(m=>measurementCoverage(m,receipts));
  const missing=[];
  if(c.displacementLiters===null)missing.push('Confirm engine displacement.');
  if(!logs.length&&!measurements.length)missing.push('Add a datalog.');
  if(logs.some(f=>!f.tuneSha256))missing.push('Confirm the exact calibration running during each log. Chronology alone is insufficient.');
  if(!c.measurements.some(m=>m.role==='AFTER_FINAL_LOG'))missing.push('Add an after-final CSV tied to the final tune before assessing the final tune outcome.');
  if(!measurements.length)missing.push('Attach a reviewed readable CSV with explicit channels, units and calibration identity. HPL attachments are fingerprinted only.');
  if(measurements.some(m=>m.sourceStatus==='SOURCE_RECHECK_REQUIRED'))missing.push('Reselect each saved CSV to recheck its contents and recompute measurement coverage.');
  missing.push('CSV placement and calibration associations are operator statements. Sensor accuracy, comparable conditions, native HPL export origin and performance improvement are not established.');
  return {status:'BLOCKED_PENDING_MEASUREMENTS',missing,measurements,learningReady:false,automaticApplication:false,areas:[
    {area:'MAF airflow',status:'NOT_LEARNING',needs:'Measured/commanded lambda, MAF frequency, RPM, load, temperatures, fuel and sensor validation; isolate MAF from VE and fuel-system errors.'},
    {area:'VE',status:'NOT_LEARNING',needs:'Validated VE table definition and speed-density model, MAP/RPM coverage and isolated airflow attribution. No VE editing adapter is implemented.'},
    {area:'Timing',status:'NOT_LEARNING',needs:'Exact cam specifications and installation details, fuel, validated knock data and controlled torque measurements. No knock does not establish optimum timing; no timing editing adapter is implemented.'}
  ],next:'Review repeated comparable runs and independent validation runs before accepting a learned correction. No automatic edits, learning updates or ECU writes are performed.'};
}
