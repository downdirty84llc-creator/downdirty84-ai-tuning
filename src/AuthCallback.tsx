import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiPost } from "./client";

export default function AuthCallback() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [msg, setMsg] = useState("Signing you in...");

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setMsg("Missing token.");
      return;
    }
    (async () => {
      try {
        await apiPost("/api/v1/auth/verify", { token });
        nav("/dashboard");
      } catch {
        setMsg("Login link invalid or expired. Please request a new link.");
      }
    })();
  }, [params, nav]);

  return (
    <div className="container">
      <div className="card">
        <h2 style={{marginTop:0}}>Down Dirty 84</h2>
        <p className="small">{msg}</p>
      </div>
    </div>
  );
}
