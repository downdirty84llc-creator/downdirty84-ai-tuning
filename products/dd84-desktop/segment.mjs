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
