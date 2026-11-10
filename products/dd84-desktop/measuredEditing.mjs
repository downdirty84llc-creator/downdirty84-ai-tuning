import {normalizeMeasuredReview} from './measuredReview.mjs';

// Notes are operator statements. Updating them must never replace source evidence.
export function updateMeasuredOutcome(review,outcome){
  const saved=normalizeMeasuredReview(review);
  return normalizeMeasuredReview({...saved,outcome});
}

// An unloaded saved side is not a request to delete it.
export function assertMeasuredRebuildSources(review,sides){
  if(!review)return;
  const saved=normalizeMeasuredReview(review);
  for(const [key,label]of [['before','earlier'],['after','later']]){
    if(saved[key]&&!sides[key]?.loaded&&sides[key]?.cleared!==true)
      throw Error('Reselect the '+label+' CSV before rebuilding, or choose Clear '+label+' recording to remove that saved side. To change only notes, choose Update outcome notes.');
  }
}
