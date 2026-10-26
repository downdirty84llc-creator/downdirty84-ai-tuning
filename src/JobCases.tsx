import {useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {apiGet,apiPost} from './client';
import {caseReport,parseCase,fields,issues,commonChecks,type CaseReport} from '../backend/shared/troubleshooting.mjs';

type Summary={id:string;createdAt:string;caseName:string;vehicle:string;issueId:string;status:string;concerns:number;missing:number};
type SavedCase={id:string;jobId:string;createdAt:string;report:CaseReport;sha256:string};
type Page={cases:Summary[];nextBefore:string|null};
const statusLabel=(status:string)=>status==='CONCERNS_RECORDED'?'Concerns recorded':status==='NEEDS_INFORMATION'?'More evidence needed':'Prepared for human review';

function CaseDetails({report}:{report:CaseReport}) {
  const issue=issues.find(i=>i.id===report.issueId)!;
  return <div className="case-details">
    <h3>{issue.title}</h3>
    <p><strong>{statusLabel(report.assessment.status)}</strong> · Operator statements; human review required.</p>
    <dl className="case-context">{fields.map(([key,label])=><div key={key}><dt>{label}</dt><dd>{report.context[key]||'Not provided'}</dd></div>)}</dl>
    <p><strong>Tune / log relationship:</strong> {report.relationship==='confirmed'?'Confirmed by the operator':report.relationship==='mismatch'?'The tune and log differ':'Not confirmed'}</p>
    <details><summary>Recorded checks and evidence</summary>{[...commonChecks,...issue.checks].map(check=><section key={check.id}><h4>{check.label}</h4><p>{({unknown:'Not checked',checked:'Checked',issue:'Concern found',na:'Not applicable'})[report.checks[check.id]?.status??'unknown']}</p><p>{report.checks[check.id]?.note||'No evidence or explanation recorded.'}</p></section>)}</details>
    {report.assessment.concerns.length>0&&<><h4>Concerns to resolve</h4><ul>{report.assessment.concerns.map(item=><li key={item}>{item}</li>)}</ul></>}
    {report.assessment.missing.length>0&&<><h4>Information still needed</h4><ul>{report.assessment.missing.map(item=><li key={item}>{item}</li>)}</ul></>}
    <p><strong>Suggested next step:</strong> {report.assessment.next}</p>
    <details><summary>Sources and limits</summary><p>{report.assessment.notice}</p><ul>{report.sources.map(source=><li key={source.id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a> · {source.kind}</li>)}</ul></details>
  </div>;
}

export default function JobCases({jobId,vehicle,admin=false}:{jobId:string;vehicle:string;admin?:boolean}) {
  const base=`/api/v1/${admin?'admin/':''}jobs/${jobId}/troubleshooting-cases`;
  const [rows,setRows]=useState<Summary[]>([]),[nextBefore,setNextBefore]=useState<string|null>(null);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[expired,setExpired]=useState(false),[message,setMessage]=useState('');
  const [prepared,setPrepared]=useState<{report:CaseReport;requestId:string;filename:string}|null>(null),[confirmed,setConfirmed]=useState(false),[opened,setOpened]=useState<SavedCase|null>(null);
  const alive=useRef(true),operation=useRef(false),listRequest=useRef(0),fileRequest=useRef(0),input=useRef<HTMLInputElement>(null);
  function failure(error:unknown){if(!alive.current)return;setExpired((error as {status?:number})?.status===401);setError(error instanceof Error?error.message:'The request failed. Your file is still available locally.');}
  async function history(before:string|null=null){
    const request=++listRequest.current;setLoading(true);setError('');
    try{const data=await apiGet<Page>(base+(before?`?before=${before}`:''));if(!alive.current||request!==listRequest.current)return;
      setRows(previous=>before?[...previous,...data.cases.filter(row=>!previous.some(old=>old.id===row.id))]:data.cases);setNextBefore(data.nextBefore);setExpired(false);
    }catch(error){if(request===listRequest.current)failure(error);}finally{if(alive.current&&request===listRequest.current)setLoading(false);}
  }
  useEffect(()=>{alive.current=true;void history();return()=>{alive.current=false;listRequest.current++;fileRequest.current++;};},[base]);
  async function perform(action:()=>Promise<void>){if(operation.current)return;operation.current=true;setBusy(true);setError('');setMessage('');try{await action();}catch(error){failure(error);}finally{operation.current=false;if(alive.current)setBusy(false);}}
  async function choose(file:File|undefined){
    const request=++fileRequest.current;setConfirmed(false);setPrepared(null);setOpened(null);setMessage('');setError('');if(!file)return;
    try{if(file.size>128*1024)throw Error('Choose a saved DD84 troubleshooting JSON file smaller than 128 KiB.');
      const report=caseReport(parseCase(await file.text()));if(!alive.current||request!==fileRequest.current)return;
      setPrepared({report,requestId:crypto.randomUUID(),filename:file.name});
    }catch(error){if(request===fileRequest.current)failure(error);}
  }
  async function attach(){if(!prepared||!confirmed)return;const snapshot=prepared;
    await perform(async()=>{const result=await apiPost<{case:SavedCase}>(base,{requestId:snapshot.requestId,report:snapshot.report});if(!alive.current)return;
      setOpened(result.case);setPrepared(null);setConfirmed(false);if(input.current)input.current.value='';
      setMessage('Case attached to this job and available to DD84 reviewers. The saved snapshot will not change when you edit a local copy.');await history();
    });
  }
  async function open(id:string){await perform(async()=>{const result=await apiGet<{case:SavedCase}>(`${base}/${id}`);if(alive.current){setOpened(result.case);setMessage('Saved snapshot opened. This is operator evidence, not calibration approval.');}});}
  function download(){if(!opened)return;const url=URL.createObjectURL(new Blob([JSON.stringify(opened.report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`DD84-case-${opened.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);setMessage('Download requested. Check your Downloads folder before closing this snapshot.');}
  return <section className="job-cases card" aria-label="Job troubleshooting cases">
    <p className="eyebrow">DD84 / CASE HISTORY</p><h2>Troubleshooting cases</h2>
    <p><strong>Job:</strong> {vehicle||'Vehicle not provided'} <span className="small">· {jobId}</span></p>
    <p>Keep the symptom, checks and next action with the job. Attaching a case does not start an analysis or release a tune.</p>
    {!admin&&<><p><Link to="/troubleshoot">Prepare a case</Link> or use a saved case from Windows Studio 0.28. Save its JSON, then choose it here.</p>
      <label htmlFor="job-case-file">Choose a saved troubleshooting case (JSON, up to 128 KiB)</label><input ref={input} id="job-case-file" type="file" accept=".json,application/json" disabled={busy} onChange={e=>void choose(e.target.files?.[0])}/>
      {prepared&&<section className="case-preview" aria-label="Case attachment preview"><h3>Review before sharing</h3><p>{prepared.filename}</p><CaseDetails report={prepared.report}/>
        <label className="case-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>These case details belong to this job. Share this snapshot with DD84 reviewers.</label>
        <button disabled={!confirmed||busy} onClick={()=>void attach()}>{busy?'Attaching…':'Attach case to this job'}</button>
        <p className="small">Failed requests keep the selected snapshot ready to retry. Original tune and log files need separate uploads.</p>
      </section>}
    </>}
    {message&&<p role="status">{message}</p>}
    {error&&<div role="alert"><p>{error}</p>{expired?<Link to="/login">Sign in again</Link>:<button className="secondary" disabled={loading||busy} onClick={()=>void history()}>Reload case history</button>}</div>}
    <h3>Saved snapshots</h3>{loading&&<p role="status">Loading case history…</p>}
    {!loading&&!error&&!rows.length&&<p>No troubleshooting cases attached yet.</p>}
    <ul className="case-history">{rows.map(row=><li key={row.id}><button className="secondary" disabled={busy} onClick={()=>void open(row.id)}>{row.caseName||'Untitled case'} · {new Date(row.createdAt).toLocaleString()}</button><p>{issues.find(issue=>issue.id===row.issueId)?.title??row.issueId} · {statusLabel(row.status)} · {row.concerns} concerns · {row.missing} missing items</p></li>)}</ul>
    {nextBefore&&<button className="secondary" disabled={loading||busy} onClick={()=>void history(nextBefore)}>Load older cases</button>}
    {opened&&<section className="case-snapshot" aria-label="Saved case snapshot"><h3>Saved case snapshot</h3><p>Attached {new Date(opened.createdAt).toLocaleString()} · {opened.id}</p><button className="secondary" onClick={download}>Download saved case</button><CaseDetails report={opened.report}/><details><summary>Snapshot fingerprint</summary><p className="case-fingerprint">SHA-256: {opened.sha256}</p><p className="small">Identifies the saved JSON snapshot; it does not verify the vehicle or the operator's statements.</p></details></section>}
  </section>;
}
