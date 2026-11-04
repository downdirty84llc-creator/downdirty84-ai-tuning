import { useEffect, useRef, useState } from "react";
import {Link} from 'react-router-dom';
import { getQueue, releaseDiffSet, getDiffSet, QueueItem, QueueCounts } from "./queue";
import NavigationGuard from './NavigationGuard';

/** Matches PROFILE_LABELS in the backend. */
const PROFILE_LABELS: Record<string, string> = {
  NA_GAS: "NA gas",
  BOOSTED_GAS: "Boosted gas",
  NA_E85: "NA E85",
  BOOSTED_E85: "Boosted E85"
};

// Release remains an explicit owner decision, separate from reviewing job evidence.

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div style={{ minWidth: 110 }}>
      <div className="small" style={{ opacity: 0.65 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: warn ? "#fbbf24" : undefined }}>
        {value}
      </div>
    </div>
  );
}

function Card({
  item,
  onDecide,
  busy,
  note,
  onNote
}: {
  item: QueueItem;
  onDecide: (decision: "RELEASE" | "REJECT", note: string) => void;
  busy: boolean;
  note: string;
  onNote: (value:string)=>void;
}) {
  const [detail, setDetail] = useState<any>(null);
  const [showDetail, setShowDetail] = useState(false);

  // A blocker means the analysis found something unsafe. It should not be
  // possible to reach this screen with one — diffgen refuses — but if it ever
  // is, it must be impossible to miss.
  const blocked = item.safety.blockers > 0;

  async function toggleDetail() {
    if (!showDetail && !detail) {
      try {
        setDetail(await getDiffSet(item.diffSetId));
      } catch (e) {
        setDetail({ error: String((e as Error).message) });
      }
    }
    setShowDetail(!showDetail);
  }

  return (
    <div className="card" style={{ marginBottom: 12, borderLeft: blocked ? "3px solid #ef4444" : undefined }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h3 style={{ margin: 0 }}>{item.vehicle || "Unspecified vehicle"}</h3>
          <p className="small" style={{ margin: "4px 0" }}>
            {item.customerEmail} · {item.platform} {item.serviceType} · waiting{" "}
            {item.waitingHours < 1 ? "<1" : item.waitingHours.toFixed(1)} h
          </p>
          <p><Link to={`/admin?job=${encodeURIComponent(item.jobId)}`}>Review this job and case history</Link></p>
          {/* Which thresholds judged this. An unconfirmed profile, or none at
              all, changes how much weight the safety verdict carries — so it
              belongs next to the verdict, not buried in the detail. */}
          <p className="small" style={{ margin: 0, opacity: 0.8 }}>
            Judged as{" "}
            <b>
              {item.safety.thresholdProfile
                ? PROFILE_LABELS[item.safety.thresholdProfile] ?? item.safety.thresholdProfile
                : "unknown platform — strictest values"}
            </b>{" "}
            {item.safety.thresholdsConfirmed ? (
              <span style={{ color: "#4ade80" }}>· confirmed</span>
            ) : (
              <span style={{ color: "#fbbf24" }}>· not confirmed</span>
            )}
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", margin: "14px 0" }}>
        <Stat label="Changes" value={String(item.summary.itemCount)} />
        <Stat
          label="Largest change"
          value={`${item.summary.largestChangePct.toFixed(1)}%`}
          warn={item.summary.largestChangePct >= 10}
        />
        <Stat
          label="Lowest confidence"
          value={item.summary.lowestConfidence.toFixed(2)}
          warn={item.summary.lowestConfidence < 0.6}
        />
        <Stat
          label="Safety"
          value={`${item.safety.blockers} blk · ${item.safety.warnings} warn`}
          warn={blocked || item.safety.warnings > 0}
        />
        <Stat
          label="Range"
          value={item.summary.hzRange ? `${item.summary.hzRange[0]}–${item.summary.hzRange[1]} Hz` : "—"}
        />
      </div>

      {item.attention.length > 0 && (
        <div
          style={{
            background: "rgba(251,191,36,.08)",
            border: "1px solid rgba(251,191,36,.25)",
            borderRadius: 10,
            padding: "10px 12px",
            marginBottom: 12
          }}
        >
          <div className="small" style={{ fontWeight: 600, marginBottom: 4 }}>
            Worth a look before you approve
          </div>
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
            {item.attention.map((flag, i) => (
              <li key={i}>{flag}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="row" style={{ alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <input
          style={{ flex: 1, minWidth: 200 }}
          placeholder="Note (recorded with the decision)"
          aria-label={`Decision note for ${item.vehicle||item.jobId}`}
          disabled={busy}
          value={note}
          onChange={(e) => onNote(e.target.value)}
        />
        <button disabled={busy||blocked} onClick={() => onDecide("RELEASE", note)}>
          {busy ? "…" : "Release"}
        </button>
        <button className="secondary" disabled={busy} onClick={() => onDecide("REJECT", note)}>
          Reject
        </button>
        <button className="secondary" onClick={toggleDetail}>
          {showDetail ? "Hide" : "Detail"}
        </button>
      </div>

      {showDetail && (
        <pre
          className="small"
          style={{
            marginTop: 12,
            maxHeight: 320,
            overflow: "auto",
            background: "rgba(255,255,255,.03)",
            padding: 12,
            borderRadius: 10
          }}
        >
          {JSON.stringify(detail, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default function ReviewQueue() {
  const [counts, setCounts] = useState<QueueCounts | null>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes,setNotes]=useState<Record<string,string>>({});
  const dirty=Object.values(notes).some(note=>note!==''),operation=useRef(false),alive=useRef(true),requests=useRef(0);
  const unavailableDrafts=Object.entries(notes).filter(([id,note])=>note!==''&&!items.some(item=>item.diffSetId===id));

  async function refresh() {
    const request=++requests.current;setLoading(true);
    try {
      const r = await getQueue();
      if(!alive.current||request!==requests.current)return;
      setCounts(r.counts);
      setItems(r.items);
      setError(null);
    } catch (e) {
      if(alive.current&&request===requests.current)setError(`${(e as Error).message}. Sign in with your DD84 shop account or retry the queue.`);
    } finally {
      if(alive.current&&request===requests.current)setLoading(false);
    }
  }

  useEffect(() => {
    alive.current=true;void refresh();return()=>{alive.current=false;requests.current++;};
  }, []);

  async function decide(item: QueueItem, decision: "RELEASE" | "REJECT", note: string) {
    if(operation.current||(decision==='RELEASE'&&item.safety.blockers>0))return;
    operation.current=true;
    setBusyId(item.diffSetId);
    setMsg(null);
    try {
      const r = await releaseDiffSet(item.diffSetId, decision, note);
      if(!alive.current)return;
      setNotes(previous=>{const next={...previous};delete next[item.diffSetId];return next;});
      if (decision === "REJECT") {
        setMsg(`Rejected — ${item.vehicle || item.customerEmail}. Nothing was sent to the customer.`);
      } else if (r.customerNotified) {
        setMsg(`Released — ${item.customerEmail} has been emailed the change list.`);
      } else {
        // Never let a failed send read as a completed job.
        setMsg(
          `Released, but the email to ${item.customerEmail} did NOT go out. ` +
            `The change list is available to them, but you need to tell them yourself.`
        );
      }
      await refresh();
    } catch (e) {
      if(alive.current)setMsg(`Failed: ${(e as Error).message}. Your decision note is still open.`);
    } finally {
      operation.current=false;if(alive.current)setBusyId(null);
    }
  }

  return (
    <div className="container">
      <NavigationGuard dirty={dirty} busy={busyId!==null} description="Your decision notes have not been submitted. Keep editing or discard them before leaving. Leaving never releases or rejects a change list." onDiscard={()=>setNotes({})}/>
      <div className="nav">
        <h1>Review queue</h1>
        <div className="row" style={{ gap: 8 }}>
          <Link to="/admin">Shop jobs</Link>
          <button className="secondary" onClick={()=>void refresh()} disabled={loading||busyId!==null||dirty}>
            Refresh
          </button>
        </div>
      </div>

      {counts && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <Stat label="Awaiting you" value={String(counts.awaitingRelease)} />
            <Stat
              label="Longest wait"
              value={`${counts.oldestWaitingHours.toFixed(1)} h`}
              warn={counts.oldestWaitingHours > 24}
            />
            <Stat label="In progress" value={String(counts.jobsInProgress)} />
            <Stat
              label="Failed runs (24h)"
              value={String(counts.failedRuns24h)}
              warn={counts.failedRuns24h > 0}
            />
          </div>
        </div>
      )}

      {dirty&&<p className="small">Decision notes are unsaved until you explicitly release or reject their change list. Clear the notes before refreshing.</p>}
      {unavailableDrafts.length>0&&<section className="card" aria-label="Draft notes for unavailable change lists">
        <h2>Notes for unavailable change lists</h2><p>The refreshed queue no longer lists these change lists. Your drafts are still here to copy or clear; they have not been submitted.</p>
        {unavailableDrafts.map(([id,note])=><div key={id}><label htmlFor={`unavailable-note-${id}`}>Decision note for change list {id}</label><textarea id={`unavailable-note-${id}`} readOnly value={note}/><button className="secondary" disabled={busyId!==null} onClick={()=>setNotes(previous=>{const next={...previous};delete next[id];return next;})}>Clear draft for {id}</button></div>)}
      </section>}
      {error && (
        <div className="card" role="alert" style={{ marginBottom: 12 }}>
          <p className="small">{error}</p>
        </div>
      )}
      {msg && (
        <div className="card" role="status" style={{ marginBottom: 12 }}>
          <p className="small">{msg}</p>
        </div>
      )}

      {loading && <p className="small">Loading…</p>}

      {!loading && !error && items.length === 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Nothing waiting on you</h3>
          <p className="small">
            No change lists are currently awaiting a decision. Refresh to check for new work,
            or open Shop jobs to review files, troubleshooting cases and failed analyses.
          </p>
        </div>
      )}

      {items.map((item) => (
        <Card
          key={item.diffSetId}
          item={item}
          busy={busyId !== null}
          note={notes[item.diffSetId]||''}
          onNote={value=>setNotes(previous=>({...previous,[item.diffSetId]:value}))}
          onDecide={(d, note) => decide(item, d, note)}
        />
      ))}
    </div>
  );
}
