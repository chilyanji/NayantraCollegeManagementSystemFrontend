import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useLocation } from "react-router-dom";
import { Volume2 } from "lucide-react";
import { useAuth, useLive } from "../../state";
import { useResource } from "../../lib/hooks";
import { Button, Empty, ErrorBox, Loading, Panel } from "../../components/ui";
import { classroomAdapter } from "./backend";
import {
  EventMemory,
  notificationKey,
  shouldNotify,
  shouldSound,
} from "./events";
import type { Capability, ClassroomEvent } from "./types";

const ClassroomContext = createContext<{
  adapter: typeof classroomAdapter;
  can: (capability: Capability) => boolean;
  ready: boolean;
  error: string;
  revision: number;
  refresh: () => void;
  refreshAccess: () => void;
  permissions: string[];
}>(null!);
export const useClassroom = () => useContext(ClassroomContext);

export function ClassroomProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
 const location = useLocation();
  const eligible =
    session?.user.role === "faculty" || session?.user.role === "admin";
  const access = useResource(
    (s) =>
      eligible && classroomAdapter
        ? classroomAdapter.access(s)
        : Promise.resolve(null),
    `classroom-access-${session?.token}`,
  );
  const [revision, setRevision] = useState(0);
  const [notifications, setNotifications] = useState<ClassroomEvent[]>([]);
  const [audioState, setAudioState] = useState("disabled");
  const audio = useRef<AudioContext | null>(null);
  const eventMemory = useRef(new EventMemory());
  const noticeMemory = useRef(new EventMemory());
  const { socketState } = useLive();
  const previousSocket = useRef(socketState);
  const refresh = () => setRevision((v) => v + 1);
  const can = (capability: Capability) =>
    eligible &&
    !access.loading &&
    !access.error &&
    access.data?.capabilities.includes(capability) === true;
  const canNotify = can("alerts");

  useEffect(() => {
    if (socketState === "Live" && previousSocket.current !== "Live") {
      refresh();
      access.refresh();
    }
    previousSocket.current = socketState;
  }, [socketState, access.refresh]);

  useEffect(() => {
    const events = eventMemory.current;
    const notices = noticeMemory.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function receive(event: Event) {
      const item = (event as CustomEvent<ClassroomEvent>).detail;
      if (
        !item ||
        !events.accept(`${item.kind}:${item.id}:${item.revision || ""}`)
      )
        return;
      if (item.kind === "evidence_created" && item.evidenceId && item.alertId)
        setNotifications((v) =>
          v.map((n) =>
            n.alertId === item.alertId
              ? { ...n, evidenceId: item.evidenceId }
              : n,
          ),
        );
      if (!timer)
        timer = setTimeout(() => {
          timer = undefined;
          refresh();
        }, 800);
      if (
        !canNotify ||
        !shouldNotify(item) ||
        !notices.accept(notificationKey(item))
      )
        return;
      setNotifications((v) => [item, ...v].slice(0, 4));
      if (shouldSound(item)) {
        const context = audio.current;
        if (context?.state === "running") {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.frequency.value = 880;
          gain.gain.setValueAtTime(0.12, context.currentTime);
          gain.gain.exponentialRampToValueAtTime(
            0.001,
            context.currentTime + 0.65,
          );
          oscillator.start();
          oscillator.stop(context.currentTime + 0.65);
          oscillator.onended = () => {
            oscillator.disconnect();
            gain.disconnect();
          };
        } else setAudioState("blocked");
      }
    }
    window.addEventListener("nayantra:classroom-event", receive);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("nayantra:classroom-event", receive);
    };
  }, [session?.token, canNotify]);
  useEffect(
    () => () => {
      void audio.current?.close();
      audio.current = null;
    },
    [],
  );
  async function enableAudio() {
    try {
      audio.current ??= new AudioContext();
      await audio.current.resume();
      setAudioState(audio.current.state === "running" ? "enabled" : "blocked");
    } catch {
      setAudioState("unavailable");
    }
  }
  return (
    <ClassroomContext.Provider
      value={{
        adapter: classroomAdapter,
        can,
        ready: !access.loading,
        error: access.error,
        revision,
        refresh,
        refreshAccess: access.refresh,
        permissions: access.data?.permissions ?? [],
      }}
    >
      {children}
      {classroomAdapter && canNotify && !location.pathname.startsWith("/hostels") && (
        <div className="classroom-sound">
          {audioState === "enabled" ? (
            <span>Alert sound enabled</span>
          ) : (
            <Button onClick={enableAudio}>
              <Volume2 size={15} /> Enable alert sound
            </Button>
          )}
          {audioState === "blocked" && (
            <small>
              Sound is paused by the browser. Enable it to hear new alerts.
            </small>
          )}
          {audioState === "unavailable" && (
            <small>Audio unavailable. Visual alerts remain active.</small>
          )}
        </div>
      )}
      <div className="classroom-notices" aria-live="assertive">
        {notifications.map((item) => (
          <div
            className={`toast ${shouldSound(item) ? "error" : "info"}`}
            role="alert"
            key={notificationKey(item)}
          >
            <div>
              <strong>
                {item.kind === "early_exit" || item.alertType === "EARLY_EXIT"
                  ? "Early exit detected"
                  : item.kind === "unauthorized_entry" ||
                      item.alertType === "UNAUTHORIZED_ENTRY"
                    ? "Unauthorized entry detected"
                    : "Classroom alert"}
              </strong>
              <p>{item.message}</p>
              {item.evidenceId && can("evidence") && (
                <Link
                  to={`/faculty/evidence/${encodeURIComponent(item.evidenceId)}`}
                >
                  View evidence
                </Link>
              )}
            </div>
            <button
              aria-label="Dismiss classroom alert"
              onClick={() =>
                setNotifications((v) => v.filter((n) => n !== item))
              }
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ClassroomContext.Provider>
  );
}

export function ClassroomGate({
  capability,
  children,
}: {
  capability: Capability;
  children: ReactNode;
}) {
  const { adapter, can, ready, error, refreshAccess } = useClassroom();
  if (!adapter)
    return (
      <Panel>
        <Empty
          title="Classroom monitoring is not available yet"
          detail="Your administrator needs to finish connecting this module before sessions, attendance and evidence can be loaded."
        />
      </Panel>
    );
  if (!ready) return <Loading />;
  if (error) return <ErrorBox message={error} retry={refreshAccess} />;
  if (!can(capability))
    return (
      <Panel>
        <Empty
          title="Access not granted"
          detail="Your account does not have access to this classroom feature. Contact your administrator."
        />
      </Panel>
    );
  return <>{children}</>;
}
