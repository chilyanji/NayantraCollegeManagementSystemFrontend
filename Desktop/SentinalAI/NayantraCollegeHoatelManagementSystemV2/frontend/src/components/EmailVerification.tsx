import { useEffect, useRef, useState } from "react";
import { api, ApiError, messageOf, type Row } from "../lib/api";
import { Button, ErrorBox, Field } from "./ui";
export function EmailVerification({
  initial,
  onComplete,
  onBack,
}: {
  initial: Row;
  onComplete: (result: Row) => void;
  onBack: () => void;
}) {
  const [challenge, setChallenge] = useState(initial);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [expires, setExpires] = useState(
    Date.now() + initial.expires_in * 1000,
  );
  const [resendAt, setResendAt] = useState(
    Date.now() + initial.resend_after * 1000,
  );
  const active = useRef(true),
    pending = useRef(false);
  useEffect(() => {
    active.current = true;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      active.current = false;
      window.clearInterval(timer);
    };
  }, []);
  const remaining = Math.max(0, Math.ceil((expires - now) / 1000));
  const cooldown = Math.max(0, Math.ceil((resendAt - now) / 1000));
  async function run(resend = false) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (resend) {
        const next = await api.resendEmail(challenge.verification_token);
        if (!active.current) return;
        setChallenge(next);
        setCode("");
        setNow(Date.now());
        setExpires(Date.now() + next.expires_in * 1000);
        setResendAt(Date.now() + next.resend_after * 1000);
        setNotice("New code sent. Use the latest email.");
      } else {
        const result = await api.verifyEmail(
          challenge.verification_token,
          code,
        );
        if (active.current) onComplete(result);
      }
    } catch (e) {
      if (active.current) {
        setError(messageOf(e));
        if (resend && e instanceof ApiError && e.retryAfter)
          setResendAt(Date.now() + e.retryAfter * 1000);
      }
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  return (
    <>
      <span className="eyebrow">SECURE ACCOUNT ACTIVATION</span>
      <h2>Verify your email</h2>
      <p>
        Enter the 6-digit code sent to <strong>{challenge.masked_email}</strong>
        . Your account stays locked until verification is complete.
      </p>
      <ErrorBox message={error} />
      {notice && <p role="status">{notice}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <fieldset disabled={busy}>
          <Field label="Verification code">
            <input
              name="code"
              autoFocus
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              minLength={6}
              maxLength={6}
              required
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))
              }
              placeholder="6-digit code"
              aria-describedby="code-expiry"
            />
          </Field>
          <p id="code-expiry" className="muted">
            {remaining
              ? `Code expires in ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`
              : "Code expired. Request a new code."}
          </p>
          <Button
            variant="primary full"
            type="submit"
            disabled={busy || !remaining || code.length !== 6}
          >
            {busy ? "Please wait…" : "Verify and sign in"}
          </Button>
        </fieldset>
      </form>
      <Button
        type="button"
        disabled={busy || cooldown > 0}
        onClick={() => void run(true)}
      >
        {cooldown ? `Resend code in ${cooldown}s` : "Resend code"}
      </Button>
      <p className="muted">
        Check Spam too. Wrong email? Ask your administrator to correct your
        account email.
      </p>
      <Button type="button" disabled={busy} onClick={onBack}>
        Back to sign in
      </Button>
    </>
  );
}
