import {normalizeMeasuredReview} from './measuredReview.mjs';

export const channelStatistics={mean:'Mean',median:'Median',min:'Minimum',max:'Maximum',p95:'95th percentile'};
export const channelViews={all:'All channels',paired:'Comparable channels',changed:'Changed statistic',increased:'Increased statistic',decreased:'Decreased statistic',incomplete:'Incomplete numeric readings',unpaired:'Unpaired channels'};
export function channelCoverage(channel,rows){
  if(!channel)return null;
  return {numeric:channel.numeric,missing:channel.missing,text:channel.text,rows,percent:rows?channel.numeric/rows*100:null};
}
export function measuredChannelEntries(input){
  const r=normalizeMeasuredReview(input),a=new Map(r.before?.channels.map(c=>[c.id,c])??[]),b=new Map(r.after?.channels.map(c=>[c.id,c])??[]);
  const coverage=entry=>({...entry,beforeCoverage:channelCoverage(entry.before,r.before?.rows??0),afterCoverage:channelCoverage(entry.after,r.after?.rows??0)});
  return [
    ...r.comparisons.map(c=>coverage({key:JSON.stringify(['pair',c.beforeId,c.afterId]),name:c.name,unit:c.unit,before:a.get(c.beforeId),after:b.get(c.afterId),delta:{...c.delta},flags:[...c.flags],reason:'',paired:true})),
    ...r.unmatched.map(c=>coverage({key:JSON.stringify([c.side,c.id]),name:c.name,unit:c.unit,before:c.side==='before'?a.get(c.id):null,after:c.side==='after'?b.get(c.id):null,delta:null,flags:[],reason:c.reason,paired:false}))
  ];
}
export function filterMeasuredChannels(entries,{query='',unit=null,statistic='mean',view='all'}={}){
  if(typeof query!=='string'||query.length>240||unit!==null&&typeof unit!=='string'||!Object.hasOwn(channelStatistics,statistic)||!Object.hasOwn(channelViews,view))throw Error('Invalid channel view.');
  const search=query.trim().toLowerCase();
  return entries.filter(e=>{
    if(search&&!e.name.toLowerCase().includes(search)&&!e.unit.toLowerCase().includes(search)&&!e.before?.id.toLowerCase().includes(search)&&!e.after?.id.toLowerCase().includes(search))return false;
    if(unit!==null&&e.unit!==unit)return false;
    const delta=e.delta?.[statistic],comparable=typeof delta==='number'&&Number.isFinite(delta);
    switch(view){
      case 'paired':return e.paired;
      case 'changed':return comparable&&delta!==0;
      case 'increased':return comparable&&delta>0;
      case 'decreased':return comparable&&delta<0;
      case 'incomplete':return [e.beforeCoverage,e.afterCoverage].some(c=>c&&(c.numeric===0||c.numeric<c.rows));
      case 'unpaired':return !e.paired;
      default:return true;
    }
  });
}
