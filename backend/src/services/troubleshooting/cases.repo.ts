import {query} from '../../db.js';
import type {CaseReport} from '../../../shared/troubleshooting.mjs';

export type CaseRow={id:string;job_id:string;submitted_by:string;request_id:string;report:CaseReport;sha256:string;created_at:string};
export async function addCase(jobId:string,userId:string,requestId:string,report:CaseReport,sha256:string) {
  const rows=await query<CaseRow>(`INSERT INTO troubleshooting_cases(job_id,submitted_by,request_id,report,sha256)
    SELECT id,$2,$3,$4::jsonb,$5 FROM jobs WHERE id=$1 AND user_id=$2
    ON CONFLICT (job_id,request_id) DO NOTHING RETURNING *`,[jobId,userId,requestId,JSON.stringify(report),sha256]);
  if(rows[0])return {row:rows[0],created:true};
  const existing=await query<CaseRow>(`SELECT c.* FROM troubleshooting_cases c JOIN jobs j ON j.id=c.job_id
    WHERE c.job_id=$1 AND j.user_id=$2 AND c.request_id=$3`,[jobId,userId,requestId]);
  return {row:existing[0]??null,created:false};
}
export async function getCase(jobId:string,ownerId:string,caseId:string) {
  const rows=await query<CaseRow>(`SELECT c.* FROM troubleshooting_cases c JOIN jobs j ON j.id=c.job_id
    WHERE c.job_id=$1 AND j.user_id=$2 AND c.id=$3`,[jobId,ownerId,caseId]);
  return rows[0]??null;
}
export async function listCases(jobId:string,ownerId:string,before:string|null) {
  // Resolve the cursor in SQL to retain Postgres timestamp precision at page boundaries.
  return query<CaseRow>(`SELECT c.* FROM troubleshooting_cases c JOIN jobs j ON j.id=c.job_id
    WHERE c.job_id=$1 AND j.user_id=$2 AND ($3::uuid IS NULL OR (c.created_at,c.id)<
      (SELECT created_at,id FROM troubleshooting_cases WHERE id=$3 AND job_id=$1))
    ORDER BY c.created_at DESC,c.id DESC LIMIT 21`,[jobId,ownerId,before]);
}
