"use client";

import { useEffect, useRef, useState } from "react";
import { AuthError, authRequest, CredentialsForm } from "../auth-controls";

export default function SetupClient() {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"checking" | "valid" | "invalid" | "error">("checking");
  const [error, setError] = useState("");
  const started = useRef(false);

  async function check(value: string) {
    setStatus("checking"); setError("");
    try {
      const result = await authRequest<{ valid: boolean; ready: boolean }>("/api/admin/setup/status", { token: value });
      if (!result.valid || !result.ready) throw new AuthError("This setup link is unavailable. Ask the website administrator for a new link.", 403);
      setStatus("valid");
    } catch (cause) {
      const invalid = cause instanceof AuthError && [400, 403, 409].includes(cause.status);
      if (invalid) setToken("");
      setStatus(invalid ? "invalid" : "error");
      setError(cause instanceof Error ? cause.message : "Unable to check this setup link. Please try again.");
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const value = new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    if (!value) { setStatus("invalid"); setError("This page needs a valid private setup link. Ask the website administrator for a new link."); return; }
    setToken(value);
    void check(value);
  }, []);

  return <div className="admin-shell">
    <header className="admin-header"><a href="/" aria-label="Shreekamalinee home"><img src="/logo-240.png" alt="Shreekamalinee" width="190" height="78" /></a><a href="/" className="admin-text-link">View shop</a></header>
    <main className="admin-main"><section className="admin-login admin-panel">
      <span className="admin-kicker">SHREEKAMALINEE</span><h1>Set up your admin login</h1>
      {status === "checking" ? <p role="status">Checking your private setup link…</p> : status === "invalid" ? <><p role="alert" className="admin-error">{error}</p><a className="admin-button" href="/admin">Go to admin sign in</a></> : status === "error" ? <><p role="alert" className="admin-error">{error}</p><button className="admin-button" onClick={() => void check(token)}>Try again</button></> : <>
        <p>Choose a username and password to manage your products from any device.</p>
        <CredentialsForm mode="setup" token={token} onSuccess={() => { setToken(""); window.location.replace("/admin"); }} onUnavailable={message => { setToken(""); setStatus("invalid"); setError(message); }} />
        <p className="admin-help">This private link can be used only once. Keep your login details somewhere safe.</p>
      </>}
    </section></main>
    <footer className="admin-footer">Shreekamalinee · For the auspicious you</footer>
  </div>;
}
