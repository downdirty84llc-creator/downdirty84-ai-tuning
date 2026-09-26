import {channelTimeline} from './timeline.mjs';
const ns='http://www.w3.org/2000/svg';
function element(name,attributes={},text){const node=document.createElementNS(ns,name);for(const [k,v] of Object.entries(attributes))node.setAttribute(k,String(v));if(text!==undefined)node.textContent=text;return node;}
export function renderTimeline(raw,channelId,range=null){
  const chart=document.getElementById('log-trace-chart'),description=document.getElementById('log-trace-description'),details=document.getElementById('log-trace-bins');chart.replaceChildren();description.textContent='';details.textContent='';if(!channelId)return;
  try{
    const t=channelTimeline(raw,channelId,range),unit=t.channel.unit||'unit not supplied';
    description.textContent=t.channel.name+' ['+unit+']: '+t.time.first+' to '+t.time.last+' seconds (both endpoints included). '+t.numericCount+' numeric readings; '+t.missingCount+' missing cells; '+t.textCount+' nonnumeric cells. '+t.bins.length+' time intervals. Each mark shows an interval’s recorded minimum and maximum; blank intervals have no numeric readings. No values are filled or connected.';
    details.textContent=t.bins.map((b,i)=>'['+b.start.toFixed(3)+', '+b.end.toFixed(3)+(i===t.bins.length-1?']':')')+' s: '+(b.numericCount?b.min+' to '+b.max+' '+unit:'no numeric readings')+'; numeric '+b.numericCount+', missing '+b.missingCount+', nonnumeric '+b.textCount).join('\n');
    if(!t.numericCount){description.textContent+=' No numeric readings in this time range.';return;}
    const svg=element('svg',{viewBox:'0 0 900 280',role:'img','aria-label':description.textContent,width:'100%'});
    svg.append(element('title',{},t.channel.name+' recorded range by time'));
    const low=t.min,high=t.max,scale=Math.max(Math.abs(low),Math.abs(high),1),delta=high/scale-low/scale;
    const y=v=>delta?220-180*((v/scale-low/scale)/delta):130;
    svg.append(element('path',{d:'M 95 30 V 230 H 880',fill:'none',stroke:'#8da4b6'}));
    svg.append(element('text',{x:5,y:45,fill:'#e8edf2','font-size':12},String(high)),element('text',{x:5,y:220,fill:'#e8edf2','font-size':12},String(low)));
    svg.append(element('text',{x:95,y:255,fill:'#e8edf2','font-size':12},t.time.first.toFixed(3)+' s'),element('text',{x:880,y:255,'text-anchor':'end',fill:'#e8edf2','font-size':12},t.time.last.toFixed(3)+' s'));
    t.bins.forEach((b,i)=>{if(!b.numericCount)return;const x=100+(i+0.5)*770/t.bins.length,top=y(b.max),bottom=y(b.min);const mark=element('line',{x1:x,x2:x,y1:top===bottom?top-2:top,y2:top===bottom?bottom+2:bottom,stroke:'#ef9e3b','stroke-width':2});mark.append(element('title',{},b.start.toFixed(3)+'–'+b.end.toFixed(3)+' s: '+b.min+' to '+b.max+' '+unit+'; '+b.numericCount+' numeric, '+b.missingCount+' missing, '+b.textCount+' nonnumeric'));svg.append(mark);});
    chart.append(svg);
  }catch(e){description.textContent=e.message;}
}
