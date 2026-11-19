"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

type LoginResult = { authorized: boolean; username: string };
export class AuthError extends Error { constructor(message: string, public status: number) { super(message); } }

export async function authRequest<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Unable to connect. Check your internet and try again.");
  }
  const data = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new AuthError(data.error || (response.status === 429 ? "Too many attempts. Wait a few minutes and try again." : "Unable to sign in. Please check your details and try again."), response.status);
  return data as T;
}

function PasswordField({ id, label, value, onChange, autoComplete, required = true, newPassword = false }: {
  id: string; label: string; value: string; onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password"; required?: boolean; newPassword?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return <div className="admin-field">
    <label htmlFor={id}>{label}</label>
    <div className="admin-password-field"><input id={id} type={visible ? "text" : "password"} value={value} onChange={event => onChange(event.target.value)} required={required} autoComplete={autoComplete} minLength={newPassword ? 12 : undefined} maxLength={256} spellCheck={false} autoCapitalize="none" aria-describedby={newPassword ? "password-guidance" : undefined} /><button type="button" onClick={() => setVisible(current => !current)} aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`} aria-pressed={visible}>{visible ? "Hide" : "Show"}</button></div>
  </div>;
}

export function LoginForm({ onSuccess, initialUsername = "" }: { onSuccess: (username: string) => Promise<void> | void; initialUsername?: string }) {
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return; setError(""); setBusy(true);
    try {
      const result = await authRequest<LoginResult>("/api/admin/login", { username: username.trim(), password });
      setPassword("");
      await onSuccess(result.username);
    } catch (cause) {
      setPassword("");
      setError(cause instanceof Error ? cause.message : "Unable to sign in. Please try again.");
    } finally { setBusy(false); }
  }
  return <form className="admin-auth-form" onSubmit={submit}>
    <fieldset disabled={busy}><label>Username<input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={event => setUsername(event.target.value)} required maxLength={40} autoFocus /></label><PasswordField id="login-password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" /></fieldset>
    {error && <p className="admin-error" role="alert">{error}</p>}
    <button type="submit" className="admin-button" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
  </form>;
}

export function CredentialsForm({ mode, username: initialUsername = "bhagyashree", token, onSuccess, onCancel, onUnavailable }: {
  mode: "setup" | "change"; username?: string; token?: string;
  onSuccess: (username: string) => Promise<void> | void; onCancel?: () => void; onUnavailable?: (message: string) => void;
}) {
  const [username, setUsername] = useState(initialUsername);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function clearPasswords() { setCurrentPassword(""); setPassword(""); setConfirmation(""); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return; setError("");
    if (!/^[A-Za-z0-9._-]{3,40}$/.test(username.trim())) { clearPasswords(); setError("Use a username with 3–40 letters, numbers, dots, underscores or hyphens."); return; }
    if ([...password].length < 12 || [...password].length > 128) { clearPasswords(); setError("Choose a password with 12–128 characters."); return; }
    if (password !== confirmation) { clearPasswords(); setError("The passwords did not match. Please enter them again."); return; }
    setBusy(true);
    try {
      const body = mode === "setup" ? { token, username: username.trim(), password } : { currentPassword, username: username.trim(), newPassword: password };
      const result = await authRequest<LoginResult>(mode === "setup" ? "/api/admin/setup" : "/api/admin/password", body);
      clearPasswords();
      await onSuccess(result.username);
    } catch (cause) {
      clearPasswords();
      if (mode === "setup" && cause instanceof AuthError && [403, 409].includes(cause.status)) onUnavailable?.(cause.message);
      setError(cause instanceof Error ? cause.message : "Unable to save your login. Please try again.");
    } finally { setBusy(false); }
  }

  return <form className="admin-auth-form" onSubmit={submit}>
    <fieldset disabled={busy}>
      <label>Username<input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={40} value={username} onChange={event => setUsername(event.target.value)} /></label>
      <p className="admin-help">3–40 letters, numbers, dots, underscores or hyphens. Usernames are saved in lowercase.</p>
      {mode === "change" && <PasswordField id="current-password" label="Current password" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" />}
      <PasswordField id="new-password" label={mode === "setup" ? "Create password" : "New password"} value={password} onChange={setPassword} autoComplete="new-password" newPassword />
      <p id="password-guidance" className="admin-help">Use 12–128 characters. Choose a long passphrase that you do not use elsewhere.</p>
      <PasswordField id="confirm-password" label="Confirm new password" value={confirmation} onChange={setConfirmation} autoComplete="new-password" newPassword />
    </fieldset>
    {error && <p className="admin-error" role="alert">{error}</p>}
    <div className="admin-auth-actions"><button className="admin-button" type="submit" disabled={busy}>{busy ? "Saving…" : mode === "setup" ? "Create admin login" : "Save login"}</button>{onCancel && <button type="button" className="admin-button secondary" onClick={onCancel} disabled={busy}>Cancel</button>}</div>
    {mode === "change" && <p className="admin-help">Saving your login signs out other devices. This device stays signed in.</p>}
  </form>;
}

export function ReauthenticationDialog({ username, onSuccess, onCancel }: { username?: string; onSuccess: (username: string) => Promise<void> | void; onCancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog ref={dialog} className="admin-auth-dialog" aria-labelledby="reauth-title" onCancel={event => { event.preventDefault(); onCancel(); }}>
    <h2 id="reauth-title">Sign in again</h2><p className="admin-help">Your session has ended. Sign in to continue. Your selected photos and unsaved details are still in the form.</p>
    <LoginForm initialUsername={username} onSuccess={onSuccess} />
    <button className="admin-text-link" type="button" onClick={onCancel}>Return to my unsaved form</button>
  </dialog>;
}
