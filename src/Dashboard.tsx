import { useEffect, useMemo, useState } from "react";
import { apiGet, apiFetch } from "./client";
import { createJob, listJobs, analyzeJob, Job } from "./jobs";
import { uploadFile, listJobUploads } from "./uploads";

type Me = { id: string; email: string };

export default function Dashboard() {
  const [me, setMe] = useState<Me | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const activeJob = useMemo(() => jobs.find(j => j.id === activeJobId) || null, [jobs, activeJobId]);

  const [uploads, setUploads] = useState<any[]>([]);
  const [pendingUploadIds, setPendingUploadIds] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);

  const [form, setForm] = useState({
    serviceType: "LOG_REVIEW",
    platform: "GM",
    engineFamily: "LS",
    vehicle: "",
    ecu: "P01",
    notes: ""
  });

  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const u = await apiGet<Me>("/api/v1/me");
        setMe(u);
        const j = await listJobs();
        setJobs(j.jobs);
        if (j.jobs[0]) setActiveJobId(j.jobs[0].id);
      } catch {
        setStatusMsg("You are not logged in.");
      }
    })();
  }, []);

  useEffect(() => {
    if (!activeJobId) return;
    (async () => {
      const r = await listJobUploads(activeJobId);
      setUploads(r.uploads || []);
    })();
  }, [activeJobId]);

  async function logout() {
    await apiFetch("/api/v1/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  async function onCreateJob() {
    setStatusMsg(null);
    const res = await createJob(form);
    const newJob = res.job;
    setJobs([newJob, ...jobs]);
    setActiveJobId(newJob.id);
    setPendingUploadIds([]);
    setUploads([]);
    setStatusMsg("Job created. Upload your logs/files below.");
  }

  async function onUpload() {
    if (!file || !activeJobId) return;
    setStatusMsg("Uploading...");
    const r = await uploadFile({ file, jobId: activeJobId, kind: "LOG" });
    setPendingUploadIds(prev => [r.uploadId, ...prev]);
    const listed = await listJobUploads(activeJobId);
    setUploads(listed.uploads || []);
    setFile(null);
    setStatusMsg("Uploaded. You can upload more, then click Analyze.");
  }

  async function onAnalyze() {
    if (!activeJobId) return;
    if (pendingUploadIds.length === 0) {
      setStatusMsg("Upload at least one log/file first.");
      return;
    }
    setStatusMsg("Starting analysis...");
    const r = await analyzeJob(activeJobId, pendingUploadIds);
    setStatusMsg(`Analysis queued. Run ID: ${r.runId}`);
  }

  return (
    <div className="container">
      <div className="nav">
        <div className="brand">Down Dirty 84</div>
        <button className="secondary" onClick={logout}>Logout</button>
      </div>

      <div className="card" style={{marginBottom:14}}>
        <h2 style={{marginTop:0}}>Customer Dashboard</h2>
        {me && <p className="small">Logged in as: <b>{me.email}</b></p>}
        {statusMsg && <p className="small">{statusMsg}</p>}
      </div>

      <div className="grid2" style={{display:"grid",gridTemplateColumns:"1fr",gap:12}}>
        <div className="card">
          <h3 style={{marginTop:0}}>Create a Job</h3>
          <p className="small">Start a new request (log review or Stage 1 tune).</p>

          <div className="row">
            <label className="small" style={{minWidth:140}}>Service</label>
            <select value={form.serviceType} onChange={(e)=>setForm({...form, serviceType:e.target.value})}>
              <option value="LOG_REVIEW">Log Review</option>
              <option value="STAGE1_NA">Stage 1 NA</option>
              <option value="STAGE1_BOOST">Stage 1 Boosted</option>
            </select>
          </div>

          <div className="row">
            <label className="small" style={{minWidth:140}}>Platform</label>
            <select value={form.platform} onChange={(e)=>setForm({...form, platform:e.target.value})}>
              <option value="GM">GM</option>
              <option value="FORD">Ford</option>
              <option value="DODGE">Dodge</option>
            </select>
          </div>

          <div className="row">
            <label className="small" style={{minWidth:140}}>Engine family</label>
            <input value={form.engineFamily} onChange={(e)=>setForm({...form, engineFamily:e.target.value})} placeholder="LS, LT, Coyote" />
          </div>

          <div className="row">
            <label className="small" style={{minWidth:140}}>Vehicle</label>
            <input value={form.vehicle} onChange={(e)=>setForm({...form, vehicle:e.target.value})} placeholder="2015 Mustang GT, 2003 Silverado 5.3" />
          </div>

          <div className="row">
            <label className="small" style={{minWidth:140}}>ECU/PCM</label>
            <input value={form.ecu} onChange={(e)=>setForm({...form, ecu:e.target.value})} placeholder="P01, P59, Copperhead, GPEC..." />
          </div>

          <div className="row">
            <label className="small" style={{minWidth:140}}>Notes</label>
            <input value={form.notes} onChange={(e)=>setForm({...form, notes:e.target.value})} placeholder="Mods, fuel, goals, issues..." />
          </div>

          <div className="row">
            <button onClick={onCreateJob}>Create Job</button>
          </div>
        </div>

        <div className="card">
          <h3 style={{marginTop:0}}>Your Jobs</h3>
          <div className="row" style={{gap:8}}>
            {jobs.map(j => (
              <button
                key={j.id}
                className={j.id === activeJobId ? "" : "secondary"}
                onClick={()=>{ setActiveJobId(j.id); setPendingUploadIds([]); }}
              >
                {j.platform} {j.service_type} <span className="small">({j.status})</span>
              </button>
            ))}
          </div>

          {activeJob && (
            <div style={{marginTop:12}}>
              <p className="small"><b>Active job:</b> {activeJob.vehicle || activeJob.id}</p>

              <div className="row" style={{alignItems:"center"}}>
                <input type="file" onChange={(e)=>setFile(e.target.files?.[0] || null)} />
                <button onClick={onUpload} disabled={!file}>Upload File</button>
              </div>

              <p className="small">Uploaded files: {uploads.length}</p>

              <div className="row">
                <button onClick={onAnalyze} disabled={pendingUploadIds.length===0}>Analyze</button>
                <span className="small">Uploads selected for analysis: {pendingUploadIds.length}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
