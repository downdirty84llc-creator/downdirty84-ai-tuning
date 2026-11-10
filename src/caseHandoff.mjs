import {caseReport} from '../products/dd84-desktop/troubleshooting.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function reference(value){
  if(!value||!uuid.test(value.jobId)||!uuid.test(value.caseId)||!['customer','shop'].includes(value.access))throw Error('This case link is incomplete or invalid. Open the saved snapshot from its job again.');
  return {jobId:value.jobId.toLowerCase(),caseId:value.caseId.toLowerCase(),access:value.access};
}
export function parseCaseHandoffSearch(search){
  const params=new URLSearchParams(search),keys=['job','case','access'];
  if(!keys.some(k=>params.has(k)))return null;
  if(keys.some(k=>params.getAll(k).length>1))throw Error('This case link contains conflicting identifiers. Open the saved snapshot from its job again.');
  return reference({jobId:params.get('job'),caseId:params.get('case'),access:params.get('access')??'customer'});
}
export function caseHandoffHref(value){const ref=reference(value);return '/troubleshoot?'+new URLSearchParams({job:ref.jobId,case:ref.caseId,access:ref.access});}
export function caseHandoffPath(value){const ref=reference(value);return `/api/v1/${ref.access==='shop'?'admin/':''}jobs/${ref.jobId}/troubleshooting-cases/${ref.caseId}`;}
export function readHandoffSnapshot(value,requested){
  const ref=reference(requested),saved=value?.case;
  if(!saved||saved.jobId!==ref.jobId||saved.id!==ref.caseId)throw Error('The returned snapshot does not match the requested job and case. Nothing was opened.');
  if(typeof saved.sha256!=='string'||!/^[a-f0-9]{64}$/.test(saved.sha256)||typeof saved.createdAt!=='string'||!Number.isFinite(Date.parse(saved.createdAt)))throw Error('The saved snapshot metadata is invalid. Nothing was opened.');
  return {id:saved.id,jobId:saved.jobId,createdAt:saved.createdAt,sha256:saved.sha256,report:caseReport(saved.report)};
}
