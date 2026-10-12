import { useEffect, useState } from "react";
import { asList, messageOf, request, setSession, type Row } from "../lib/api";
import { useAuth } from "../state";
import { Button, ErrorBox, Field, Panel } from "./ui";
import { MFAFlow } from "./MFAFlow";
import "./mfa.css";

export function SecuritySettings() {
  const { login, notice } = useAuth();
  const [status, setStatus] = useState<Row | null>(null), [devices, setDevices] = useState<Row[]>([]);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [password, setPassword] = useState(""), [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false), [pending, setPending] = useState<Row | null>(null);
  async function refresh() {
    const [s, d] = await Promise.all([request("/auth/mfa/status"), request("/auth/mfa/devices")]);
    setStatus(s); setDevices(asList(d, "devices"));
  }
  useEffect(() => {
    let active = true;
    Promise.all([request("/auth/mfa/status"), request("/auth/mfa/devices")])
      .then(([s,d])=>{if(active){setStatus(s);setDevices(asList(d,"devices"));}})
      .catch(e=>{if(active)setError(messageOf(e));});
    return ()=>{active=false;};
  }, []);
  function signedOut() {
    setSession(null); window.dispatchEvent(new CustomEvent("sentinel:expired"));
  }
  async function action(path: string, body?: Row, method = "POST") {
    if(busy) return;
    setBusy(true); setError("");
    try {
      const result = await request("/auth/mfa"+path, {method,body,timeout:45000});
      setPassword(""); setCode("");
      if(result.signed_out) {signedOut();return;}
      if(result.mfa_required) setPending(result);
      else await refresh();
    } catch(e){setError(messageOf(e));}
    finally{setBusy(false);}
  }
  const updateSession = (result: Row) => login(result.access_token, result.user);
  return <Panel title="Account security" subtitle="Authenticator and trusted browsers">
    <div className="settings-section mfa-flow">
      <ErrorBox message={error} />
      {pending ? <MFAFlow initial={pending} onVerified={updateSession}
        onBack={()=>{setPending(null);setPassword("");}}
        onComplete={result=>{updateSession(result);setPending(null);void refresh().catch(e=>setError(messageOf(e)));notice("Authenticator enabled.","success");}} />
      : status && <>
        <p><strong>{status.totp_enabled ? "Authenticator enabled" : "Authenticator not enrolled"}</strong> · {status.policy}</p>
        {status.totp_enabled && <p className="muted">Unused recovery codes: {status.recovery_remaining}.
          To replace a lost authenticator, sign out and choose “Use a recovery code” after entering your password.</p>}
        {!status.totp_enabled && <form onSubmit={e=>{e.preventDefault();void action("/enroll/start",{password});}}>
          <Field label="Current password"><input type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} /></Field>
          <Button disabled={busy} type="submit">Enable authenticator</Button>
        </form>}
        {status.totp_enabled && !status.mandatory && <details>
          <summary>Disable optional authenticator</summary>
          <p>This signs out all sessions and revokes trusted browsers. Faculty and Warden accounts will still require email MFA on an untrusted browser.</p>
          <form onSubmit={e=>{e.preventDefault();void action("/disable",{password,code,recovery});}}>
            <Field label="Current password"><input type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} /></Field>
            <label className="mfa-check"><input type="checkbox" checked={recovery} onChange={e=>setRecovery(e.target.checked)} />Use an unused recovery code</label>
            <Field label={recovery ? "Recovery code" : "Current authenticator code"}><input required autoComplete="off" maxLength={48} value={code} onChange={e=>setCode(e.target.value)} /></Field>
            <Button type="submit" disabled={busy}>Disable authenticator and sign out</Button>
          </form>
        </details>}
        {status.mandatory && <p className="muted small">Administrators verify with an authenticator at every fresh login. Trusted browsers cannot skip this.</p>}
        {status.trust_allowed && <p className="muted small">Browser trust lasts up to {status.trust_days} days. If your browser blocks secure cookies, the next login will ask for verification again.</p>}
        <h3>Trusted browsers</h3>
        <p className="muted small">Revoking one or all browsers also signs out all current sessions.</p>
        {!devices.length && <p className="muted">No trusted browsers.</p>}
        <ul className="mfa-devices">{devices.map(d=><li key={d.device_id}>
          <div><strong>{d.label}</strong>{d.current_device ? " · Current browser" : ""}
            <p>{d.trusted ? "Trusted" : d.revoked_at ? "Revoked" : "Expired"}
              {" · Expires "+new Date(d.expires_at).toLocaleString()}</p>
            <p className="muted small">Last used {new Date(d.last_used_at).toLocaleString()}</p></div>
          {d.trusted && <Button disabled={busy} onClick={()=>void action("/devices/"+d.device_id,undefined,"DELETE")}>Revoke</Button>}
        </li>)}</ul>
        {devices.some(d=>d.trusted) && <Button disabled={busy} onClick={()=>void action("/devices",undefined,"DELETE")}>Revoke all and sign out</Button>}
      </>}
      {!status && !error && <p>Loading account security…</p>}
    </div>
  </Panel>;
}
