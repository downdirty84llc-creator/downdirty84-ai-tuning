import {inspectLog} from './logs.mjs';
import {reviewedMapping} from './measurements.mjs';

const contextRoles = ['RPM','MAP','INTAKE_TEMPERATURE','COOLANT_TEMPERATURE'];
const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
function collect({raw,selections,range}) {
  if (!range || typeof range.start !== 'number' || typeof range.end !== 'number' ||
      !Number.isFinite(range.start) || !Number.isFinite(range.end) || range.start > range.end)
    throw Error('Choose finite, ordered context window bounds.');
  if (!Array.isArray(selections) || selections.length > 10) throw Error('Invalid context channel selections.');
  const selected = contextRoles.map(role => ({role,choice:selections.find(s=>s?.role===role),index:-1,
    values:[],missingCount:0,textCount:0,min:null,max:null}));
  let initialized=false,rowCount=0,duplicateTimes=0,previous=null;
  const inspection=inspectLog(raw,(time,row,channels)=>{
    if(!initialized){for(const s of selected)s.index=channels.findIndex(c=>c.id===s.choice?.channelId);initialized=true;}
    if(time<range.start||time>range.end)return;
    rowCount++;if(time===previous)duplicateTimes++;previous=time;
    for(const s of selected){
      if(s.index<1)continue;
      const value=row[s.index].trim();
      if(!value){s.missingCount++;continue;}
      if(!numeric.test(value)||!Number.isFinite(Number(value))){s.textCount++;continue;}
      const number=Number(value);s.values.push(number);
      s.min=s.min===null?number:Math.min(s.min,number);s.max=s.max===null?number:Math.max(s.max,number);
    }
  });
  // Candidate compatibility and selection evidence come from the actual CSV, never saved labels.
  reviewedMapping(inspection,selections);
  if(range.start<inspection.time.first||range.end>inspection.time.last)
    throw Error('Choose context windows within each recording.');
  return {window:{start:range.start,end:range.end,unit:'s',endpoints:'BOTH_INCLUDED',rowCount,duplicateTimes},
    channels:selected.map(s=>({role:s.role,values:s.values,summary:s.choice?{
      status:'SELECTED',channel:{id:inspection.channels[s.index].id,name:inspection.channels[s.index].name,unit:inspection.channels[s.index].unit},
      numericCount:s.values.length,missingCount:s.missingCount,textCount:s.textCount,min:s.min,max:s.max,
      flags:[...(s.missingCount?['MISSING_READINGS']:[]),...(s.textCount?['NONNUMERIC_READINGS']:[]),
        ...(s.values.length&&s.min===s.max?['CONSTANT_RECORDED_VALUE']:[])]
    }:{status:'UNSELECTED',channel:null,numericCount:null,missingCount:null,textCount:null,min:null,max:null,flags:[]}}))};
}
export function compareOperatingContext(beforeInput,afterInput) {
  const before=collect(beforeInput),after=collect(afterInput);
  const channels=before.channels.map((b,i)=>{
    const a=after.channels[i],result={role:b.role,before:b.summary,after:a.summary,
      status:'MISSING_REVIEWED_CHANNEL',sharedRange:null,readingsInSharedRange:{before:null,after:null}};
    if(b.summary.status!=='SELECTED'||a.summary.status!=='SELECTED')return result;
    if(b.summary.channel.unit!==a.summary.channel.unit)return {...result,status:'UNIT_MISMATCH'};
    if(!b.values.length||!a.values.length)return {...result,status:'NO_NUMERIC_READINGS'};
    const min=Math.max(b.summary.min,a.summary.min),max=Math.min(b.summary.max,a.summary.max);
    if(min>max)return {...result,status:'NO_RANGE_OVERLAP'};
    const count=values=>values.reduce((total,value)=>total+Number(value>=min&&value<=max),0);
    result.sharedRange={min,max,unit:b.summary.channel.unit,endpoints:'BOTH_INCLUDED'};
    result.readingsInSharedRange={before:count(b.values),after:count(a.values)};
    result.status=min===max?'SINGLE_VALUE_OVERLAP':'RANGE_OVERLAP';
    if(!result.readingsInSharedRange.before||!result.readingsInSharedRange.after)
      result.status='OVERLAP_WITHOUT_READINGS_ON_BOTH_SIDES';
    return result;
  });
  return {format:'DD84_OPERATING_CONTEXT_V1',method:'INDEPENDENT_RANGE_OVERLAP_V1',
    status:'OPERATING_CONDITIONS_NOT_MATCHED',windows:{before:before.window,after:after.window},channels,
    operatingConditionsMatched:false,learningReady:false,automaticApplication:false,
    limitations:[
      'Only explicitly reviewed RPM, MAP, intake-temperature and coolant-temperature channels are inspected.',
      'Overlap is the intersection of independently observed min/max ranges. Counts use finite recorded values in that interval, including repeated timestamps.',
      'Channels and recordings are not synchronized. Counts do not establish simultaneous RPM/load/temperature coverage, sample independence, dwell time or matched runs.',
      'Identical exported units are required. No conversion, interpolation, steady-state detection or sensor validation is performed.',
      'Fuel, hardware, ambient conditions, sensor delay and calibration identity remain unverified. No performance improvement or correction is inferred.'
    ]};
}
