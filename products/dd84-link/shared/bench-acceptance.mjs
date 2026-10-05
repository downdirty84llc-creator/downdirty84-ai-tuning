// Offline comparison only. This module never opens a CAN or serial interface.
import {WireParser} from './wire.mjs';

export function makeBenchPlan(runTag, count = 1000) {
  if (typeof runTag !== 'string' || !/^[0-9a-f]{8}$/.test(runTag) ||
      !Number.isInteger(count) || count < 1 || count > 10000)
    throw Error('Use an eight-digit lowercase hex run tag and 1–10000 frames.');
  return {format:'DD84_BENCH_PLAN_V1', runTag, count, bitrate:500000,
    source:'SYNTHETIC_BENCH_PATTERN', vehicleData:false, learningEligible:false,
    frames:Array.from({length:count}, (_,i) => ({
      id:i%2 ? 0x18ff8432 : 0x321, extended:!!(i%2), fd:false, brs:false,
      channel:0, dlc:8, length:8,
      data:runTag+i.toString(16).padStart(8,'0')
    }))};
}

export function compareBenchCapture(bytes, session, runTag, count = 1000) {
  if (!(bytes instanceof Uint8Array) || bytes.length > 16*1024*1024)
    throw Error('Capture must be bytes, at most 16 MiB.');
  const plan=makeBenchPlan(runTag,count), parser=new WireParser(session);
  const issues=[], issueCounts={}; let received=0, matched=0, statuses=0;
  function issue(type, detail) {
    issueCounts[type]=(issueCounts[type]||0)+1;
    if (issues.length<20) issues.push({type,...detail});
  }
  for(let offset=0;offset<bytes.length;offset+=4096) {
    for(const event of parser.feed(bytes.subarray(offset,offset+4096))) {
      if(event.type==='frame') {
        const expected=plan.frames[received++];
        if(expected && Object.entries(expected).every(([k,v])=>event[k]===v)) matched++;
        else issue('frameMismatch',{index:received-1,id:event.id,data:event.data});
      } else if(event.type==='status') {
        statuses++;
        for(const name of ['droppedFull','rejectedInvalid','rejectedNotReady','rejectedTimestamp'])
          if(event.counters[name]!=='0') issue('captureCounter',{name,value:event.counters[name]});
      } else issue(event.type,event);
    }
  }
  const tail=parser.disconnect().discardedBytes;
  if(tail) issue('truncatedRecord',{bytes:tail});
  if(received!==count) issue('frameCount',{expected:count,received});
  return {format:'DD84_BENCH_COMPARISON_V1', session:BigInt(session).toString(),
    runTag, expectedFrames:count, receivedFrames:received, matchedFrames:matched,
    comparisonPassed:Object.keys(issueCounts).length===0,
    issueCounts, issues, statusRecords:statuses,
    evidenceScope:'Offline byte comparison; input provenance is not authenticated.',
    externalCanValidated:false, silentModeValidated:false, hardwareLossMeasured:false,
    vehicleData:false, learningEligible:false};
}
