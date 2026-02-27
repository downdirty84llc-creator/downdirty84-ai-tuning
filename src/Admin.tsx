import { useEffect, useState } from "react";
import { adminGetJob, adminListJobs, adminPatchJob } from "./admin";
import { apiGet } from "./client";

const STATUSES = ["NEW","FILES_RECEIVED","ANALYZING","IN_PROGRESS","DELIVERED","COMPLETE"];

type HealthDetails = {
  ok: boolean;
  config: {
    nodeEnv: string;
    hasAppBaseUrl: boolean;
    hasFrontendOrigin: boolean;
    appBaseUrlLooksLocalhost: boolean;
    magicLinkTtlMin: number;
    magicLinkTtlValid: boolean;
    sessionDays: number;
    sessionDaysValid: boolean;
    corsAllowedOriginsCount: number;
  };
};

export default function Admin() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ job:any; uploads:any[] } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthDetails | null>(null);
  const [healthErr, setHealthErr] = useState<string | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthUpdatedAt, setHealthUpdatedAt] = useState<string | null>(null);

  function flagLabel(ok: boolean) {
    return ok ? "PASS" : "WARN";
  }

  async function refresh() {
    const r = await adminListJobs();
    setJobs(r.jobs || []);
  }

  async function refreshHealth() {
    let shouldFetch = false;
    setHealthLoading((prev) => {
      if (prev) return prev;
      shouldFetch = true;
      return true;
    });

    if (!shouldFetch) return;

    try {
      setHealthErr(null);
      const h = await apiGet<HealthDetails>("/health/details");
      setHealth(h);
      setHealthUpdatedAt(new Date().toISOString());
    } catch {
      setHealthErr("Could not load health details.");
    } finally {
      setHealthLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    refreshHealth();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      refreshHealth();
    }, 45000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

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

        <div className="card" style={{gridColumn:"1 / span 2"}}>
          <div className="row" style={{justifyContent:"space-between",alignItems:"center"}}>
            <h3 style={{marginTop:0,marginBottom:0}}>Runtime Health</h3>
            <button className="secondary" onClick={refreshHealth} disabled={healthLoading}>
              {healthLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {healthErr && <p className="small">{healthErr}</p>}
          {health && (
            <>
              {healthUpdatedAt && (
                <p className="small"><b>Last updated:</b> {new Date(healthUpdatedAt).toLocaleString()}</p>
              )}
              {(() => {
                const warningCount = [
                  !health.ok,
                  !health.config.hasAppBaseUrl,
                  !health.config.hasFrontendOrigin,
                  health.config.appBaseUrlLooksLocalhost,
                  !health.config.magicLinkTtlValid,
                  !health.config.sessionDaysValid
                ].filter(Boolean).length;

                return (
                  <p className="small">
                    <b>Overall:</b> {warningCount === 0 ? "PASS" : "WARN"} ({warningCount} warning{warningCount === 1 ? "" : "s"})
                  </p>
                );
              })()}
              <p className="small"><b>OK:</b> {String(health.ok)}</p>
              <p className="small"><b>NODE_ENV:</b> {health.config.nodeEnv}</p>
              <p className="small"><b>APP_BASE_URL set:</b> {flagLabel(health.config.hasAppBaseUrl)}</p>
              <p className="small"><b>FRONTEND_ORIGIN set:</b> {flagLabel(health.config.hasFrontendOrigin)}</p>
              <p className="small"><b>APP_BASE_URL localhost in prod:</b> {health.config.appBaseUrlLooksLocalhost ? "WARN" : "PASS"}</p>
              <p className="small"><b>MAGICLINK_TOKEN_TTL_MIN:</b> {health.config.magicLinkTtlMin} ({flagLabel(health.config.magicLinkTtlValid)})</p>
              <p className="small"><b>SESSION_DAYS:</b> {health.config.sessionDays} ({flagLabel(health.config.sessionDaysValid)})</p>
              <p className="small"><b>CORS allowed origins:</b> {health.config.corsAllowedOriginsCount}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
