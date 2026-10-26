import { useState } from "react";
import { apiPost } from "./client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    setSent(false);
    try {
      await apiPost("/api/v1/auth/start", { email: email.trim() });
      setSent(true);
    } catch (e: any) {
      setErr("Could not send link. Try again.");
    } finally { setBusy(false); }
  }

  return (
    <div className="container">
      <div className="nav">
        <a className="small" href="https://www.downdirty84llc.com/" target="_blank" rel="noreferrer">Website</a>
      </div>

      <div className="card">
        <h2 style={{marginTop:0}}>Login</h2>
        <p className="small">Enter your email to receive a secure login link.</p>

        <form className="row" style={{alignItems:"end"}} onSubmit={event => {event.preventDefault();void submit();}}>
          <label htmlFor="login-email">Email address
          <input
            id="login-email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e)=>setEmail(e.target.value)}
            type="email"
            autoComplete="email"
          />
          </label>
          <button disabled={busy} type="submit">{busy ? "Sending…" : "Send login link"}</button>
        </form>

        {sent && (
          <p role="status" className="small" style={{marginTop:12}}>
            Link sent. Check your inbox. If you do not see it, check spam.
          </p>
        )}
        {err && <p role="alert" className="small" style={{marginTop:12, color:"#fca5a5"}}>{err}</p>}

        {/* Someone with no account who lands here has nothing to sign in to.
            Send them to the shop rather than leaving them at a dead end. */}
        <p className="small" style={{marginTop:16}}>
          Need a service? <a href="/buy">View tunes and log reviews</a>, or contact DD84 to confirm your setup.
        </p>

        <p className="small" style={{marginTop:16}}>
          Support: <a href="mailto:Downdirty84llc@gmail.com">Downdirty84llc@gmail.com</a>
        </p>
      </div>
    </div>
  );
}
