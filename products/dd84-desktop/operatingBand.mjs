import {inspectLog} from './logs.mjs';
import {reviewedMapping} from './measurements.mjs';

const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
function reading(raw) {
  const text=raw.trim();
  if(!text)return {kind:'missing',value:null};
  return decimal.test(text)&&Number.isFinite(Number(text))?
    {kind:'numeric',value:Number(text)}:{kind:'text',value:null};
}
export function operatingBandSelection(input) {
  if(input===null||input===undefined)return null;
  const band={};
  for(const key of ['rpm','map']) {
    const value=input[key];
    if(!value||typeof value.min!=='number'||typeof value.max!=='number'||
      !Number.isFinite(value.min)||!Number.isFinite(value.max)||value.min>value.max)
      throw Error('Enter finite, ordered RPM and pressure band limits.');
    if(!(key==='rpm'?['rpm']:['kPa','psi']).includes(value.unit))
      throw Error('Use the reviewed exported RPM and absolute-pressure units for the band.');
    band[key]={min:value.min,max:value.max,unit:value.unit};
  }
  return band;
}
function summarize({raw,selections,range},channelRole,band) {
  if(!range||typeof range.start!=='number'||typeof range.end!=='number'||
    !Number.isFinite(range.start)||!Number.isFinite(range.end)||range.start>range.end)
    throw Error('Choose finite, ordered time windows for the operating band.');
  if(!Array.isArray(selections)||selections.length>10)throw Error('Invalid band channel selections.');
  const roles=['RPM','MAP',channelRole],choices=roles.map(role=>selections.find(s=>s?.role===role));
  if(choices.some(s=>!s))throw Error('Review RPM, manifold absolute pressure and the comparison channel in both CSVs first.');
  let indices=null,previous=null;
  const summary={window:{start:range.start,end:range.end,unit:'s',endpoints:'BOTH_INCLUDED'},
    rowCount:0,invalidContextRows:0,outsideBandRows:0,includedRows:0,duplicateIncludedTimes:0,
    contextIssues:{rpmMissing:0,rpmText:0,mapMissing:0,mapText:0},
    target:{channel:null,numericCount:0,missingCount:0,textCount:0,min:null,max:null,flags:[]}};
  const inspection=inspectLog(raw,(time,row,channels)=>{
    indices??=choices.map(s=>channels.findIndex(c=>c.id===s.channelId));
    if(indices.some(i=>i<1))throw Error('Reviewed band channels are missing from this CSV.');
    if(time<range.start||time>range.end)return;
    summary.rowCount++;
    const [rpm,map,target]=indices.map(i=>reading(row[i]));
    for(const [key,value] of [['rpm',rpm],['map',map]]) {
      if(value.kind==='missing')summary.contextIssues[key+'Missing']++;
      if(value.kind==='text')summary.contextIssues[key+'Text']++;
    }
    if(rpm.kind!=='numeric'||map.kind!=='numeric'){summary.invalidContextRows++;return;}
    if(rpm.value<band.rpm.min||rpm.value>band.rpm.max||map.value<band.map.min||map.value>band.map.max){summary.outsideBandRows++;return;}
    summary.includedRows++;
    if(time===previous)summary.duplicateIncludedTimes++;
    previous=time;
    const t=summary.target;
    if(target.kind==='missing'){t.missingCount++;return;}
    if(target.kind==='text'){t.textCount++;return;}
    t.numericCount++;t.min=t.min===null?target.value:Math.min(t.min,target.value);
    t.max=t.max===null?target.value:Math.max(t.max,target.value);
  });
  const mapping=reviewedMapping(inspection,selections);
  if(range.start<inspection.time.first||range.end>inspection.time.last)
    throw Error('Choose operating-band windows within each recording.');
  const selected=roles.map(role=>mapping.entries.find(s=>s.role===role));
  if(selected[0].unit!==band.rpm.unit||selected[1].unit!==band.map.unit)
    throw Error('Both CSVs and the band must have identical exported RPM and absolute-pressure units. No conversion is performed.');
  summary.contextChannels={rpm:{id:selected[0].channelId,name:selected[0].name,unit:selected[0].unit},
    map:{id:selected[1].channelId,name:selected[1].name,unit:selected[1].unit}};
  summary.target.channel={id:selected[2].channelId,name:selected[2].name,unit:selected[2].unit};
  const t=summary.target;
  t.flags=[...(t.missingCount?['MISSING_READINGS']:[]),...(t.textCount?['NONNUMERIC_READINGS']:[]),
    ...(t.numericCount&&t.min===t.max?['CONSTANT_RECORDED_VALUE']:[])];
  return summary;
}
export function compareOperatingBand(beforeInput,afterInput,channelRole,input) {
  const band=operatingBandSelection(input);
  if(!band)throw Error('Choose an explicit RPM and absolute-pressure band.');
  const before=summarize(beforeInput,channelRole,band),after=summarize(afterInput,channelRole,band);
  if(before.target.channel.unit!==after.target.channel.unit)
    throw Error('Comparison channels must have identical exported units.');
  return {format:'DD84_OPERATING_BAND_V1',method:'RECORDED_ROW_RPM_MAP_FILTER_V1',
    selection:band,endpoints:'BOTH_INCLUDED',channelRole,before,after,
    status:!before.includedRows&&!after.includedRows?'NO_ROWS_IN_EITHER_BAND':
      !before.includedRows?'NO_ROWS_IN_EARLIER_BAND':!after.includedRows?'NO_ROWS_IN_LATER_BAND':
      !before.target.numericCount||!after.target.numericCount?'TARGET_READINGS_MISSING':'RECORDED_ROWS_IN_BOTH_BANDS',
    operatingConditionsMatched:false,learningReady:false,automaticApplication:false,
    limitations:[
      'Both finite RPM and absolute-pressure values must be inside the inclusive band on the same exported row and inside that recording\'s chosen time window.',
      'Missing or nonnumeric context excludes the row. Per-channel issue counts can overlap; invalidContextRows counts each excluded row once. Nothing is filled or interpolated.',
      'CSV channels can be asynchronous or repeat older values. A shared row does not establish simultaneous sensor acquisition, steady state, matched conditions or independent samples.',
      'Counts include repeated timestamps and are not dwell time. Target ranges are independent observations, not paired differences or performance gains.',
      'Band limits are operator choices. Exact exported units are required; MAP is absolute pressure, not gauge boost. No conversion or sensor validation is performed.',
      'Fuel, hardware, temperature and calibration identity remain unverified. No correction, automatic learning or vehicle writing is enabled.'
    ]};
}
