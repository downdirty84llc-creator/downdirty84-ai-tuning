import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { apiGet, apiFetch } from "./client";
import { createJob, listJobs, Job } from "./jobs";

type Me = { id: string; email: string };

export default function Dashboard() {
  const navigate = useNavigate();
  const [me, setMe] = useState<Me | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);

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
      } catch {
        setStatusMsg("You are not logged in.");
      }
    })();
  }, []);

  async function logout() {
    await apiFetch("/api/v1/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  async function onCreateJob() {
    setStatusMsg(null);
    try {
      const res = await createJob(form);
      const newJob = res.job;
      setJobs([newJob, ...jobs]);
      setStatusMsg("Job created. Opening job dashboard...");
      navigate(`/dashboard/${newJob.id}`);
    } catch {
      setStatusMsg("Could not create job. Please try again.");
    }
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
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {jobs.map(j => (
              <Link key={j.id} to={`/dashboard/${j.id}`} style={{textDecoration:"none"}}>
                <button className="secondary" style={{width:"100%",textAlign:"left"}}>
                  {j.platform} {j.service_type} <span className="small">({j.status})</span>
                  {j.vehicle ? ` - ${j.vehicle}` : ""}
                </button>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
