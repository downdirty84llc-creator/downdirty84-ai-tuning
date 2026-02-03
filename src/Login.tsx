import { useState } from "react";
import { apiPost } from "./client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    try {
      await apiPost("/api/v1/auth/start", { email });
      setSent(true);
    } catch (e: any) {
      setErr("Could not send link. Try again.");
    }
  }

  return (
    <div className="container">
      <div className="nav">
        <div className="brand">Down Dirty 84</div>
        <a className="small" href="https://www.downdirty84llc.com/" target="_blank" rel="noreferrer">Website</a>
      </div>

      <div className="card">
        <h2 style={{marginTop:0}}>Login</h2>
        <p className="small">Enter your email to receive a secure login link.</p>

        <div className="row" style={{alignItems:"center"}}>
          <input
            placeholder="you@example.com"
            value={email}
            onChange={(e)=>setEmail(e.target.value)}
            type="email"
            autoComplete="email"
          />
          <button onClick={submit}>Send login link</button>
        </div>

        {sent && (
          <p className="small" style={{marginTop:12}}>
            Link sent. Check your inbox. If you do not see it, check spam.
          </p>
        )}
        {err && <p className="small" style={{marginTop:12, color:"#fca5a5"}}>{err}</p>}

        <p className="small" style={{marginTop:16}}>
          Support: <a href="mailto:support@downdirty84llc.com">support@downdirty84llc.com</a>
        </p>
      </div>
    </div>
  );
}
