import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { BellRing, Volume2 } from "lucide-react";
import { Button } from "../../components/ui";
import { useAuth } from "../../state";
import { parseHostelEvent, type HostelEvent } from "./api";
const Live = createContext<{
  events: HostelEvent[];
  revision: number;
  audioEnabled: boolean;
  enableAudio: () => Promise<void>;
}>({
  events: [],
  revision: 0,
  audioEnabled: false,
  enableAudio: async () => {},
});
export const useHostelLive = () => useContext(Live);
export function HostelLiveProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth(),
    eligible = ["admin", "hostel_warden", "hostel_guard"].includes(
      session?.user.role,
    );
  const [events, setEvents] = useState<HostelEvent[]>([]),
    [revision, setRevision] = useState(0),
    [popup, setPopup] = useState<HostelEvent | null>(null),
    [audioEnabled, setAudioEnabled] = useState(false);
  const audio = useRef<AudioContext | null>(null),
    seen = useRef(new Set<string>());
  useEffect(() => {
    // A new login must never inherit a previous account's notifications.
    seen.current.clear();
    setEvents([]);
    setPopup(null);
  }, [session?.token]);
  async function enableAudio() {
    try {
      audio.current ??= new AudioContext();
      await audio.current.resume();
      setAudioEnabled(audio.current.state === "running");
    } catch {
      setAudioEnabled(false);
    }
  }
  const sound = useCallback(() => {
    const ctx = audio.current;
    if (!ctx || ctx.state !== "running") return;
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator(),
        g = ctx.createGain(),
        at = ctx.currentTime + i * 0.35;
      o.frequency.value = i % 2 ? 660 : 880;
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.13, at + 0.02);
      g.gain.linearRampToValueAtTime(0, at + 0.25);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(at);
      o.stop(at + 0.26);
    }
  }, []);
  useEffect(() => {
    if (!eligible) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const receive = (input: Event) => {
      const e = parseHostelEvent((input as CustomEvent).detail);
      if (!e || seen.current.has(e.data.message_id)) return;
      seen.current.add(e.data.message_id);
      if (seen.current.size > 2000)
        seen.current.delete(seen.current.values().next().value!);
      setEvents((v) => [e, ...v].slice(0, 100));
      if (!timer)
        timer = setTimeout(() => {
          setRevision((v) => v + 1);
          timer = undefined;
        }, 200);
      if (e.data.sound_required === true) sound();
      if (
        [
          "hostel.unauthorized_entry",
          "hostel.late_entry",
          "hostel.overdue_return",
          "hostel.security_event",
        ].includes(e.type)
      ) {
        setPopup(e);
      }
      if (
        ["hostel.alert_resolved", "hostel.alert_acknowledged"].includes(e.type)
      )
        setPopup((v) => (v?.data.alert_id === e.data.alert_id ? null : v));
    };
    window.addEventListener("nayantra:hostel-event", receive);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("nayantra:hostel-event", receive);
    };
  }, [eligible, sound, session?.token]);
  useEffect(
    () => () => {
      void audio.current?.close();
    },
    [],
  );
  return (
    <Live.Provider value={{ events, revision, audioEnabled, enableAudio }}>
      {children}
      {eligible && popup && (
        <aside className="hostel-alarm" role="alert" aria-live="assertive">
          <BellRing size={24} />
          <div>
            <strong>{popup.data.title || "Hostel security alert"}</strong>
            <p>{popup.data.description}</p>
            <Link
              onClick={() => setPopup(null)}
              to={`/hostels/${popup.data.hostel_id}/alerts`}
            >
              Open alert
            </Link>
            {!audioEnabled && (
              <Button onClick={enableAudio}>
                <Volume2 size={16} />
                Enable alert sound
              </Button>
            )}
          </div>
          <Button
            onClick={() => setPopup(null)}
            aria-label="Dismiss alert popup"
          >
            ×
          </Button>
        </aside>
      )}
    </Live.Provider>
  );
}
