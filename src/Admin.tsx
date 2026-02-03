import { useEffect, useState } from "react";
import { adminGetJob, adminListJobs, adminPatchJob } from "./admin";

const STATUSES = ["NEW","FILES_RECEIVED","ANALYZING","IN_PROGRESS","DELIVERED","COMPLETE"];

export default function Admin() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ job:any; uploads:any[] } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    const r = await adminListJobs();
    setJobs(r.jobs || []);
  }

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    if (!active) { setDetail(null); return; }
    (async () => {
      try {
        const r = await adminGetJob(active);
        setDetail(r);
      } catch {
        setMsg("Admin access required (check ADMIN_EMAILS).");
      }
    })();
  }, [active]);

  async function updateStatus(status: string) {
    if (!active) return;
    await adminPatchJob(active, { status });
    setMsg("Updated.");
    await refresh();
    const r = await adminGetJob(active);
    setDetail(r);
  }

  async function saveNotes(notes: string) {
    if (!active) return;
    await adminPatchJob(active, { internal_notes: notes });
    setMsg("Notes saved.");
  }

  return (
    <div className="container">
      <div className="nav">
        <div className="brand">Down Dirty 84 Admin</div>
        <button className="secondary" onClick={()=>window.location.href="/dashboard"}>Customer View</button>
      </div>

      {msg && <div className="card" style={{marginBottom:12}}><p className="small">{msg}</p></div>}

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <div className="card">
          <h3 style={{marginTop:0}}>Jobs</h3>
          <p className="small">Newest first.</p>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {jobs.map(j => (
              <button key={j.id} className={j.id===active ? "" : "secondary"} onClick={()=>setActive(j.id)}>
                {String(j.created_at).slice(0,10)} - {j.service_type} - {j.status}
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 style={{marginTop:0}}>Job Detail</h3>
          {!detail && <p className="small">Select a job.</p>}
          {detail && (
            <>
              <p className="small"><b>ID:</b> {detail.job.id}</p>
              <p className="small"><b>User:</b> {detail.job.user_id}</p>
              <p className="small"><b>Service:</b> {detail.job.service_type}</p>
              <p className="small"><b>Status:</b> {detail.job.status}</p>

              <div className="row" style={{gap:8}}>
                {STATUSES.map(s => (
                  <button key={s} className="secondary" onClick={()=>updateStatus(s)}>{s}</button>
                ))}
              </div>

              <div style={{marginTop:12}}>
                <p className="small"><b>Uploads:</b> {detail.uploads.length}</p>
                <ul className="small">
                  {detail.uploads.map((u:any)=>(
                    <li key={u.id}>{u.filename} ({u.kind})</li>
                  ))}
                </ul>
              </div>

              <div style={{marginTop:12}}>
                <p className="small"><b>Internal notes</b> (saves on click-out)</p>
                <textarea
                  style={{width:"100%",minHeight:120,padding:12,borderRadius:12,border:"1px solid rgba(255,255,255,.08)",background:"rgba(255,255,255,.03)",color:"#e5e7eb"}}
                  defaultValue={detail.job.internal_notes || ""}
                  onBlur={(e)=>saveNotes(e.target.value)}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
