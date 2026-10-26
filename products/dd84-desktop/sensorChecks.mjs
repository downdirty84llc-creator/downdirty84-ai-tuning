// Operator records document a check; they do not authenticate a sensor or validate its method.
export const sensorCheckFields=Object.freeze([
  {key:'device',label:'Sensor / channel device and location',max:240},
  {key:'checkDate',label:'Check date',max:10,date:true},
  {key:'method',label:'Check method and conditions',max:2000},
  {key:'reference',label:'Reference instrument / record and units',max:2000},
  {key:'expected',label:'Expected reading and acceptance limits',max:1000},
  {key:'observed',label:'Observed reading and units',max:1000},
  {key:'evidence',label:'Evidence source and reviewer notes',max:2000}
].map(Object.freeze));
export const sensorCheckOutcomes=Object.freeze({NOT_RECORDED:'Outcome not recorded',
  PASS_REPORTED:'Pass reported — unverified',FAIL_REPORTED:'Failure reported',INCONCLUSIVE_REPORTED:'Inconclusive reported'});
const provenance='OPERATOR_SUPPLIED_NOT_VERIFIED';
function object(value,label){if(!value||typeof value!=='object'||Array.isArray(value))throw Error(`Invalid ${label}.`);return value;}
export function sensorCheckSelection(input) {
  const pair=input===undefined||input===null?{before:null,after:null}:object(input,'sensor-check pair');
  if(!Object.hasOwn(pair,'before')||!Object.hasOwn(pair,'after'))throw Error('Include both sensor-check records.');
  return Object.fromEntries(['before','after'].map(side=>{
    const record=pair[side]===undefined||pair[side]===null?{}:object(pair[side],'sensor-check record'),result={};
    for(const field of sensorCheckFields){
      const raw=record[field.key];
      if(raw!==null&&raw!==undefined&&(typeof raw!=='string'||raw.length>field.max))throw Error(`Invalid ${field.label} (up to ${field.max} characters).`);
      const text=raw?.trim()||null;
      if(field.date&&text&&(!/^\d{4}-\d{2}-\d{2}$/.test(text)||text.startsWith('0000')||
        !Number.isFinite(Date.parse(text+'T00:00:00Z'))||new Date(text+'T00:00:00Z').toISOString().slice(0,10)!==text))
        throw Error('Enter a real sensor-check date as YYYY-MM-DD, or leave it blank.');
      result[field.key]=text;
    }
    const outcome=record.outcome===undefined?'NOT_RECORDED':record.outcome;
    if(typeof outcome!=='string'||!Object.hasOwn(sensorCheckOutcomes,outcome))throw Error('Unsupported reported sensor-check outcome.');
    return [side,{...result,outcome,provenance}];
  }));
}
export function sensorCheckBindings(before,after,channelRole) {
  return Object.fromEntries(Object.entries({before,after}).map(([side,value])=>[side,{
    stage:value.reference.role,csvSha256:value.reference.source.textSha256,tuneSha256:value.reference.calibration.sha256,
    channelRole,channelId:value.timeline.channel.id,unit:value.timeline.channel.unit
  }]));
}
export function savedSensorCheckSelection(input,bindings) {
  object(input,'saved sensor-check pair');
  for(const side of ['before','after']){
    const record=object(input[side],'saved sensor-check record');
    if(record.provenance!==provenance||![...sensorCheckFields.map(f=>f.key),'outcome','binding'].every(key=>Object.hasOwn(record,key)))
      throw Error('Saved sensor check is incomplete or claims unsupported verification.');
    const binding=object(record.binding,'saved sensor-check source binding');
    if(Object.keys(binding).length!==Object.keys(bindings[side]).length||
      Object.entries(bindings[side]).some(([key,value])=>!Object.hasOwn(binding,key)||binding[key]!==value))
      throw Error('Saved sensor check does not match the selected CSV, tune and channel.');
  }
  return sensorCheckSelection(input);
}
export function bindSensorChecks(input,bindings) {
  const normalized=sensorCheckSelection(input);
  return Object.fromEntries(['before','after'].map(side=>[side,{...normalized[side],binding:{...bindings[side]}}]));
}
export function reviewSensorChecks(input) {
  const normalized=sensorCheckSelection(input);
  const runs=Object.fromEntries(['before','after'].map(side=>{
    const record=normalized[side],missingFields=sensorCheckFields.filter(f=>record[f.key]===null).map(f=>f.key);
    if(record.outcome==='NOT_RECORDED')missingFields.push('outcome');
    const status=record.outcome==='FAIL_REPORTED'?'REPORTED_FAILURE':record.outcome==='INCONCLUSIVE_REPORTED'?'REPORTED_INCONCLUSIVE':
      missingFields.length===sensorCheckFields.length+1?'NOT_RECORDED':missingFields.length?'INCOMPLETE_RECORD':'REPORTED_PASS_NOT_VALIDATED';
    return [side,{record,status,missingFields,recordComplete:missingFields.length===0,sensorValidated:false}];
  }));
  return {format:'DD84_SENSOR_CHECK_REVIEW_V1',status:'SENSOR_VALIDATION_NOT_ESTABLISHED',...runs,
    provenance,sensorValidated:false,learningReady:false,automaticApplication:false,
    limitations:[
      'These records apply only to the selected comparison channel in each source CSV. Other channels have not been checked by this record.',
      'Reported outcomes, dates, methods and readings are operator statements. No instrument identity, reference accuracy, units, limits or calculation is independently verified.',
      'A complete record or reported pass is not sensor validation. Missing fields, reported failures and inconclusive checks remain visible.',
      'Check dates are not matched to recording dates; currency and applicability remain unverified. No correction, learning update or vehicle write is enabled.'
    ]};
}
