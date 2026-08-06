import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiFetch } from "./client";
import { getDiffSet, exportSummary } from "./queue";

/**
 * What the customer opens from the "your change list is ready" email.
 *
 * The email links straight here, so this page has to work for someone who has
 * not signed in yet and who may never have used the app. Two things follow:
 * an unreleased or not-yours diffset must explain itself rather than showing a
 * bare error, and the summary and CSV must both be one click.
 */

type Item = {
  itemId?: string;
  type: string;
  path: string;
  coordinates?: { x?: number; y?: number };
  after: number;
  unit?: string;
  confidence: number;
  rationale?: string;
  instruction?: string;
  status: string;
};

export default function DiffSetView() {
  const { diffSetId = "" } = useParams();
  const [diff, setDiff] = useState<any>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setDiff(await getDiffSet(diffSetId));
      } catch (e) {
        const m = (e as Error).message;
        setError(
          m.includes("401")
            ? "Please sign in with the email address this was sent to, then open the link again."
            : m.includes("404")
              ? "This change list could not be found under your account."
              : m
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [diffSetId]);

  async function onSummary() {
    try {
      setSummary((await exportSummary(diffSetId)).text);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function onCsv() {
    try {
      const res = await apiFetch(`/api/v1/diffsets/${diffSetId}/export/csv`, {
        method: "POST",
        body: JSON.stringify({})
      });
      const text = await res.text();
      const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `dd84-${diffSetId.slice(0, 8)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const released = diff?.releaseStatus === "RELEASED";
  const items: Item[] = diff?.items ?? [];

  return (
    <div className="container">
      <div className="nav">
        <div className="brand">Down Dirty 84</div>
        <button className="secondary" onClick={() => (window.location.href = "/dashboard")}>
          Dashboard
        </button>
      </div>

      {loading && <p className="small">Loading…</p>}

      {error && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Cannot show this change list</h3>
          <p className="small">{error}</p>
        </div>
      )}

      {diff && !released && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Still under review</h3>
          <p className="small">
            These changes have been calculated but not yet released by Down Dirty 84. Nothing is
            exportable until a person has checked it — you will be emailed the moment it is.
          </p>
        </div>
      )}

      {diff && released && (
        <>
          <div className="card" style={{ marginBottom: 12 }}>
            <h2 style={{ marginTop: 0 }}>Your change list</h2>
            <p className="small">
              {items.length} change{items.length === 1 ? "" : "s"} · released{" "}
              {diff.releasedAt ? new Date(diff.releasedAt).toLocaleString() : ""}
            </p>
            <div className="row" style={{ gap: 8 }}>
              <button onClick={onCsv}>Download CSV</button>
              <button className="secondary" onClick={onSummary}>
                Show summary
              </button>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ marginTop: 0 }}>Changes</h3>
            <div style={{ overflowX: "auto" }}>
              <table className="small" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", opacity: 0.7 }}>
                    <th style={{ padding: "6px 8px" }}>Where</th>
                    <th style={{ padding: "6px 8px" }}>Change</th>
                    <th style={{ padding: "6px 8px" }}>Confidence</th>
                    <th style={{ padding: "6px 8px" }}>Status</th>
                    <th style={{ padding: "6px 8px" }}>Why</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={it.itemId ?? i} style={{ borderTop: "1px solid rgba(255,255,255,.06)" }}>
                      <td style={{ padding: "6px 8px" }}>
                        {it.path}
                        {it.coordinates?.x != null ? ` @ ${it.coordinates.x} Hz` : ""}
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        ×{it.after} {it.unit ?? ""}
                      </td>
                      <td style={{ padding: "6px 8px" }}>{Number(it.confidence).toFixed(2)}</td>
                      <td style={{ padding: "6px 8px" }}>{it.status}</td>
                      <td style={{ padding: "6px 8px", opacity: 0.8 }}>{it.rationale ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {summary && (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Summary</h3>
              <pre className="small" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                {summary}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}
