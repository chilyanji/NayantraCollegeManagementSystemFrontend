import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Eye,
  EyeOff,
  ShieldCheck,
  Video,
  Activity,
  LockKeyhole,
} from "lucide-react";
import { api, getBase, messageOf, type Row } from "../lib/api";
import { MFAFlow } from "../components/MFAFlow";
import { EmailVerification } from "../components/EmailVerification";
import { useAuth } from "../state";
import { Button, ErrorBox, Field } from "../components/ui";
export function AuthPage({ register = false }: { register?: boolean }) {
  const { login, notice } = useAuth();
  const navigate = useNavigate();
  const [challenge, setChallenge] = useState<Row | null>(null);
  function complete(result: Row) {
    if (result.verification_required || result.mfa_required) {
      setChallenge(result);
      setShow(false);
      return;
    }
    login(result.access_token, result.user);
    navigate(
      result.user.role === "faculty"
        ? "/faculty"
        : result.user.role.startsWith("hostel_")
          ? "/hostels"
          : "/overview",
    );
  }
  const [role, setRole] = useState("admin"),
    [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef(false),
    active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const form = Object.fromEntries(new FormData(event.currentTarget)) as Row;
    setError("");
    if (register && form.password !== form.re_enter_password) {
      setError("Passwords do not match.");
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      if (register) {
        await api.register(form);
        if (active.current) {
          notice(
            "Account created. Sign in to verify your email and activate access.",
            "success",
          );
          navigate("/login");
        }
      } else {
        const result = await api.login(
          String(form.username).trim(),
          form.password,
        );
        if (!active.current) return;
        if (result.verification_required) {
          setChallenge(result);
          setShow(false);
          return;
        }
        complete(result);
      }
    } catch (err) {
      if (active.current) setError(messageOf(err));
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  const [availability, setAvailability] = useState("");
  return (
    <main className="auth-page">
      <aside className="auth-brand">
        <Link className="brand" to="/login">
          <span className="brand-mark">
            <ShieldCheck />
          </span>
          <div>
            <b>SENTINEL</b>
            <small>SURVEILLANCE CONSOLE</small>
          </div>
        </Link>
        <div className="auth-story">
          <span className="eyebrow">A CLEARER VIEW. A SAFER SPACE.</span>
          <h1>
            Every perspective.
            <br />
            <em>One secure workspace.</em>
          </h1>
          <p>
            Your cameras, people, and entry records, connected in a workspace
            built for everyday decisions.
          </p>
          <div className="auth-illustration">
            <div className="orbit o1" />
            <div className="orbit o2" />
            <div className="orbit o3" />
            <div className="orbit-center">
              <ShieldCheck size={48} />
            </div>
            <span className="orbit-node n1">
              <Video size={20} />
            </span>
            <span className="orbit-node n2">
              <Activity size={20} />
            </span>
            <span className="orbit-node n3">
              <LockKeyhole size={20} />
            </span>
            <span className="orbit-label">CONNECTED BY SENTINEL</span>
          </div>
        </div>
        <footer>Purpose-built for people who keep watch.</footer>
      </aside>
      <section className="auth-form-side">
        <div className={`auth-form ${register ? "registration" : ""}`}>
          {challenge?.mfa_required && !register ? (
            <MFAFlow key={challenge.mfa_token} initial={challenge} onComplete={complete}
              onBack={() => { setChallenge(null); setError(""); }} />
          ) : challenge && !register ? (
            <EmailVerification
              initial={challenge}
              onComplete={complete}
              onBack={() => {
                setChallenge(null);
                setError("");
              }}
            />
          ) : (
            <>
              <span className="eyebrow">
                {register ? "JOIN YOUR WORKSPACE" : "WELCOME TO SENTINEL"}
              </span>
              <h2>
                {register ? "Create your account" : "Good to have you back."}
              </h2>
              <p>
                {register
                  ? "Register as a member. Camera access is assigned by your administrator."
                  : "Sign in to your surveillance workspace."}
              </p>
              {!register && (
                <div className="segmented" aria-label="Sign-in portal">
                  {[
                    "admin",
                    "member",
                    "faculty",
                    "hostel_warden",
                    "hostel_guard",
                  ].map((r) => (
                    <button
                      type="button"
                      key={r}
                      className={role === r ? "active" : ""}
                      onClick={() => setRole(r)}
                      disabled={busy}
                    >
                      {r === "admin"
                        ? "Administrator"
                        : r === "faculty"
                          ? "Faculty"
                          : r === "hostel_warden"
                            ? "Warden"
                            : r === "hostel_guard"
                              ? "Guard"
                              : "Member"}
                    </button>
                  ))}
                </div>
              )}
              <ErrorBox message={error} />
              <form onSubmit={submit}>
                <fieldset disabled={busy}>
                  <div className={register ? "form-grid" : ""}>
                    <Field label="Username">
                      <input
                        name="username"
                        required
                        minLength={register ? 3 : 1}
                        maxLength={32}
                        pattern="[A-Za-z0-9_]+"
                        autoComplete="username"
                        placeholder="Your username"
                        onBlur={async (e) => {
                          if (
                            !register ||
                            !e.target.validity.valid ||
                            !e.target.value
                          )
                            return;
                          const name = e.target.value;
                          try {
                            const result = await api.available(name);
                            if (active.current)
                              setAvailability(
                                result.available
                                  ? "Username is available."
                                  : "This username is already taken.",
                              );
                          } catch {
                            if (active.current)
                              setAvailability(
                                "Availability will be checked when you register.",
                              );
                          }
                        }}
                      />
                    </Field>
                    {register && (
                      <>
                        <Field label="Full name">
                          <input
                            name="full_name"
                            required
                            minLength={3}
                            maxLength={50}
                            autoComplete="name"
                            placeholder="Your full name"
                          />
                        </Field>
                        <Field label="Branch">
                          <select name="branch" required defaultValue="">
                            <option value="" disabled>
                              Select branch
                            </option>
                            {[
                              "CSE",
                              "IT",
                              "ECE",
                              "EEE",
                              "ME",
                              "CE",
                              "CHE",
                              "Other",
                            ].map((v) => (
                              <option key={v}>{v}</option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Roll number">
                          <input
                            name="roll_num"
                            required
                            minLength={2}
                            maxLength={20}
                            pattern="[A-Za-z0-9/\-]+"
                            placeholder="e.g. CS/001"
                          />
                        </Field>
                        <Field label="Age">
                          <input
                            name="age"
                            type="number"
                            min={13}
                            max={120}
                            required
                            placeholder="20"
                          />
                        </Field>
                        <Field label="Email">
                          <input
                            name="email"
                            type="email"
                            required
                            autoComplete="email"
                            placeholder="you@example.com"
                          />
                        </Field>
                        <Field label="Phone">
                          <input
                            name="phone"
                            type="tel"
                            required
                            pattern="\+?[1-9][0-9\s\-]{7,20}"
                            autoComplete="tel"
                            placeholder="+91 98765 43210"
                          />
                        </Field>
                      </>
                    )}
                    <Field label="Password">
                      <span className="password-input">
                        <input
                          name="password"
                          type={show ? "text" : "password"}
                          required
                          minLength={register ? 12 : 1}
                          maxLength={128}
                          autoComplete={
                            register ? "new-password" : "current-password"
                          }
                          placeholder={
                            register
                              ? "At least 12 characters"
                              : "Your password"
                          }
                        />
                        <button
                          type="button"
                          onClick={() => setShow((v) => !v)}
                          aria-label={show ? "Hide password" : "Show password"}
                        >
                          {show ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </span>
                    </Field>
                    {register && (
                      <Field label="Confirm password">
                        <input
                          name="re_enter_password"
                          type={show ? "text" : "password"}
                          required
                          autoComplete="new-password"
                          placeholder="Enter your password again"
                        />
                      </Field>
                    )}
                  </div>
                  {register && availability && (
                    <small className="muted">{availability}</small>
                  )}
                  <Button variant="primary full" type="submit" disabled={busy}>
                    {busy
                      ? "Please wait…"
                      : register
                        ? "Create account"
                        : "Sign in securely"}
                    <ArrowRight size={17} />
                  </Button>
                </fieldset>
              </form>
              <p className="auth-switch">
                {register ? "Already have an account?" : "New to Sentinel?"}{" "}
                <Link to={register ? "/login" : "/register"}>
                  {register ? "Sign in" : "Create a member account"}
                </Link>
              </p>
              <div className="auth-note">
                <LockKeyhole size={14} />
                <span>Access is verified by your Sentinel server.</span>
              </div>
              <details className="connection-help">
                <summary>Connection help</summary>
                <p>
                  Using {getBase()}. Your administrator can configure the server
                  address in the frontend environment file. The server must be
                  reachable from this computer.
                </p>
              </details>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
