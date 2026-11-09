import {inspectMeasuredFile,summarizeMeasuredFile} from './measuredCsv.mjs';
import {normalizeMeasuredReview} from './measuredReview.mjs';

// A local check of a saved summary against bytes explicitly selected now.
// Never persist this result as a server attestation or calibration approval.
export async function recheckMeasuredSource(review,side,bytes,name){
  if(!['before','after'].includes(side))throw Error('Choose the earlier or later recording.');
  const saved=normalizeMeasuredReview(review)[side];
  if(!saved)throw Error('This review has no saved recording on that side.');
  const loaded=await inspectMeasuredFile(bytes,name);
  const base={side,expectedSha256:saved.source.sha256,selectedSource:loaded.source,
    filenameChanged:name!==saved.source.name,learningReady:false,automaticApplication:false};
  if(loaded.source.sha256!==saved.source.sha256)return {...base,status:'FILE_MISMATCH',differences:['CSV SHA-256 does not match the saved source.']};
  const differences=[];
  for(const key of ['bytes','encoding','format'])if(loaded.source[key]!==saved.source[key])differences.push('Source '+key);
  let actual;
  try{actual=summarizeMeasuredFile(loaded,{...saved.selection,filters:saved.selection.filters.map(f=>({channelId:f.id,min:f.min,max:f.max}))});}
  catch{return {...base,status:'SUMMARY_MISMATCH',differences:[...differences,'Saved window or filters cannot be reproduced from this CSV.']};}
  for(const key of ['rows','windowRows','invalidFilterRows','outsideFilterRows','duplicateTimes'])if(actual[key]!==saved[key])differences.push(key);
  const channels=new Map(actual.channels.map(c=>[c.id,c]));
  if(actual.channels.length!==saved.channels.length)differences.push('Channel count');
  for(const c of saved.channels){
    const found=channels.get(c.id);
    if(!found){differences.push('Missing channel ID '+c.id);continue;}
    for(const key of ['name','unit','numeric','missing','text','min','max','mean','median','p95']){
      if(found[key]!==c[key])differences.push(`${c.name||'Unnamed channel'} (${c.id}): ${key}`);
    }
  }
  for(const f of saved.selection.filters){
    const found=channels.get(f.id);
    if(!found||found.name!==f.name||found.unit!==f.unit)differences.push('Filter channel identity: '+f.id);
  }
  return {...base,status:differences.length?'SUMMARY_MISMATCH':'SOURCE_AND_SUMMARY_MATCH',differences};
}
