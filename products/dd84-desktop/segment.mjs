import {channelTimeline} from './timeline.mjs';

// A separate evidence artifact; never a calibration proposal or full-log review.
export async function segmentReport(raw,name,channelId,range,note){
  if(typeof name!=='string'||name.length>255||/[\\/]/.test(name)||!name.toLowerCase().endsWith('.csv'))throw Error('Expected a CSV filename.');
  if(typeof note!=='string'||!note.trim()||note.length>2000)throw Error('Add a segment review note (up to 2,000 characters).');
  if(range===null||range===undefined)throw Error('Apply an explicit time range before saving a segment.');
  const timeline=channelTimeline(raw,channelId,range);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
  return {
    format:'DD84_LOG_SEGMENT_V1',status:'EVIDENCE_ONLY_NOT_RELEASED',writeStrategy:'SIMULATION_ONLY',
    source:{name,textSha256:Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join(''),hashScope:'UTF8_DECODED_TEXT'},
    note:note.trim(),noteProvenance:'OPERATOR_SUPPLIED_NOT_VERIFIED',
    range:{start:timeline.time.first,end:timeline.time.last,unit:'s',endpoints:'BOTH_INCLUDED'},timeline,
    learningReady:false,automaticApplication:false,
    limitations:['Retain the source CSV; this report contains interval summaries, not raw samples.','The channel and range are operator choices, not verified sensor roles or steady-state detection.','Missing values remain missing; channels are not synchronized or interpolated.','Notes and file fingerprints do not authenticate sensor accuracy, calibration identity or performance improvement.','This segment report is separate from a saved full-log review and cannot be reopened as one.']
  };
}

export const MAX_SEGMENT_BYTES=256*1024;
export async function reopenSegmentReport(saved,raw,currentName){
  if(typeof saved!=='string'||new TextEncoder().encode(saved).length>MAX_SEGMENT_BYTES)throw Error('Saved segment exceeds 256 KB.');
  const value=JSON.parse(saved);
  if(value?.format!=='DD84_LOG_SEGMENT_V1'||value.status!=='EVIDENCE_ONLY_NOT_RELEASED'||value.writeStrategy!=='SIMULATION_ONLY'||value.learningReady!==false||value.automaticApplication!==false||value.noteProvenance!=='OPERATOR_SUPPLIED_NOT_VERIFIED')throw Error('Unsupported or released segment report.');
  if(value.source?.hashScope!=='UTF8_DECODED_TEXT'||typeof value.source.textSha256!=='string'||!/^[a-f0-9]{64}$/.test(value.source.textSha256))throw Error('Saved segment has no supported source fingerprint.');
  if(value.range?.unit!=='s'||value.range.endpoints!=='BOTH_INCLUDED')throw Error('Unsupported segment time units or endpoints.');
  if(value.timeline?.format!=='DD84_CHANNEL_TIMELINE_V1'||value.timeline.learningReady!==false||value.timeline.automaticApplication!==false)throw Error('Unsupported segment timeline.');
  // Saved statistics and channel metadata never override current source measurements.
  const result=await segmentReport(raw,currentName,value.timeline.channel?.id,{start:value.range.start,end:value.range.end},value.note);
  if(result.source.textSha256!==value.source.textSha256)throw Error('Selected CSV does not match the saved segment fingerprint.');
  return result;
}
