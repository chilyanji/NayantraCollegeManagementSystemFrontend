import { SecuritySettings } from "../components/SecuritySettings";
import { useState } from "react";
import { Bell, CheckCircle2, Monitor, Server, ShieldCheck } from "lucide-react";
import {
  getBase,
  normalizeBase,
  readStorage,
  store,
  request,
  messageOf,
} from "../lib/api";
import { useAuth } from "../state";
import {
  Badge,
  Button,
  ErrorBox,
  Field,
  PageTitle,
  Panel,
} from "../components/ui";
export function Settings() {
  const { logout, notice } = useAuth();
  const [base, setBase] = useState(getBase),
    [alerts, setAlerts] = useState(
      readStorage("sentinel.alerts", "true") === "true",
    ),
    [theme, setTheme] = useState(readStorage("sentinel.theme", "light")),
    [testing, setTesting] = useState(false),
    [test, setTest] = useState(""),
    [error, setError] = useState("");
  async function testConnection() {
    setTesting(true);
    setError("");
    setTest("");
    try {
      const target = normalizeBase(base);
      const health = await request("/health", { base: target, auth: false });
      setTest(
        `Server reachable${health.database ? ` · Database: ${health.database}` : ""}`,
      );
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setTesting(false);
    }
  }
  function save() {
    setError("");
    try {
      const normalized = normalizeBase(base);
      const changed = normalized !== getBase();
      if (
        changed &&
        !window.confirm(
          "Changing servers signs you out. Save this server address?",
        )
      )
        return;
      store("sentinel.alerts", String(alerts));
      store("sentinel.theme", theme);
      document.documentElement.dataset.theme = theme;
      if (changed) {
        logout();
        store("sentinel.api", normalized);
      }
      notice("Preferences saved.", "success");
    } catch (err) {
      setError(messageOf(err));
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="WORKSPACE / SETTINGS"
        title="Make this workspace yours."
        description="Manage your connection, appearance, and notification preferences."
      />
      <div className="settings-grid">
        <div>
          <SecuritySettings />
          <Panel
            title="Server connection"
            subtitle="The address used by this browser to reach Sentinel"
          >
            <div className="settings-section">
              <div className="setting-heading">
                <span className="setting-icon">
                  <Server />
                </span>
                <p>
                  All account, camera, and record requests go through your
                  existing server.
                </p>
              </div>
              <Field label="API base URL">
                <input
                  value={base}
                  onChange={(e) => {
                    setBase(e.target.value);
                    setTest("");
                  }}
                  placeholder="/api or https://your-server.example"
                />
              </Field>
              <p className="muted small">
                Use /api with the bundled development proxy. For a direct server
                URL, the backend must allow this frontend’s origin.
              </p>
              <Button disabled={testing} onClick={testConnection}>
                {testing ? "Testing connection…" : "Test connection"}
              </Button>
              {test && (
                <p className="success-text">
                  <CheckCircle2 size={17} />
                  {test}
                </p>
              )}
              <ErrorBox message={error} />
            </div>
          </Panel>
          <Panel title="Personal preferences">
            <div className="settings-section">
              <div className="setting-row">
                <Bell size={21} />
                <div>
                  <h3>In-app alert notifications</h3>
                  <p>
                    Show a notification when the live channel delivers an alert.
                  </p>
                </div>
                <button
                  role="switch"
                  aria-checked={alerts}
                  aria-label="In-app alert notifications"
                  className={`switch ${alerts ? "on" : ""}`}
                  onClick={() => setAlerts((v) => !v)}
                >
                  <i />
                </button>
              </div>
              <div className="setting-row">
                <Monitor size={21} />
                <div>
                  <h3>Workspace appearance</h3>
                  <p>Choose the theme that’s comfortable for your shift.</p>
                </div>
                <select
                  aria-label="Workspace theme"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>
              <Button variant="primary" onClick={save}>
                Save preferences
              </Button>
            </div>
          </Panel>
        </div>
        <Panel title="Your session">
          <div className="settings-section">
            <ShieldCheck size={32} className="blue-text" />
            <h3>Access stays with your account.</h3>
            <p className="muted">
              Your server verifies each protected request. Camera permissions
              and account roles are managed by the administrator.
            </p>
            <Badge>Session stored in this tab</Badge>
            <p className="muted small">
              Changing the server signs you out so that your current session is
              never sent to a different server.
            </p>
          </div>
        </Panel>
      </div>
    </>
  );
}
