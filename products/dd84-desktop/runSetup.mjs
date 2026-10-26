export const runSetupFields = Object.freeze([
  {key:'controller',label:'Controller family / identifier',max:160},
  {key:'operatingSystem',label:'Controller operating-system / software ID',max:160},
  {key:'displacementLiters',label:'Engine displacement (liters)',numeric:true},
  {key:'camInstallation',label:'Cam specifications and installation',max:1000},
  {key:'hardware',label:'Intake, exhaust and fuel-system hardware',max:2000},
  {key:'fuel',label:'Fuel type and measured ethanol content',max:500},
  {key:'sensorChecks',label:'Sensor models, calibration and check records',max:2000}
].map(Object.freeze));
function object(value,label) {
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error(`Invalid ${label}.`);
  return value;
}
function text(value,max,label) {
  if(value===null||value===undefined)return null;
  if(typeof value!=='string'||value.length>max)throw Error(`Invalid ${label} (up to ${max} characters).`);
  return value.trim()||null;
}
function profile(input) {
  const value=input===null||input===undefined?{}:object(input,'run setup');
  const result={};
  for(const field of runSetupFields) {
    const entry=value[field.key];
    if(field.numeric) {
      if(entry!==null&&entry!==undefined&&(typeof entry!=='number'||!Number.isFinite(entry)||entry<=0||entry>30))
        throw Error('Enter run displacement in liters (greater than zero, up to 30), or leave it unknown.');
      result[field.key]=entry??null;
    }else result[field.key]=text(entry,field.max,field.label);
  }
  result.evidenceNote=text(value.evidenceNote,2000,'run setup source note')??'';
  if(runSetupFields.some(f=>result[f.key]!==null)&&!result.evidenceNote)
    throw Error('Record the source of each run setup, including how any sensor checks were performed. Leave unconfirmed details blank.');
  result.provenance='OPERATOR_SUPPLIED_NOT_VERIFIED';
  return result;
}
export function runSetupSelection(input) {
  const value=input===null||input===undefined?{before:null,after:null}:object(input,'run setup pair');
  if(!Object.hasOwn(value,'before')||!Object.hasOwn(value,'after'))throw Error('Include both run setup records; leave unknown fields blank.');
  return {before:profile(value.before),after:profile(value.after)};
}
export function savedRunSetupSelection(input) {
  object(input,'saved run setup pair');
  for(const side of ['before','after']) {
    const value=object(input[side],'saved run setup');
    if(value.provenance!=='OPERATOR_SUPPLIED_NOT_VERIFIED'||
      ![...runSetupFields.map(f=>f.key),'evidenceNote'].every(key=>Object.hasOwn(value,key)))
      throw Error('Saved run setup is incomplete or claims unsupported verification.');
  }
  return runSetupSelection(input);
}
export function reviewRunSetup(input) {
  const selection=runSetupSelection(input);
  const fields=runSetupFields.map(f=>{
    const before=selection.before[f.key],after=selection.after[f.key];
    return {key:f.key,label:f.label,unit:f.numeric?'L':null,before,after,
      status:before===null&&after===null?'NOT_RECORDED':before===null?'MISSING_EARLIER':after===null?'MISSING_LATER':
        before===after?'SAME_REPORTED_VALUE':'DIFFERENT_REPORTED_VALUES'};
  });
  return {format:'DD84_RUN_SETUP_REVIEW_V1',method:'EXACT_REPORTED_VALUE_REVIEW_V1',
    status:'OPERATING_CONDITIONS_NOT_ESTABLISHED',fields,
    counts:{missing:fields.filter(f=>f.before===null||f.after===null).length,
      sameReported:fields.filter(f=>f.status==='SAME_REPORTED_VALUE').length,
      differentReported:fields.filter(f=>f.status==='DIFFERENT_REPORTED_VALUES').length},
    evidenceNotes:{before:selection.before.evidenceNote,after:selection.after.evidenceNote},
    provenance:'OPERATOR_SUPPLIED_NOT_VERIFIED',operatingConditionsMatched:false,learningReady:false,automaticApplication:false,
    limitations:[
      'Setup and sensor notes are operator statements tied to the parent comparison source references. They are not decoded from a tune or authenticated by the CSV.',
      'Blank fields stay unknown. Global vehicle/build notes and filenames are never used to fill a run setup.',
      'Text is compared exactly after trimming outer whitespace; no equivalence, unit conversion or physical compatibility is inferred. Different wording may describe the same setup.',
      'The same reported value does not verify controller identity, installed hardware, fuel composition, sensor accuracy, steady state or comparable conditions.',
      'Sensor notes are not a validated sensor model or check result. No learning, performance claim, calibration correction or vehicle writing is enabled.'
    ]};
}
