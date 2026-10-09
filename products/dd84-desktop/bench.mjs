import {makeBenchPlan,compareBenchCapture} from './link-shared/bench-acceptance.mjs';
import {WireParser,crc32,WIRE_SIZE} from './link-shared/wire.mjs';

export const MAX_CAPTURE_BYTES = 16*1024*1024;
export const MAX_PLAN_BYTES = 4*1024*1024;
export {makeBenchPlan};

export function benchSession(text) {
  if(typeof text!=='string' || !/^[1-9][0-9]{0,19}$/.test(text) || BigInt(text)>0xffffffffffffffffn)
    throw Error('Enter the recording session ID as a nonzero decimal integer (up to 18446744073709551615).');
  return text;
}

function sameFields(actual,expected) {
  return actual && typeof actual==='object' && !Array.isArray(actual) &&
    Object.keys(actual).length===Object.keys(expected).length &&
    Object.entries(expected).every(([key,value])=>actual[key]===value);
}

// Rebuild the expected pattern instead of trusting editable imported frame data.
export function validateBenchPlan(input) {
  if(!input || typeof input!=='object' || Array.isArray(input)) throw Error('Invalid bench plan.');
  const expected=makeBenchPlan(input.runTag,input.count);
  const {frames,...metadata}=input, {frames:pattern,...expectedMetadata}=expected;
  if(!sameFields(metadata,expectedMetadata) || !Array.isArray(frames) ||
      frames.length!==pattern.length || !pattern.every((frame,i)=>sameFields(frames[i],frame)))
    throw Error('Unsupported or changed bench plan. Use an unchanged DD84_BENCH_PLAN_V1 file.');
  return expected;
}

export function readBenchPlan(text) {
  if(typeof text!=='string' || new TextEncoder().encode(text).length>MAX_PLAN_BYTES)
    throw Error('Bench plan exceeds 4 MiB.');
  let input;
  try {input=JSON.parse(text);} catch {throw Error('Bench plan must be valid JSON.');}
  return validateBenchPlan(input);
}

export function rehearsalBytes(input,session) {
  const plan=validateBenchPlan(input); benchSession(session);
  // These bytes never come from a board and are never sent to a CAN interface.
  // Add a final software-queue status, not hardware loss evidence.
  const bytes=new Uint8Array((plan.count+1)*WIRE_SIZE);
  for(let i=0;i<=plan.count;i++) {
    const b=bytes.subarray(i*WIRE_SIZE,(i+1)*WIRE_SIZE), v=new DataView(b.buffer,b.byteOffset,b.byteLength);
    b.set([0x44,0x38,0x34,0x57]); b[4]=1;b[5]=i===plan.count?2:1;
    v.setUint16(6,WIRE_SIZE,true);v.setBigUint64(8,BigInt(session),true);
    v.setUint32(16,i,true);v.setBigUint64(20,BigInt(i)*100000n,true);
    if(i<plan.count) {
      const f=plan.frames[i];v.setUint32(28,f.id,true);b[32]=f.channel;
      b[33]=f.extended?1:0;b[34]=8;b[35]=8;
      b.set(f.data.match(/../g).map(byte=>parseInt(byte,16)),36);
    } else {
      v.setBigUint64(28,BigInt(plan.count),true);v.setBigUint64(36,BigInt(plan.count),true);
      v.setBigUint64(84,1n,true);
    }
    v.setUint32(108,crc32(b.subarray(0,108)),true);
  }
  return bytes;
}

async function sha256(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
    value=>value.toString(16).padStart(2,'0')).join('');
}

export async function reviewBenchCapture({plan:input,session,bytes,filename,source}) {
  const plan=validateBenchPlan(input);benchSession(session);
  if(!(bytes instanceof Uint8Array) || bytes.length>MAX_CAPTURE_BYTES) throw Error('Capture exceeds 16 MiB or is not binary data.');
  if(!['SOFTWARE_REHEARSAL','IMPORTED_CAPTURE_UNVERIFIED'].includes(source)) throw Error('Invalid capture source.');
  if(typeof filename!=='string' || filename.length>255) throw Error('Invalid capture filename.');
  const comparison=compareBenchCapture(bytes,session,plan.runTag,plan.count);
  const preview=[],parser=new WireParser(session);
  for(let offset=0;offset<bytes.length && preview.length<20;offset+=4096) {
    for(const event of parser.feed(bytes.subarray(offset,offset+4096)))
      if(event.type==='frame' && preview.length<20) preview.push(event);
  }
  const planSha256=await sha256(new TextEncoder().encode(JSON.stringify(plan)));
  return {format:'DD84_STUDIO_BENCH_REVIEW_V1',studioVersion:'0.17.0',source,
    input:{filename,byteLength:bytes.length,sha256:await sha256(bytes)},
    plan:{runTag:plan.runTag,count:plan.count,bitrate:plan.bitrate,sha256:planSha256},
    comparison,preview,
    timestampMeaning:'Reported microseconds; physical timing accuracy is not established.',
    externalCanValidated:false,silentModeValidated:false,hardwareLossMeasured:false,
    vehicleData:false,learningEligible:false,writeStrategy:'SIMULATION_ONLY'};
}
