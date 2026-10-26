import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import AnalysisStatus from "./AnalysisStatus";
import { apiGet, apiFetch } from "./client";
import { createJob, listJobs, analyzeJob, Job } from "./jobs";
import { uploadFile, listJobUploads, JobUpload } from "./uploads";

type Me = { id: string; email: string };

export default function Dashboard() {
  const [me, setMe] = useState<Me | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const activeJob = useMemo(() => jobs.find(j => j.id === activeJobId) || null, [jobs, activeJobId]);

  const [uploads, setUploads] = useState<JobUpload[]>([]);
  const [pendingUploadIds, setPendingUploadIds] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);

  const [form, setForm] = useState({
    serviceType: "LOG_REVIEW",
    platform: "GM",
    engineFamily: "LS",
    vehicle: "",
    ecu: "",
    notes: "",
    // Blank means "not stated". The analysis then measures against the
    // strictest values across every profile and says so, rather than assuming
    // naturally-aspirated gasoline.
    fuel: "",
    induction: ""
  });

  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [reload, setReload] = useState(0);
  const [uploadReload, setUploadReload] = useState(0);
  const [signedOut, setSignedOut] = useState(false);
  const [analysisRefresh, setAnalysisRefresh] = useState(0);

  function reportError(e: unknown) {
    const expired = (e as {status?:number})?.status === 401;
    if (expired) setSignedOut(true);
    setError(expired ? "Your session has expired. Sign in again to continue." : e instanceof Error ? e.message : "The request failed. Please retry.");
    setStatusMsg(null);
  }
  async function perform(name: string, action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(name); setError(null); setStatusMsg(null);
    try { await action(); } catch (e) { reportError(e); }
    finally { busyRef.current = false; setBusy(null); }
  }

  useEffect(() => {
    let current = true;
    setLoading(true); setError(null); setSignedOut(false);
    (async () => {
      try {
        const u = await apiGet<Me>("/api/v1/me");
        const j = await listJobs();
        if (!current) return;
        setMe(u);
        setJobs(j.jobs);
        if (j.jobs[0]) setActiveJobId(j.jobs[0].id);
      } catch (e) { if (current) reportError(e); }
      finally { if (current) setLoading(false); }
    })();
    return () => { current = false; };
  }, [reload]);

  useEffect(() => {
    let current = true;
    setUploads([]); setPendingUploadIds([]); setFile(null);
    if (fileInput.current) fileInput.current.value = "";
    if (!activeJobId) return;
    setError(null);
    setUploadLoading(true);
    (async () => {
      try {
        const r = await listJobUploads(activeJobId);
        if (current) setUploads(r.uploads || []);
      } catch (e) { if (current) reportError(e); }
      finally { if (current) setUploadLoading(false); }
    })();
    return () => { current = false; };
  }, [activeJobId, uploadReload]);

  async function logout() {
    await perform("logout", async () => {
      await apiFetch("/api/v1/auth/logout", { method: "POST" });
      window.location.href = "/login";
    });
  }

  async function onCreateJob() {
    await perform("create", async () => {
    const res = await createJob(form);
    const newJob = res.job;
    setJobs(prev => [newJob, ...prev]);
    setActiveJobId(newJob.id);
    setPendingUploadIds([]);
    setUploads([]);
    setStatusMsg("Job created. Upload your logs/files below.");
    });
  }

  async function onUpload() {
    if (!file || !activeJobId) return;
    if (file.size > 50 * 1024 * 1024) { setError("Choose a file smaller than 50 MiB."); return; }
    await perform("upload", async () => {
    setStatusMsg("Uploading...");
    const r = await uploadFile({ file, jobId: activeJobId, kind: "LOG" });
    setPendingUploadIds(prev => [r.uploadId, ...prev]);
    setUploads(prev => [{id:r.uploadId, filename:r.filename, kind:"LOG", size_bytes:r.sizeBytes, created_at:new Date().toISOString()}, ...prev]);
    setFile(null);
    if (fileInput.current) fileInput.current.value = "";
    setStatusMsg("Uploaded. You can upload more, then click Analyze.");
    });
  }

  async function onAnalyze() {
    if (!activeJobId) return;
    if (pendingUploadIds.length === 0) {
      setStatusMsg("Upload at least one log/file first.");
      return;
    }
    await perform("analyze", async () => {
    setStatusMsg("Starting analysis...");
    const r = await analyzeJob(activeJobId, pendingUploadIds);
    setAnalysisRefresh(n=>n+1);
    setStatusMsg(`Analysis queued. Run ID: ${r.runId}. DD84 will review the result before releasing a change list.`);
    });
  }

  return (
    <div className="container">
      <div className="nav">
        <Link to="/troubleshoot">Prepare a troubleshooting handoff →</Link>
        {me && <button className="secondary" disabled={!!busy} onClick={logout}>Sign out</button>}
      </div>

      <div className="card" style={{marginBottom:14}}>
        <p className="eyebrow">DD84 / MY WORKSPACE</p><h1 style={{marginTop:0}}>Your tuning jobs</h1>
        {me && <p className="small">Logged in as: <b>{me.email}</b></p>}
        {loading && <p role="status">Loading your jobs…</p>}
        {statusMsg && <p role="status">{statusMsg}</p>}
        {error && <div role="alert"><p>{error}</p>{signedOut ? <Link to="/login">Sign in →</Link> : <button disabled={!!busy || loading} onClick={()=>me ? setUploadReload(n=>n+1) : setReload(n=>n+1)}>Reload workspace</button>}</div>}
      </div>

      {me && !signedOut && <div className="grid2" style={{display:"grid",gridTemplateColumns:"1fr",gap:12}}>
        <div className="card">
          <h3 style={{marginTop:0}}>Create a Job</h3>
          <p className="small">Start a new request (log review or Stage 1 tune).</p>
          <fieldset disabled={!!busy || loading} className="job-fields"><legend>Vehicle and request</legend>

          <div className="row">
            <label className="small" style={{minWidth:140}} htmlFor="job-serviceType">Service</label>
            <select id="job-serviceType" value={form.serviceType} onChange={(e)=>setForm({...form, serviceType:e.target.value})}>
              <option value="LOG_REVIEW">Log Review</option>
              <option value="STAGE1_NA">Stage 1 NA</option>
              <option value="STAGE1_BOOST">Stage 1 Boosted</option>
            </select>
          </div>

          <div className="row">
            <label className="small" style={{minWidth:140}} htmlFor="job-platform">Platform</label>
            <select id="job-platform" value={form.platform} onChange={(e)=>setForm({...form, platform:e.target.value})}>
              <option value="GM">GM</option>
              <option value="FORD">Ford</option>
              <option value="DODGE">Dodge</option>
            </select>
          </div>

          <div className="row">
            <label className="small" style={{minWidth:140}} htmlFor="job-engineFamily">Engine family</label>
            <input id="job-engineFamily" value={form.engineFamily} onChange={(e)=>setForm({...form, engineFamily:e.target.value})} placeholder="LS, LT, Coyote" />
          </div>

          <div className="row">
            <label className="small" style={{minWidth:140}} htmlFor="job-vehicle">Vehicle</label>
            <input id="job-vehicle" value={form.vehicle} onChange={(e)=>setForm({...form, vehicle:e.target.value})} placeholder="2015 Mustang GT, 2003 Silverado 5.3" />
          </div>

          <div className="row">
            <label className="small" style={{minWidth:140}} htmlFor="job-fuel">Fuel</label>
            <select id="job-fuel" value={form.fuel} onChange={(e)=>setForm({...form, fuel:e.target.value})}>
              <option value="">Not sure</option>
              <option value="GASOLINE">Gasoline</option>
              <option value="E85">E85</option>
            </select>
          </div>

          <div className="row">
            <label className="small" style={{minWidth:140}} htmlFor="job-induction">Induction</label>
            <select id="job-induction" value={form.induction} onChange={(e)=>setForm({...form, induction:e.target.value})}>
              <option value="">Not sure</option>
              <option value="NA">Naturally aspirated</option>
              <option value="FORCED">Turbo / supercharged</option>
            </select>
          </div>

          <p className="small" style={{opacity:.7,marginTop:0}}>
            Fuel and induction pick which safety thresholds your log is judged
            against. Leave either blank if you are not certain — we then use the
            most cautious numbers and say so on the report.
          </p>

          <div className="row">
            <label className="small" style={{minWidth:140}} htmlFor="job-ecu">ECU/PCM</label>
            <input id="job-ecu" value={form.ecu} onChange={(e)=>setForm({...form, ecu:e.target.value})} placeholder="P01, P59, Copperhead, GPEC..." />
          </div>

          <div className="row">
            <label className="small" style={{minWidth:140}} htmlFor="job-notes">Notes</label>
            <input id="job-notes" value={form.notes} onChange={(e)=>setForm({...form, notes:e.target.value})} placeholder="Mods, fuel, goals, issues..." />
          </div>

          <div className="row">
            <button onClick={onCreateJob}>{busy === "create" ? "Creating…" : "Create job"}</button>
          </div>
          </fieldset>
        </div>

        <div className="card">
          <h3 style={{marginTop:0}}>Your Jobs</h3>
          <div className="row" style={{gap:8}}>
            {jobs.map(j => (
              <button
                key={j.id}
                disabled={!!busy}
                aria-pressed={j.id === activeJobId}
                className={j.id === activeJobId ? "" : "secondary"}
                onClick={()=>{ setActiveJobId(j.id); setPendingUploadIds([]); }}
              >
                {j.vehicle || j.platform} · {j.service_type.replaceAll("_", " ")} <span>({j.status})</span>
              </button>
            ))}
          </div>
          {!jobs.length && <p>No jobs yet. Create your first request above.</p>}

          {activeJob && (
            <div style={{marginTop:12}}>
              <p className="small"><b>Active job:</b> {activeJob.vehicle || activeJob.id}</p>

              <div className="row" style={{alignItems:"center"}}>
                <label htmlFor="job-upload">Choose a log or supporting file (up to 50 MiB)</label>
                <input id="job-upload" ref={fileInput} type="file" disabled={!!busy || uploadLoading} onChange={(e)=>setFile(e.target.files?.[0] || null)} />
                <button onClick={onUpload} disabled={!file || !!busy || uploadLoading}>{busy === "upload" ? "Uploading…" : "Upload file"}</button>
              </div>

              {uploadLoading ? <p role="status">Loading files…</p> : <><p>Select the logs recorded with this job's calibration. Only readable logs can be analyzed; native tune files are supporting evidence.</p><ul className="upload-list">{uploads.map(u => <li key={u.id}><label><input type="checkbox" disabled={!!busy} checked={pendingUploadIds.includes(u.id)} onChange={e=>setPendingUploadIds(prev=>e.target.checked ? [...prev,u.id] : prev.filter(id=>id!==u.id))}/><span>{u.filename}<small>{u.size_bytes === null ? "Size unavailable" : `${Math.ceil(u.size_bytes/1024)} KiB`}</small></span></label></li>)}</ul>{!uploads.length && <p className="small">No files uploaded for this job yet.</p>}</>}

              <div className="row">
                <button onClick={onAnalyze} disabled={pendingUploadIds.length===0 || !!busy || uploadLoading}>{busy === "analyze" ? "Starting…" : "Analyze selected logs"}</button>
                <span className="small">Uploads selected for analysis: {pendingUploadIds.length}</span>
              </div>
              <AnalysisStatus key={activeJob.id} jobId={activeJob.id} refresh={analysisRefresh}/>
            </div>
          )}
        </div>
      </div>}
    </div>
  );
}
