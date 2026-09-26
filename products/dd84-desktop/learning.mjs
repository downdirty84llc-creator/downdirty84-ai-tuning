// Independently authored evidence records. Fingerprints are not decoded calibration data.
export const MAX_EVIDENCE_BYTES = 64 * 1024 * 1024;
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
  return {format:'DD84_LEARNING_CASE_V1',status:'EVIDENCE_ONLY_NOT_RELEASED',writeStrategy:'SIMULATION_ONLY',vehicle,displacementLiters,camNotes,buildNotes,files};
}
export function parseLearningCase(raw) {
  if(new TextEncoder().encode(raw).length>32768)throw Error('Learning case exceeds 32 KB.');
  const input=JSON.parse(raw);
  if(input?.format!=='DD84_LEARNING_CASE_V1'||input.status!=='EVIDENCE_ONLY_NOT_RELEASED'||input.writeStrategy!=='SIMULATION_ONLY')throw Error('Unsupported learning case.');
  return makeLearningCase(input);
}
export function learningReadiness(input) {
  const c=makeLearningCase(input);
  const logs=c.files.filter(f=>roles[f.role]==='hpl');
  const missing=[];
  if(c.displacementLiters===null)missing.push('Confirm engine displacement.');
  if(!logs.length)missing.push('Add a datalog.');
  if(logs.some(f=>!f.tuneSha256))missing.push('Confirm the exact calibration running during each log. Chronology alone is insufficient.');
  if(!c.files.some(f=>f.role==='AFTER_FINAL_LOG'))missing.push('Add an after-final log before assessing the final tune outcome.');
  missing.push('Import readable measurements with explicit channels, units and calibration identity. HPL attachments are fingerprinted only.');
  return {status:'BLOCKED_PENDING_MEASUREMENTS',missing,areas:[
    {area:'MAF airflow',status:'NOT_LEARNING',needs:'Measured/commanded lambda, MAF frequency, RPM, load, temperatures, fuel and sensor validation; isolate MAF from VE and fuel-system errors.'},
    {area:'VE',status:'NOT_LEARNING',needs:'Validated VE table definition and speed-density model, MAP/RPM coverage and isolated airflow attribution. No VE editing adapter is implemented.'},
    {area:'Timing',status:'NOT_LEARNING',needs:'Exact cam specifications and installation details, fuel, validated knock data and controlled torque measurements. No knock does not establish optimum timing; no timing editing adapter is implemented.'}
  ],next:'Review repeated comparable runs and independent validation runs before accepting a learned correction. No automatic edits, learning updates or ECU writes are performed.'};
}
