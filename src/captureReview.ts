export const MAX_CAPTURE_BYTES = 8 * 1024 * 1024;
const lengths = [0,1,2,3,4,5,6,7,8,12,16,20,24,32,48,64];
const counterNames = ['accepted','drained','droppedFull','rejectedInvalid','rejectedNotReady','rejectedTimestamp','queued','highWater'] as const;
export type PreviewFrame = {sequence:number; timestampUs:string; channel:number; id:number; fd:boolean; data:string};
export type CaptureReview = {
  session:string; frames:number; channels:[number,number]; classic:number; fd:number;
  durationUs:string; gaps:number; counters:Record<string,string>|null;
  warnings:string[]; preview:PreviewFrame[];
};
function object(value:unknown): Record<string,unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a record object.');
  return value as Record<string,unknown>;
}
function uint(value:unknown,max:number):number {
  if(typeof value!=='number'||!Number.isInteger(value)||value<0||value>max) throw new Error('Invalid numeric field.');
  return value;
}
function u64(value:unknown):bigint {
  if(typeof value!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(value)) throw new Error('Expected an unsigned 64-bit decimal string.');
  const n=BigInt(value); if(n>0xffffffffffffffffn) throw new Error('64-bit field is too large.'); return n;
}
export function reviewCapture(text:string): CaptureReview {
  if(new TextEncoder().encode(text).length>MAX_CAPTURE_BYTES) throw new Error('Capture must be 8 MB or smaller.');
  const lines=text.trimEnd().split('\n');
  if(lines.length>20000) throw new Error('Capture exceeds 20,000 records.');
  const result:CaptureReview={session:'',frames:0,channels:[0,0],classic:0,fd:0,durationUs:'0',gaps:0,counters:null,warnings:[],preview:[]};
  let next=0,firstTime:bigint|undefined,lastTime=0n,lastType='';
  for(let i=0;i<lines.length;i++) {
    try {
      if(lines[i].length>2048) throw new Error('Record exceeds 2,048 characters.');
      const r=object(JSON.parse(lines[i]));
      if(r.source!=='SYNTHETIC_HOST_REHEARSAL') throw new Error('Only wired rehearsal simulation files are supported.');
      const session=u64(r.session).toString(); if(session==='0') throw new Error('Session must be nonzero.');
      if(result.session && result.session!==session) throw new Error('Mixed capture sessions are not allowed.');
      result.session=session;
      const sequence=uint(r.sequence,0xffffffff),time=u64(r.timestampUs);
      if(sequence<next) throw new Error('Duplicate or backwards sequence.');
      if(firstTime!==undefined && time<lastTime) throw new Error('Backwards timestamp.');
      result.gaps+=sequence-next; next=sequence+1;
      firstTime??=time;lastTime=time;
      if(r.type==='frame') {
        const channel=uint(r.channel,1),id=uint(r.id,0x1fffffff),dlc=uint(r.dlc,15),length=uint(r.length,64);
        for(const flag of ['extended','fd','brs']) if(typeof r[flag]!=='boolean') throw new Error('Invalid frame flags.');
        if((!r.extended&&id>0x7ff)||(!r.fd&&(r.brs||dlc>8))||lengths[dlc]!==length||
          typeof r.data!=='string'||r.data.length!==length*2||!/^[0-9a-f]*$/i.test(r.data)) throw new Error('Invalid CAN frame metadata or payload.');
        result.frames++;result.channels[channel]++;if(r.fd)result.fd++;else result.classic++;
        if(result.preview.length<50) result.preview.push({sequence,timestampUs:time.toString(),channel,id,fd:r.fd as boolean,data:r.data});
      } else if(r.type==='status') {
        if(r.hardwareOverruns!==null) throw new Error('Hardware overruns must be unknown for this rehearsal.');
        const c=object(r.counters); const values=counterNames.map(name=>u64(c[name]));
        if(values[0]!==values[1]+values[6]||values[6]>values[7]||values[7]>256n) throw new Error('Inconsistent queue counters.');
        if(result.counters && counterNames.some((name,j)=>name!=='queued' && values[j]<BigInt(result.counters![name])))
          throw new Error('Queue counters went backwards.');
        result.counters=Object.fromEntries(counterNames.map((name,j)=>[name,values[j].toString()]));
      } else throw new Error('Unsupported record type. Use the frame/status rehearsal export.');
      lastType=r.type as string;
    } catch(error) {throw new Error(`Line ${i+1}: ${error instanceof Error?error.message:'Invalid record.'}`);}
  }
  if(!result.frames) throw new Error('Capture contains no frames.');
  result.durationUs=(lastTime-firstTime!).toString();
  if(result.gaps) result.warnings.push(`${result.gaps} missing record sequence numbers.`);
  if(lastType!=='status') result.warnings.push('No final queue status: capture may be incomplete.');
  if(result.counters) {
    if(BigInt(result.counters.drained)!==BigInt(result.frames)) result.warnings.push('Drained queue count differs from the number of frames in this file.');
    if(BigInt(result.counters.queued)>0n) result.warnings.push('Frames remained queued at the last status.');
    if(BigInt(result.counters.droppedFull)>0n) result.warnings.push(`${result.counters.droppedFull} software queue drops reported.`);
    if(['rejectedInvalid','rejectedNotReady','rejectedTimestamp'].some(k=>BigInt(result.counters![k])>0n)) result.warnings.push('The queue reported rejected frames.');
  }
  return result;
}
export function exampleCapture():string {
  const base={source:'SYNTHETIC_HOST_REHEARSAL',session:'1'};
  return [
    {...base,type:'frame',sequence:0,timestampUs:'1000',id:291,channel:0,extended:false,fd:false,brs:false,dlc:2,length:2,data:'aabb'},
    {...base,type:'frame',sequence:1,timestampUs:'2000',id:292,channel:1,extended:false,fd:true,brs:true,dlc:1,length:1,data:'cc'},
    {...base,type:'status',sequence:2,timestampUs:'2000',hardwareOverruns:null,counters:{accepted:'2',drained:'2',droppedFull:'0',rejectedInvalid:'0',rejectedNotReady:'0',rejectedTimestamp:'0',queued:'0',highWater:'1'}}
  ].map(r=>JSON.stringify(r)).join('\n');
}
