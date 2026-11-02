import {useEffect,useRef,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {adminGetJob,adminListJobs,adminPatchJob,type AdminJob,type AdminDetail} from './adminApi';
import JobCases from './JobCases';
import NavigationGuard from './NavigationGuard';

const STATUSES=['NEW','FILES_RECEIVED','ANALYZING','IN_PROGRESS','DELIVERED','COMPLETE'];
export default function Admin(){
  const [search,setSearch]=useSearchParams(),active=search.get('job')?.toLowerCase()??null;
  const [jobs,setJobs]=useState<AdminJob[]>([]),[loadedDetail,setDetail]=useState<AdminDetail|null>(null);
  const detail=loadedDetail?.job.id===active?loadedDetail:null;
  const [error,setError]=useState(''),[msg,setMsg]=useState(''),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[reload,setReload]=useState(0);
  const [notes,setNotes]=useState('');
  const operation=useRef(false),alive=useRef(true),activeRef=useRef(active);activeRef.current=active;
  const dirty=!!detail&&notes!==(detail.job.internal_notes||'');
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{let current=true;setError('');adminListJobs().then(r=>{if(current)setJobs(r.jobs);}).catch(e=>{if(current)setError(e.message);});return()=>{current=false;};},[reload]);
  useEffect(()=>{
    let current=true;setDetail(null);setNotes('');setMsg('');setError('');setLoading(false);if(!active)return;
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(active)){setError('This job link is invalid. Select a job from the list.');return;}
    setLoading(true);adminGetJob(active).then(r=>{if(current){setDetail(r);setNotes(r.job.internal_notes||'');}}).catch(e=>{if(current)setError(e.message);}).finally(()=>{if(current)setLoading(false);});
    return()=>{current=false;};
  },[active,reload]);
  function choose(id:string){if(id===active)return;const next=new URLSearchParams(search);next.set('job',id);setSearch(next);}
  async function update(patch:{status?:string;internal_notes?:string}){
    if(!detail||operation.current)return false;const jobId=detail.job.id;operation.current=true;setBusy(true);setError('');setMsg('');
    try{await adminPatchJob(jobId,patch);if(!alive.current||activeRef.current!==jobId)return false;
      setDetail(previous=>previous?.job.id===jobId?{...previous,job:{...previous.job,...patch}}:previous);
      setJobs(previous=>previous.map(job=>job.id===jobId?{...job,...patch}:job));
      setMsg(patch.internal_notes!==undefined?'Internal notes saved.':'Job status updated.');
      return true;
    }catch(e){if(alive.current&&activeRef.current===jobId)setError(e instanceof Error?e.message:'Could not save. Your draft is still open.');return false;}
    finally{operation.current=false;if(alive.current)setBusy(false);}
  }
  return <div className="container"><div className="nav"><h1>Shop workspace</h1><div className="row"><Link to="/admin/queue">Review queue</Link><Link to="/dashboard">Customer view</Link></div></div>
    <NavigationGuard dirty={dirty} busy={busy} description="Your internal notes have unsaved changes. Save them before continuing, keep editing, or discard this draft." onDiscard={()=>setNotes(detail?.job.internal_notes||'')} onSave={()=>update({internal_notes:notes})}/>
    {error&&<div className="card" role="alert"><p>{error}</p><Link to="/login">Sign in</Link> · <button className="secondary" disabled={busy||dirty} onClick={()=>setReload(n=>n+1)}>Reload shop workspace</button></div>}
    {msg&&<p role="status">{msg}</p>}
    <div className="admin-grid"><section className="card"><h2>Jobs</h2><p>Up to 200 recent jobs, newest first. A direct job link also opens older jobs.</p><div className="case-history">{jobs.map(job=><button key={job.id} disabled={busy} aria-pressed={job.id===active} className={job.id===active?'':'secondary'} onClick={()=>choose(job.id)}>{job.vehicle||job.platform} · {job.service_type} · {job.status}</button>)}</div></section>
      <section className="card"><h2>Job detail</h2>{loading&&<p role="status">Loading job…</p>}{!loading&&!detail&&<p>Select a job.</p>}
        {detail&&<><p><strong>Vehicle:</strong> {detail.job.vehicle||'Not provided'} · {detail.job.id}</p><p><strong>Customer:</strong> {detail.job.customer_email}</p><p><strong>Status:</strong> {detail.job.status}</p>
          <div className="row">{STATUSES.map(status=><button key={status} disabled={busy} className="secondary" onClick={()=>void update({status})}>{status}</button>)}</div>
          <h3>Uploads</h3><ul>{detail.uploads.map(upload=><li key={upload.id}>{upload.filename} ({upload.kind})</li>)}</ul>
          <form onSubmit={event=>{event.preventDefault();void update({internal_notes:notes});}}><label htmlFor="internal-notes">Internal notes (visible only to DD84 admins)</label><textarea id="internal-notes" rows={5} maxLength={8000} disabled={busy} value={notes} onChange={e=>setNotes(e.target.value)}/><button disabled={busy||!dirty}>{busy?'Saving…':'Save internal notes'}</button>{dirty&&<p className="small">Unsaved notes. Leaving this page will ask you to save or discard them.</p>}</form>
          <JobCases key={detail.job.id} jobId={detail.job.id} vehicle={detail.job.vehicle||detail.job.platform} admin/>
        </>}
      </section></div>
  </div>;
}
