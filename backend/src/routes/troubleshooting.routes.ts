import {Router,type Request,type Response} from 'express';
import {validate as validUuid} from 'uuid';
import {requireAuth} from '../middleware/session.js';
import {requireAdmin} from '../middleware/admin.js';
import {getJob} from '../services/jobs/jobs.repo.js';
import {adminGetJob} from '../services/admin/admin.repo.js';
import {addCase,getCase,listCases,type CaseRow} from '../services/troubleshooting/cases.repo.js';
import {canonicalCase} from '../services/troubleshooting/cases.js';
import {badRequest,notFound,wrap} from '../util/http.js';

export const troubleshootingRouter=Router();
const customerPath='/jobs/:jobId/troubleshooting-cases';
const adminPath='/admin/jobs/:jobId/troubleshooting-cases';
const detail=(row:CaseRow)=>({id:row.id,jobId:row.job_id,createdAt:row.created_at,report:row.report,sha256:row.sha256});
async function accessibleJob(req:Request,res:Response,admin:boolean) {
  if(!validUuid(req.params.jobId)){badRequest(res,'Invalid job ID.');return null;}
  const job=admin?await adminGetJob(req.params.jobId):await getJob(req.user!.id,req.params.jobId);
  if(!job){notFound(res,'Job not found.');return null;}
  return job;
}
function list(admin:boolean) {return wrap(async(req,res)=>{
  const job=await accessibleJob(req,res,admin);if(!job)return;
  const before=req.query.before;
  if(before!==undefined&&(typeof before!=='string'||!validUuid(before)))return badRequest(res,'Invalid history cursor.');
  if(typeof before==='string'&&!await getCase(job.id,job.user_id,before))return badRequest(res,'History cursor does not belong to this job.');
  const rows=await listCases(job.id,job.user_id,typeof before==='string'?before:null),page=rows.slice(0,20);
  res.set('Cache-Control','no-store');
  return res.json({cases:page.map(row=>({id:row.id,createdAt:row.created_at,caseName:row.report.context.caseName,
    vehicle:row.report.context.vehicle,issueId:row.report.issueId,status:row.report.assessment.status,
    concerns:row.report.assessment.concerns.length,missing:row.report.assessment.missing.length})),nextBefore:rows.length>20?page.at(-1)!.id:null});
});}
function read(admin:boolean){return wrap(async(req,res)=>{
  const job=await accessibleJob(req,res,admin);if(!job)return;
  if(!validUuid(req.params.caseId))return badRequest(res,'Invalid case ID.');
  const row=await getCase(job.id,job.user_id,req.params.caseId);
  if(!row)return notFound(res,'Case not found.');
  res.set('Cache-Control','no-store');return res.json({case:detail(row)});
});}
troubleshootingRouter.get(customerPath,requireAuth,list(false));
troubleshootingRouter.get(customerPath+'/:caseId',requireAuth,read(false));
troubleshootingRouter.get(adminPath,requireAuth,requireAdmin,list(true));
troubleshootingRouter.get(adminPath+'/:caseId',requireAuth,requireAdmin,read(true));
troubleshootingRouter.post(customerPath,requireAuth,wrap(async(req,res)=>{
  const job=await accessibleJob(req,res,false);if(!job)return;
  if(!req.is('application/json'))return res.status(415).json({message:'Send a JSON troubleshooting case.'});
  const body=req.body;
  if(!body||Array.isArray(body)||typeof body.requestId!=='string'||!validUuid(body.requestId)||Object.keys(body).some(k=>!['requestId','report'].includes(k)))return badRequest(res,'A request ID and troubleshooting report are required.');
  let normalized;
  try{normalized=canonicalCase(body.report);}catch(error){return badRequest(res,(error as Error).message);}
  const result=await addCase(job.id,req.user!.id,body.requestId,normalized.report,normalized.sha256);
  if(!result.row)return notFound(res,'Job not found.');
  if(result.row.sha256!==normalized.sha256)return res.status(409).json({message:'This submission ID was already used for a different case. Choose the file again to create a new snapshot.'});
  res.set('Cache-Control','no-store');return res.status(result.created?201:200).json({case:detail(result.row)});
}));
