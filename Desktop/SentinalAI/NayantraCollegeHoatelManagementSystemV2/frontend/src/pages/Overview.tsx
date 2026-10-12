import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  CheckCheck,
  ChevronRight,
  LayoutGrid,
  Maximize,
  Radio,
  ShieldAlert,
  Users,
  Video,
  Play,
  Square,
} from "lucide-react";
import { api, messageOf, type Row } from "../lib/api";
import {
  detectionState,
  people,
  reference,
  similarity,
  userName,
  dateTime,
  displayText,
} from "../lib/domain";
import { useAuth, useLive } from "../state";
import {
  Badge,
  Button,
  Empty,
  ErrorBox,
  Loading,
  Metric,
  Modal,
  PageTitle,
  Panel,
  Refresh,
  SearchBox,
  Status,
  Avatar,
} from "../components/ui";
import { CameraTile } from "../components/CameraTile";
import { SubjectModal } from "../components/SubjectModal";
export function AiControls() {
  const { isAdmin, notice } = useAuth();
  const { health, refresh } = useLive();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!isAdmin) return null;
  async function change(start: boolean) {
    if (
      !start &&
      !window.confirm("Stop the AI service for all connected operators?")
    )
      return;
    setBusy(true);
    setError("");
    try {
      await (start ? api.start() : api.stop());
      refresh();
      notice(start ? "AI service started." : "AI service stopped.", "success");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <Button
        variant={health.data?.status === "running" ? "" : "primary"}
        disabled={busy}
        onClick={() => change(health.data?.status !== "running")}
      >
        {health.data?.status === "running" ? (
          <Square size={14} />
        ) : (
          <Play size={14} />
        )}{" "}
        {busy
          ? "Working…"
          : health.data?.status === "running"
            ? "Stop AI"
            : "Start AI"}
      </Button>
      <ErrorBox message={error} />
    </div>
  );
}
export function CameraWorkspace({ compact = false }: { compact?: boolean }) {
  const { cameras } = useLive();
  const [mode, setMode] = useState("grid"),
    [selected, setSelected] = useState(""),
    [expanded, setExpanded] = useState<Row | null>(null),
    [search, setSearch] = useState("");
  const rows = (cameras.data || []).filter((row) =>
    `${row.camera_name} ${row.camera_id} ${row.location_name || ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const focus =
    rows.find((row) => String(row.camera_id) === selected) || rows[0];
  const visible = mode === "focus" ? (focus ? [focus] : []) : rows;
  return (
    <Panel
      title={compact ? "Live camera workspace" : "Camera feeds"}
      subtitle={`${cameras.data?.length ?? 0} assigned cameras · streams use your account permissions`}
      action={
        <div className="view-toggle">
          <button
            aria-label="Grid view"
            aria-pressed={mode === "grid"}
            className={mode === "grid" ? "active" : ""}
            onClick={() => setMode("grid")}
          >
            <LayoutGrid size={16} />
          </button>
          <button
            aria-label="Focus view"
            aria-pressed={mode === "focus"}
            className={mode === "focus" ? "active" : ""}
            onClick={() => setMode("focus")}
          >
            <Maximize size={16} />
          </button>
        </div>
      }
    >
      <div className="camera-toolbar">
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Find a camera…"
        />
        {mode === "focus" && (
          <select
            aria-label="Select camera"
            value={focus?.camera_id || ""}
            onChange={(e) => setSelected(e.target.value)}
          >
            {rows.map((c) => (
              <option key={c.camera_id} value={c.camera_id}>
                {c.camera_name || c.camera_id}
              </option>
            ))}
          </select>
        )}
        <Refresh onClick={cameras.refresh} loading={cameras.loading} />
      </div>
      <ErrorBox message={cameras.error} retry={cameras.refresh} />
      {cameras.loading && !cameras.data ? (
        <Loading />
      ) : !visible.length ? (
        <Empty
          icon={Video}
          title={
            cameras.error ? "Camera list unavailable" : "No cameras assigned"
          }
          detail="Your administrator can assign camera access to your account."
        />
      ) : (
        <div className={`camera-grid ${mode === "focus" ? "focus" : ""}`}>
          {visible.map((camera) => (
            <CameraTile
              key={camera.camera_id}
              camera={camera}
              onExpand={() => setExpanded(camera)}
            />
          ))}
        </div>
      )}
      {expanded && (
        <Modal
          title={expanded.camera_name || "Camera view"}
          onClose={() => setExpanded(null)}
          wide
        >
          <CameraTile camera={expanded} expanded />
        </Modal>
      )}
    </Panel>
  );
}
export function DetectionPanel({
  authorized,
  onSelect,
}: {
  authorized: boolean;
  onSelect: (ref: string) => void;
}) {
  const { detections } = useLive();
  const { isAdmin } = useAuth();
  const rows = people(detections.data || [], authorized);
  return (
    <Panel
      title={authorized ? "Authorized people" : "Needs attention"}
      subtitle={
        authorized
          ? "Recognized in the current camera feed"
          : "Decided identities without authorization"
      }
      action={
        <span className={`count ${authorized ? "green" : "red"}`}>
          {rows.length}
        </span>
      }
    >
      <ErrorBox message={detections.error} retry={detections.refresh} />
      <div className="people-list">
        {detections.loading && !detections.data ? (
          <Loading />
        ) : !rows.length ? (
          <Empty
            title={
              detections.error
                ? "Detection data unavailable"
                : authorized
                  ? "No authorized people in view"
                  : "No unauthorized people in view"
            }
            icon={authorized ? CheckCheck : ShieldAlert}
          />
        ) : (
          rows.map((row, i) => (
            <button
              className="person-row"
              key={reference(row) || i}
              disabled={
                (!isAdmin && !authorized) ||
                !reference(row) ||
                reference(row) === "unidentified"
              }
              onClick={() => onSelect(reference(row))}
            >
              <Avatar name={authorized ? userName(row) : "Unknown Person"} />
              <span className="person-copy">
                <strong>
                  {authorized
                    ? userName(row)
                    : row.status === "blacklisted"
                      ? "Blacklisted person"
                      : "Unknown person"}
                </strong>
                <span>
                  {reference(row) || "Identifying reference"}{" "}
                  {row.branch ? `· ${row.branch}` : ""}
                </span>
                <small>
                  Face similarity {similarity(row.recognition_confidence)}
                </small>
              </span>
              <ChevronRight size={17} />
            </button>
          ))
        )}
      </div>
    </Panel>
  );
}
export function Overview() {
  const { isAdmin, session } = useAuth();
  const live = useLive();
  const [subject, setSubject] = useState("");
  const connected = live.status.data?.connected && live.status.data?.running;
  const unknown = people(live.detections.data || [], false).length;
  return (
    <>
      <PageTitle
        eyebrow={isAdmin ? "OPERATIONS / OVERVIEW" : "MEMBER / OVERVIEW"}
        title="Your watch, at a glance."
        description="A clear view of your cameras, people, and latest activity."
      >
        <Refresh onClick={live.refresh} loading={live.health.loading} />
        <AiControls />
      </PageTitle>
      <div className="metrics">
        <Metric
          label="Assigned cameras"
          value={live.cameras.data?.length ?? "—"}
          detail={
            live.cameras.error
              ? "Camera list unavailable"
              : "Available to your account"
          }
          icon={Video}
        />
        <Metric
          label="AI camera"
          value={live.status.error ? "—" : connected ? "Online" : "Offline"}
          detail={
            live.health.data?.status === "running"
              ? "Recognition service running"
              : "Check the AI service"
          }
          icon={Activity}
          tone="green"
        />
        <Metric
          label={isAdmin ? "Registered members" : "Your access"}
          value={isAdmin ? (live.members.data?.length ?? "—") : "Member"}
          detail={
            isAdmin
              ? "Accounts in the member directory"
              : userName(session!.user)
          }
          icon={Users}
          tone="purple"
        />
        <Metric
          label="Needs attention"
          value={live.detections.error ? "—" : unknown}
          detail="Unauthorized identities in view"
          icon={ShieldAlert}
          tone="amber"
        />
      </div>
      <div className="service-strip">
        <span>
          <Radio size={15} />
          <strong>{live.socketState}</strong>
        </span>
        <span>
          SCRFD{" "}
          <Badge tone={live.health.data?.scrfd ? "green" : "neutral"}>
            {live.health.data?.scrfd ? "Ready" : "Unavailable"}
          </Badge>
        </span>
        <span>
          ArcFace{" "}
          <Badge tone={live.health.data?.arcface ? "green" : "neutral"}>
            {live.health.data?.arcface ? "Ready" : "Unavailable"}
          </Badge>
        </span>
        <span>
          Detections{" "}
          <strong>
            {live.detections.error
              ? "—"
              : (live.detections.data?.length ?? "—")}
          </strong>
        </span>
        <span className="strip-time">
          Last update {live.detections.updated?.toLocaleTimeString() || "—"}
        </span>
      </div>
      <ErrorBox message={live.health.error} retry={live.health.refresh} />
      {live.status.data?.error && (
        <ErrorBox message={String(live.status.data.error)} />
      )}
      <div className="overview-grid">
        <CameraWorkspace compact />
        <aside className="detection-stack">
          <DetectionPanel authorized onSelect={setSubject} />
          <DetectionPanel authorized={false} onSelect={setSubject} />
        </aside>
      </div>
      <Panel
        title="Latest activity"
        subtitle="Live events received during this session"
        action={
          <Link className="text-link" to="/activity">
            View activity <ArrowRight size={15} />
          </Link>
        }
      >
        {live.events.length ? (
          <div className="activity-list">
            {live.events.slice(0, 4).map((e) => (
              <div className="activity-row" key={e._key}>
                <span className="event-icon">
                  <Activity size={17} />
                </span>
                <div>
                  <strong>
                    {displayText(
                      e.description || e.message || e.event_type || e.type,
                    )}
                  </strong>
                  <p>{e.camera_name || e.camera_id || "Live event"}</p>
                </div>
                <span className="muted small">
                  {dateTime(e.timestamp || e.started_at || e.received_at)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            title="Waiting for live activity"
            detail="New sightings and alerts will appear as your server publishes them."
          />
        )}
      </Panel>
      {subject && (
        <SubjectModal
          reference={subject}
          publicOnly={!isAdmin}
          onClose={() => setSubject("")}
        />
      )}
    </>
  );
}
export function Cameras() {
  return (
    <>
      <PageTitle
        eyebrow="MONITORING / CAMERAS"
        title="Camera console"
        description="Switch views, inspect a feed, and save a frame when it matters."
      >
        <AiControls />
      </PageTitle>
      <CameraWorkspace />
    </>
  );
}
