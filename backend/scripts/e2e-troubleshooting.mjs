import {randomUUID} from 'node:crypto';
import {blankCase,caseReport} from '../shared/troubleshooting.mjs';
import {canonicalCase} from '../dist/services/troubleshooting/cases.js';

// Called by the pipeline against its disposable Postgres and synthetic users.
export async function testTroubleshooting({req,psql,check,jobId,foreignJob,otherOwnedJob,OWNER,ADMIN}) {
  console.log('── job troubleshooting snapshots and shop notes');
  const base=`/api/v1/jobs/${jobId}/troubleshooting-cases`,adminBase=`/api/v1/admin/jobs/${jobId}/troubleshooting-cases`;
  const report=blankCase();report.context.caseName='Synthetic pressure case';report.context.vehicle='Synthetic vehicle';report.relationship='mismatch';
  const expected=caseReport(report),requestId=randomUUID();
  const body={requestId,report:{...report,assessment:{status:'READY_FOR_HUMAN_REVIEW'},sources:[{url:'javascript:alert(1)'}]}};
  const stateBefore=psql(`SELECT status FROM jobs WHERE id='${jobId}';`);
  check('case history requires sign-in',(await req('GET',base)).status,401);
  check('customer cannot read another owner history',(await req('GET',`/api/v1/jobs/${foreignJob}/troubleshooting-cases`,{token:OWNER})).status,404);
  check('customer cannot write another owner case',(await req('POST',`/api/v1/jobs/${foreignJob}/troubleshooting-cases`,{token:OWNER,body})).status,404);
  check('customer cannot use shop case history',(await req('GET',adminBase,{token:OWNER})).status,403);
  const results=await Promise.all([req('POST',base,{token:OWNER,body}),req('POST',base,{token:OWNER,body})]);
  check('concurrent duplicate creates once',results.map(r=>r.status).sort().join(','),'200,201');
  const saved=results[0].json?.case;
  check('retry returns same snapshot',saved?.id,results[1].json?.case?.id);
  check('only one snapshot persisted',psql(`SELECT count(*) FROM troubleshooting_cases WHERE job_id='${jobId}';`),1);
  check('server assesses concerns independently',saved?.report?.assessment?.status,'CONCERNS_RECORDED');
  check('server replaces imported source claims',saved?.report?.sources.map(source=>source.url).join(','),expected.sources.map(source=>source.url).join(','));
  check('stored jsonb retains the canonical fingerprint',canonicalCase(saved.report).sha256,saved.sha256);
  check('reopened report preserves all normalized fields',canonicalCase(saved.report).sha256,canonicalCase(expected).sha256);
  check('case has no job-status side effect',psql(`SELECT status FROM jobs WHERE id='${jobId}';`),stateBefore);
  check('case cannot start analysis',psql('SELECT count(*) FROM runs;'),0);
  check('case cannot release a tune',psql('SELECT count(*) FROM diffsets;'),0);
  check('case cannot create an upload',psql('SELECT count(*) FROM uploads;'),1);
  check('table enables RLS for direct API roles',psql("SELECT relrowsecurity FROM pg_class WHERE oid='troubleshooting_cases'::regclass;"),'t');
  const id=saved.id;
  check('owner reads saved case',(await req('GET',`${base}/${id}`,{token:OWNER})).status,200);
  check('shop reads customer case',(await req('GET',`${adminBase}/${id}`,{token:ADMIN})).json?.case?.id,id);
  check('admin cannot write through another owner endpoint',(await req('POST',base,{token:ADMIN,body})).status,404);
  for(const prefix of ['/api/v1/jobs/','/api/v1/admin/jobs/']){
    const token=prefix.includes('/admin/')?ADMIN:OWNER;
    check('case ID must belong to the exact requested job '+prefix,(await req('GET',`${prefix}${otherOwnedJob}/troubleshooting-cases/${id}`,{token})).status,404);
    check('cursor must belong to the requested job '+prefix,(await req('GET',`${prefix}${otherOwnedJob}/troubleshooting-cases?before=${id}`,{token})).status,400);
  }
  check('same request ID with changed evidence conflicts',(await req('POST',base,{token:OWNER,body:{requestId,report:{...report,relationship:'unknown'}}})).status,409);
  for(const invalid of [{report},{requestId:'invalid',report},{requestId:randomUUID(),report:{...report,catalogVersion:'future'}},{requestId:randomUUID(),report:{...report,untrusted:'🚗'.repeat(33000)}},{requestId:randomUUID(),report,jobId:foreignJob}])
    check('invalid case submission rejected',(await req('POST',base,{token:OWNER,body:invalid})).status,400);
  check('invalid job ID rejected',(await req('GET','/api/v1/jobs/no/troubleshooting-cases',{token:OWNER})).status,400);
  check('invalid cursor rejected',(await req('GET',base+'?before=bad',{token:OWNER})).status,400);
  check('case snapshots cannot be patched',(await req('PATCH',`${base}/${id}`,{token:OWNER,body:{report}})).status,404);
  check('case snapshots cannot be deleted',(await req('DELETE',`${base}/${id}`,{token:OWNER})).status,404);
  // Equal timestamps exercise the ID tie-break; microseconds exercise SQL cursor precision.
  const inserted=await Promise.all(Array.from({length:21},()=>req('POST',base,{token:OWNER,body:{requestId:randomUUID(),report}})));
  check('additional snapshots accepted',inserted.every(r=>r.status===201),true);
  psql(`UPDATE troubleshooting_cases SET created_at='2026-10-26 12:00:00.123456+00' WHERE job_id='${jobId}';`);
  const first=(await req('GET',base,{token:OWNER})).json,second=(await req('GET',base+'?before='+first.nextBefore,{token:OWNER})).json;
  check('first history page bounded',first.cases.length,20);
  check('last history page complete',second.cases.length,2);
  check('history pagination neither skips nor repeats',new Set([...first.cases,...second.cases].map(row=>row.id)).size,22);
  check('last history cursor empty',second.nextBefore,null);
  check('list metadata omits evidence text',first.cases.some(row=>'report' in row||'checks' in row),false);
  check('shop gets the same first page',(await req('GET',adminBase,{token:ADMIN})).json?.cases.map(row=>row.id).join(','),first.cases.map(row=>row.id).join(','));

  const shop=`/api/v1/admin/jobs/${jobId}`;
  check('customer cannot change internal notes',(await req('PATCH',shop,{token:OWNER,body:{internal_notes:'blocked'}})).status,403);
  check('shop saves internal notes',(await req('PATCH',shop,{token:ADMIN,body:{internal_notes:'Synthetic notes retained'}})).status,200);
  check('customer detail excludes shop-only notes',Object.hasOwn((await req('GET',`/api/v1/jobs/${jobId}`,{token:OWNER})).json.job,'internal_notes'),false);
  check('customer list excludes shop-only notes',(await req('GET','/api/v1/jobs',{token:OWNER})).json.jobs.some(job=>Object.hasOwn(job,'internal_notes')),false);
  check('shop changes status only',(await req('PATCH',shop,{token:ADMIN,body:{status:'IN_PROGRESS'}})).status,200);
  check('status update preserves internal notes',(await req('GET',shop,{token:ADMIN})).json?.job?.internal_notes,'Synthetic notes retained');
  check('shop explicitly clears notes',(await req('PATCH',shop,{token:ADMIN,body:{internal_notes:''}})).status,200);
  check('notes cleared only explicitly',(await req('GET',shop,{token:ADMIN})).json?.job?.internal_notes,'');
  for(const patch of [{status:'BOGUS'},{internal_notes:null},{internal_notes:'x'.repeat(8001)},{}])check('invalid shop patch rejected',(await req('PATCH',shop,{token:ADMIN,body:patch})).status,400);
  check('missing shop job is 404',(await req('PATCH',`/api/v1/admin/jobs/${randomUUID()}`,{token:ADMIN,body:{status:'NEW'}})).status,404);
  await req('PATCH',shop,{token:ADMIN,body:{status:stateBefore}});
}
