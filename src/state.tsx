import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  getBase,
  getSession,
  setSession,
  socketUrl,
  readStorage,
  type Row,
  type Session,
} from "./lib/api";
import { useResource } from "./lib/hooks";
import { displayText } from "./lib/domain";
import { classroomAdapter } from "./features/classroom/backend";
export type Notice = {
  id: number;
  text: string;
  kind: "success" | "error" | "info";
};
type AuthState = {
  session: Session | null;
  ready: boolean;
  login: (token: string, user: Row) => void;
  logout: () => void;
  notice: (text: string, kind?: Notice["kind"]) => void;
  isAdmin: boolean;
};
const Auth = createContext<AuthState>(null!);
export function useAuth() {
  return useContext(Auth);
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setCurrent] = useState(getSession),
    [ready, setReady] = useState(!getSession()),
    [notices, setNotices] = useState<Notice[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const notice = (text: string, kind: Notice["kind"] = "info") => {
    const id = Date.now() + Math.random();
    setNotices((v) => [...v.slice(-3), { id, text, kind }]);
    timers.current.push(
      setTimeout(() => setNotices((v) => v.filter((n) => n.id !== id)), 6000),
    );
  };
  function logout() {
    // Capture the bearer token before clearing local state.
    void api
      .logout()
      .catch(() =>
        notice(
          "Signed out locally. Server could not confirm sign-out on other devices.",
          "info",
        ),
      );
    setSession(null);
    setCurrent(null);
  }
  function login(token: string, user: Row) {
    const next = { token, user, base: getBase() };
    setSession(next);
    setCurrent(next);
    setReady(true);
  }
  useEffect(() => {
    const captured = getSession();
    if (!captured) return;
    let active = true;
    const c = new AbortController();
    api
      .profile(captured.user.username, c.signal)
      .then((user) => {
        if (active && getSession()?.token === captured.token) {
          const next = { ...captured, user };
          setSession(next);
          setCurrent(next);
        }
      })
      .catch(() => {
        if (active) {
          setSession(null);
          setCurrent(null);
          notice("Please sign in again to verify your session.", "error");
        }
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
      c.abort();
    };
  }, []);
  useEffect(() => {
    const expired = () => {
      setSession(null);
      setCurrent(null);
      notice("Your session has expired. Please sign in again.", "error");
    };
    window.addEventListener("sentinel:expired", expired);
    return () => {
      window.removeEventListener("sentinel:expired", expired);
      timers.current.forEach(clearTimeout);
    };
  }, []);
  return (
    <Auth.Provider
      value={{
        session,
        ready,
        login,
        logout,
        notice,
        isAdmin: session?.user.role === "admin",
      }}
    >
      {children}
      <div className="toasts" aria-live="polite">
        {notices.map((n) => (
          <div
            key={n.id}
            className={`toast ${n.kind}`}
            role={n.kind === "error" ? "alert" : "status"}
          >
            {n.text}
            <button
              aria-label="Dismiss notification"
              onClick={() => setNotices((v) => v.filter((x) => x.id !== n.id))}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </Auth.Provider>
  );
}
type LiveState = {
  health: ReturnType<typeof useResource<Row>>;
  status: ReturnType<typeof useResource<Row>>;
  detections: ReturnType<typeof useResource<Row[]>>;
  cameras: ReturnType<typeof useResource<Row[]>>;
  members: ReturnType<typeof useResource<Row[]>>;
  socketState: string;
  eventVersion: number;
  events: Row[];
  refresh: () => void;
  clearEvents: () => void;
};
const Live = createContext<LiveState>(null!);
export const useLive = () => useContext(Live);
// The dashboard summarizes all visible cameras; cameraStatus requires a camera ID.
export async function loadCameraSummary(signal: AbortSignal): Promise<Row> {
  const cameras = await api.aiCameras(signal);
  return {
    cameras,
    running: cameras.some((camera) => camera.running === true),
    // Both flags must belong to the same camera to count as an online feed.
    connected: cameras.some(
      (camera) => camera.running === true && camera.connected === true,
    ),
    error: cameras
      .filter((camera) => camera.error)
      .map(
        (camera) =>
          `${camera.camera_name || camera.camera_id || "Camera"}: ${displayText(camera.error)}`,
      )
      .join("; "),
  };
}
export function LiveProvider({ children }: { children: ReactNode }) {
  const { session, isAdmin, notice } = useAuth();
  const id = session!.token;
  const faculty = session?.user.role === "faculty";
  const scoped = faculty || session?.user.role.startsWith("hostel_");
  // Faculty resources come only from the verified, scoped classroom adapter.
  const health = useResource(
      (s) => (scoped ? Promise.resolve({}) : api.aiHealth(s)),
      `health-${id}`,
      scoped ? 0 : 5000,
    ),
    status = useResource(
      (s) => (scoped ? Promise.resolve({}) : loadCameraSummary(s)),
      `status-${id}`,
      scoped ? 0 : 5000,
    ),
    detections = useResource(
      (s) => (scoped ? Promise.resolve([]) : api.detections(s)),
      `detections-${id}`,
      scoped ? 0 : 3000,
    ),
    cameras = useResource(
      (s) => (scoped ? Promise.resolve([]) : api.cameras(isAdmin, s)),
      `cameras-${id}`,
      scoped ? 0 : 30000,
    ),
    members = useResource(
      (s) => (isAdmin ? api.members(s) : Promise.resolve([])),
      `members-${id}`,
      30000,
    );
  const [socketState, setSocketState] = useState("Connecting"),
    [eventVersion, setEventVersion] = useState(0),
    [events, setEvents] = useState<Row[]>([]);
  useEffect(() => {
    if (faculty && !classroomAdapter) {
      setSocketState("Disconnected");
      return;
    }
    let stopped = false,
      ws: WebSocket | undefined,
      retry: ReturnType<typeof setTimeout> | undefined,
      coalesce: ReturnType<typeof setTimeout> | undefined,
      attempt = 0;
    const seen = new Set<string>();
    function connect() {
      if (stopped) return;
      setSocketState("Connecting");
      try {
        ws = new WebSocket(
          faculty ? classroomAdapter!.socketUrl(id) : socketUrl(id),
        );
      } catch {
        schedule();
        return;
      }
      ws.onopen = () => {
        attempt = 0;
        setSocketState("Live");
      };
      ws.onmessage = (event) => {
        let raw;
        try {
          raw = JSON.parse(event.data);
        } catch {
          return;
        }
        if (typeof raw?.type === "string" && raw.type.startsWith("hostel.")) {
          window.dispatchEvent(
            new CustomEvent("nayantra:hostel-event", { detail: raw }),
          );
          return;
        }
        if (classroomAdapter) {
          try {
            const classroomEvent = classroomAdapter.event(raw);
            if (classroomEvent) {
              window.dispatchEvent(
                new CustomEvent("nayantra:classroom-event", {
                  detail: classroomEvent,
                }),
              );
              return;
            }
          } catch {
            /* Malformed classroom messages never enter UI state. */
          }
        }
        if (scoped) return;
        if (!raw || !["sighting", "alert"].includes(raw.type)) return;
        if (!coalesce)
          coalesce = setTimeout(() => {
            coalesce = undefined;
            if (!stopped) setEventVersion((v) => v + 1);
          }, 800);
        const row =
          raw.data && typeof raw.data === "object"
            ? raw.data
            : raw.payload && typeof raw.payload === "object"
              ? raw.payload
              : raw;
        const key = String(
          row.alert_id ||
            row.event_id ||
            `${raw.type}:${row.person_id || ""}:${row.timestamp || row.started_at || JSON.stringify(row)}`,
        );
        if (seen.has(key)) return;
        seen.add(key);
        if (seen.size > 500) seen.delete(seen.values().next().value!);
        const entry = {
          ...row,
          type: raw.type,
          _key: key,
          received_at: new Date().toISOString(),
        };
        setEvents((v) => [entry, ...v].slice(0, 200));
        if (
          raw.type === "alert" &&
          readStorage("sentinel.alerts", "true") === "true"
        )
          notice(
            displayText(
              row.description ||
                row.message ||
                `New alert at ${row.camera_name || row.camera_id || "a monitored camera"}`,
            ),
            "info",
          );
      };
      ws.onerror = () => {
        ws?.close();
      };
      ws.onclose = (event) => {
        if (stopped) return;
        if ([1008, 4001, 4401, 4403].includes(event.code)) {
          setSocketState(
            faculty
              ? "Disconnected · live access unavailable"
              : "Polling · live access unavailable",
          );
          return;
        }
        schedule();
      };
    }
    function schedule() {
      if (stopped) return;
      setSocketState(faculty ? "Reconnecting" : "Polling · reconnecting");
      retry = setTimeout(
        connect,
        Math.min(30000, 1000 * 2 ** attempt++) + Math.random() * 300,
      );
    }
    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearTimeout(coalesce);
      ws?.close();
    };
  }, [id, faculty, scoped]);
  // Preserve automatic start from the administrator's PyQt dashboard, once per sign-in.
  useEffect(() => {
    if (!isAdmin || import.meta.env.VITE_AUTO_START_AI === "false") return;
    let active = true;
    api
      .start()
      .then(() => {
        if (active) {
          health.refresh();
          status.refresh();
        }
      })
      .catch((error) => {
        if (active) notice(`AI start failed: ${error.message}`, "error");
      });
    return () => {
      active = false;
    };
  }, [id, isAdmin]);
  const refresh = () => {
    health.refresh();
    status.refresh();
    detections.refresh();
    cameras.refresh();
    members.refresh();
  };
  return (
    <Live.Provider
      value={{
        health,
        status,
        detections,
        cameras,
        members,
        socketState,
        eventVersion,
        events,
        refresh,
        clearEvents: () => setEvents([]),
      }}
    >
      {children}
    </Live.Provider>
  );
}
