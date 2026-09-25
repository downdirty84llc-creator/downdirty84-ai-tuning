import {inspectLog} from './logs.mjs';
const numeric=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
// Independent range marks show observed extrema, never a reconstructed continuous signal.
export function channelTimeline(raw,channelId){
  if(typeof channelId!=='string')throw Error('Choose a recorded channel.');
  const samples=[];let index=-1;
  const inspection=inspectLog(raw,(time,row,channels)=>{
    if(index<0)index=channels.findIndex(c=>c.id===channelId);
    if(index<1)throw Error('Choose a recorded channel other than the time axis.');
    const s=row[index].trim(),value=s&&numeric.test(s)&&Number.isFinite(Number(s))?Number(s):null;
    samples.push({time,value,kind:!s?'missing':value===null?'text':'numeric'});
  });
  const channel=inspection.channels[index];if(!channel.numericCount)throw Error('This channel has no finite numeric samples.');
  const {first,last,span}=inspection.time;
  const count=Math.max(1,Math.min(240,Math.ceil(span))),width=span>0?span/count:0;
  const bins=Array.from({length:count},(_,i)=>({start:first+i*width,end:i===count-1?last:first+(i+1)*width,numericCount:0,missingCount:0,textCount:0,min:null,max:null}));
  for(const s of samples){const i=width?Math.min(count-1,Math.floor((s.time-first)/width)):0,b=bins[i];if(s.kind==='numeric'){b.numericCount++;b.min=b.min===null?s.value:Math.min(b.min,s.value);b.max=b.max===null?s.value:Math.max(b.max,s.value);}else if(s.kind==='missing')b.missingCount++;else b.textCount++;}
  return {format:'DD84_CHANNEL_TIMELINE_V1',channel:{id:channel.id,name:channel.name,unit:channel.unit},time:inspection.time,min:channel.min,max:channel.max,bins,intervalConvention:'LEFT_CLOSED_RIGHT_OPEN_LAST_INCLUDES_END',numericCount:channel.numericCount,missingCount:channel.missingCount,textCount:channel.textCount,learningReady:false,automaticApplication:false};
}
