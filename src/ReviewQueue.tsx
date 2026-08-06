import { useEffect, useState } from "react";
import { getQueue, releaseDiffSet, getDiffSet, QueueItem, QueueCounts } from "./queue";

/** Matches PROFILE_LABELS in the backend. */
const PROFILE_LABELS: Record<string, string> = {
  NA_GAS: "NA gas",
  BOOSTED_GAS: "Boosted gas",
  NA_E85: "NA E85",
  BOOSTED_E85: "Boosted E85"
};

/**
 * The owner's 10%.
 *
 * Everything else in this system runs without a person. This screen is the one
 * decision that cannot: a human accepts a calibration change before it reaches
 * a customer's engine. So the job here is not to present data — it is to make
 * that single decision takeable in seconds, with nothing important hidden
 * behind a click.
 *
 * Which is why the numbers that decide it (largest change, lowest confidence,
 * safety verdict) and every attention flag are on the card itself. The item
 * detail is available, but it is for the rare job that needs it, not the
 * normal one.
 */

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
  busy
}: {
  item: QueueItem;
  onDecide: (decision: "RELEASE" | "REJECT", note: string) => void;
  busy: boolean;
}) {
  const [note, setNote] = useState("");
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
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button disabled={busy} onClick={() => onDecide("RELEASE", note)}>
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

  async function refresh() {
    try {
      const r = await getQueue();
      setCounts(r.counts);
      setItems(r.items);
      setError(null);
    } catch (e) {
      setError(
        `${(e as Error).message}. The queue is admin-only — the address you signed in with must be in ADMIN_EMAILS.`
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function decide(item: QueueItem, decision: "RELEASE" | "REJECT", note: string) {
    setBusyId(item.diffSetId);
    setMsg(null);
    try {
      const r = await releaseDiffSet(item.diffSetId, decision, note);
      if (decision === "REJECT") {
        setMsg(`Rejected — ${item.vehicle || item.customerEmail}. Nothing was sent to the customer.`);
      } else if (r.customerNotified) {
        setMsg(`Released — ${item.customerEmail} has been emailed. Nothing further needed.`);
      } else {
        // Never let a failed send read as a completed job.
        setMsg(
          `Released, but the email to ${item.customerEmail} did NOT go out. ` +
            `The change list is available to them, but you need to tell them yourself.`
        );
      }
      await refresh();
    } catch (e) {
      setMsg(`Failed: ${(e as Error).message}`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="container">
      <div className="nav">
        <div className="brand">Down Dirty 84 — Review Queue</div>
        <div className="row" style={{ gap: 8 }}>
          <button className="secondary" onClick={() => (window.location.href = "/admin")}>
            Jobs
          </button>
          <button className="secondary" onClick={refresh}>
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

      {error && (
        <div className="card" style={{ marginBottom: 12 }}>
          <p className="small">{error}</p>
        </div>
      )}
      {msg && (
        <div className="card" style={{ marginBottom: 12 }}>
          <p className="small">{msg}</p>
        </div>
      )}

      {loading && <p className="small">Loading…</p>}

      {!loading && !error && items.length === 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Nothing waiting on you</h3>
          <p className="small">
            Every analysed job has been decided. New ones appear here on their own, and you are
            emailed when they do.
          </p>
        </div>
      )}

      {items.map((item) => (
        <Card
          key={item.diffSetId}
          item={item}
          busy={busyId === item.diffSetId}
          onDecide={(d, note) => decide(item, d, note)}
        />
      ))}
    </div>
  );
}
