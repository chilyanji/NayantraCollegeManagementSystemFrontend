import { useEffect, useRef, useState } from "react";
import { ApiError, messageOf, parseAuthResponse, request, type Row } from "../lib/api";
import { Button, ErrorBox, Field } from "./ui";
import "./mfa.css";

export function MFAFlow({ initial, onComplete, onBack, onVerified }: {
  initial: Row; onComplete: (result: Row) => void; onBack: () => void;
  onVerified?: (result: Row) => void;
}) {
  const [challenge, setChallenge] = useState(initial);
  const [code, setCode] = useState(""), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [recovery, setRecovery] = useState(false);
  const [trust, setTrust] = useState(false), [label, setLabel] = useState("This browser");
  const [result, setResult] = useState<Row | null>(null), [saved, setSaved] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const [expires, setExpires] = useState(Date.now() + initial.expires_in * 1000);
  const [resendAt, setResendAt] = useState(Date.now() + (initial.resend_after || 0) * 1000);
  const active = useRef(true), running = useRef(false);
  useEffect(() => {
    active.current = true;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => { active.current = false; window.clearInterval(timer); };
  }, []);
  const remaining = Math.max(0, Math.ceil((expires-clock)/1000));
  const cooldown = Math.max(0, Math.ceil((resendAt-clock)/1000));
  const enrollment = challenge.method === "enroll";
  function update(next: Row) {
    setChallenge(next); setCode(""); setRecovery(false);
    setClock(Date.now()); setExpires(Date.now() + next.expires_in * 1000);
    setResendAt(Date.now() + (next.resend_after || 0) * 1000);
  }
  async function run(action: "start" | "resend" | "verify") {
    if (running.current) return;
    running.current = true; setBusy(true); setError("");
    const path = action === "start" ? "/enroll/start" : action === "resend" ? "/resend"
      : recovery ? "/recovery" : enrollment ? "/enroll/confirm" : "/verify";
    try {
      const body: Row = { mfa_token: challenge.mfa_token };
      if (action === "verify") {
        body.code = code.trim();
        if (!recovery) {
          body.trust_device = challenge.trust_allowed === true && trust;
          body.device_label = label || "This browser";
        }
      }
      const response = await request("/auth/mfa"+path, { method: "POST", body, auth: false, timeout: 45000 });
      if (!active.current) return;
      if (action === "start") { update(response); return; }
      const next = parseAuthResponse(response);
      if (next.mfa_required) { update(next); return; }
      setCode("");
      setChallenge({ ...challenge, manual_key: undefined, qr_data_url: undefined });
      if (next.recovery_codes?.length) {
        setResult(next);
        onVerified?.(next); // Authenticated settings keep background API calls on the new session.
      } else onComplete(next);
    } catch (e) {
      if (active.current) {
        setError(messageOf(e));
        if (action === "resend" && e instanceof ApiError && e.retryAfter)
          setResendAt(Date.now()+e.retryAfter*1000);
      }
    } finally { running.current = false; if (active.current) setBusy(false); }
  }
  if (result) return (
    <div className="mfa-flow">
      <span className="eyebrow">AUTHENTICATOR ENABLED</span>
      <h2>Save your recovery codes</h2>
      <p>Each code works once. Store these in a password manager or another safe offline place.
        They will not be shown again. Recovery replaces your authenticator and signs out existing sessions.</p>
      <ul className="mfa-recovery">{result.recovery_codes.map((c: string) => <li key={c}><code>{c}</code></li>)}</ul>
      <label className="mfa-check"><input type="checkbox" checked={saved} onChange={e=>setSaved(e.target.checked)} />
        I have saved my recovery codes</label>
      <Button variant="primary full" disabled={!saved} onClick={()=>onComplete(result)}>Continue to workspace</Button>
    </div>
  );
  return (
    <div className="mfa-flow">
      <span className="eyebrow">SIGN-IN SECURITY</span>
      <h2>{enrollment ? "Set up your authenticator" : recovery ? "Use a recovery code" : challenge.method === "email" ? "Verify this sign-in" : "Enter authenticator code"}</h2>
      <p>{enrollment ? "Add this account to Google Authenticator, Microsoft Authenticator or another compatible app, then enter its current code."
        : recovery ? "Enter one unused recovery code. You must set up a replacement authenticator before continuing."
        : challenge.method === "email" ? "Your email is already activated. Verify this new or untrusted sign-in using the code sent to "+challenge.masked_email+"."
        : "Open your authenticator app and enter the current 6-digit code. A code already used for sign-in cannot be reused."}</p>
      <ErrorBox message={error} />
      {enrollment && !challenge.manual_key ? (
        <Button variant="primary full" disabled={busy || !remaining} onClick={()=>void run("start")}>
          {busy ? "Please wait…" : "Start authenticator setup"}
        </Button>
      ) : (
        <form onSubmit={e=>{e.preventDefault(); void run("verify");}}>
          <fieldset disabled={busy}>
            {enrollment && <>
              <img className="mfa-qr" src={challenge.qr_data_url} alt="Authenticator setup QR code" />
              <Field label="Manual setup key"><input readOnly value={challenge.manual_key} autoComplete="off" /></Field>
              <p className="muted small">Time based · 6 digits · 30 seconds. Keep this key private.</p>
            </>}
            <Field label={recovery ? "Recovery code" : "Sign-in code"}>
              <input autoFocus autoComplete={recovery ? "off" : "one-time-code"} inputMode={recovery ? "text" : "numeric"}
                minLength={recovery ? 32 : 6} maxLength={recovery ? 48 : 6} pattern={recovery ? "[A-Fa-f0-9 -]{32,48}" : "[0-9]{6}"}
                required value={code} onChange={e=>setCode(recovery ? e.target.value : e.target.value.replace(/[^0-9]/g,"").slice(0,6))}
                placeholder={recovery ? "Unused recovery code" : "6-digit code"} />
            </Field>
            {challenge.trust_allowed === true && !recovery && <>
              <label className="mfa-check"><input type="checkbox" checked={trust} onChange={e=>setTrust(e.target.checked)} />
                Trust this browser for up to {challenge.trust_days} days</label>
              {trust && <Field label="Device name"><input value={label} maxLength={100} onChange={e=>setLabel(e.target.value)} /></Field>}
              <p className="muted small">Use only on a private device. Security changes may require verification again.</p>
            </>}
            <Button variant="primary full" type="submit" disabled={busy || !remaining || (recovery ? code.length<32 : code.length!==6)}>
              {busy ? "Please wait…" : recovery ? "Verify recovery code" : enrollment ? "Confirm authenticator" : "Verify sign-in"}
            </Button>
          </fieldset>
        </form>
      )}
      <p className="muted small" role="status">{remaining ? "Request expires in "+Math.floor(remaining/60)+":"+String(remaining%60).padStart(2,"0") : "Request expired. Return to sign in."}</p>
      {challenge.method === "email" && <Button disabled={busy || cooldown>0} onClick={()=>void run("resend")}>
        {cooldown ? "Resend code in "+cooldown+"s" : "Resend code"}
      </Button>}
      {challenge.method === "totp" && <Button disabled={busy} onClick={()=>{setRecovery(!recovery);setCode("");setError("");}}>
        {recovery ? "Use authenticator instead" : "Use a recovery code"}
      </Button>}
      <Button disabled={busy} onClick={onBack}>Back to sign in</Button>
    </div>
  );
}
