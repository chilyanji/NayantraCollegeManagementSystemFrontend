import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Bell,
  BookOpen,
  Clock,
  Image,
  LogIn,
  LogOut,
  ShieldAlert,
  Users,
  Video,
} from "lucide-react";
import {
  Badge,
  Button,
  Empty,
  Metric,
  PageTitle,
  Panel,
  Refresh,
} from "../components/ui";
import { CameraTile } from "../components/CameraTile";
import { dateTime } from "../lib/domain";
import { useDebounce, useResource } from "../lib/hooks";
import { useLive } from "../state";
import { ClassroomGate, useClassroom } from "../features/classroom/state";
import {
  AuthenticatedImage,
  ClassroomStatus,
  ConfirmAction,
  duration,
  FilterBar,
  Pagination,
  ResourceState,
  SessionCards,
  SessionPicker,
  sessionTime,
  useCursor,
} from "../features/classroom/components";
import type {
  AlertView,
  Capability,
  EvidenceView,
  Filters,
} from "../features/classroom/types";

function FacultyPage({
  title,
  description,
  capability,
  children,
}: {
  title: string;
  description: string;
  capability: Capability;
  children: ReactNode;
}) {
  const { socketState } = useLive();
  const { refresh } = useClassroom();
  return (
    <>
      <PageTitle
        eyebrow="NAYANTRA / CLASSROOM MONITORING"
        title={title}
        description={description}
      >
        <Badge tone={socketState === "Live" ? "green" : "neutral"}>
          {socketState}
        </Badge>
        <Refresh onClick={refresh} />
      </PageTitle>
      <ClassroomGate capability={capability}>
        <div className="classroom-stack">{children}</div>
      </ClassroomGate>
    </>
  );
}
export function FacultyDashboard() {
  return (
    <FacultyPage
      title="Your classroom, at a glance."
      description="Assigned sessions, student attendance and events requiring your attention."
      capability="overview"
    >
      <OverviewContent />
    </FacultyPage>
  );
}
function OverviewContent() {
  const { adapter, revision, can } = useClassroom();
  const result = useResource(
    (s) => adapter!.overview(s),
    `faculty-overview-${revision}`,
  );
  const value = result.data;
  const stats = [
    ["Active sessions", value?.activeSessions, BookOpen, "blue"],
    ["Students inside", value?.studentsInside, LogIn, "green"],
    ["Students outside", value?.studentsOutside, LogOut, "purple"],
    ["Open early exit alerts", value?.earlyExitAlerts, Clock, "amber"],
    [
      "Open unauthorized alerts",
      value?.unauthorizedEntryAlerts,
      ShieldAlert,
      "red",
    ],
    ["Pending evidence", value?.pendingEvidence, Image, "amber"],
    ["Assigned cameras", value?.assignedCameras, Video, "blue"],
    ["Current/upcoming today", value?.todaySessions, Users, "purple"],
  ] as const;
  return (
    <ResourceState resource={result}>
      {value?.note && <p className="muted small">{value.note}</p>}
      <div className="metrics">
        {stats.map(([label, count, icon, tone]) => (
          <Metric
            key={label}
            label={label}
            value={count ?? "—"}
            detail="Your assigned classroom activity"
            icon={icon}
            tone={tone}
          />
        ))}
      </div>
      {can("sessions") && (
        <Panel
          title="Today's sessions"
          subtitle="Open a session to review its camera, attendance and event history."
        >
          <SessionCards sessions={value?.sessions ?? []} />
        </Panel>
      )}
    </ResourceState>
  );
}
export function FacultySessions() {
  return (
    <FacultyPage
      title="Assigned sessions"
      description="Each session represents one class, its faculty, camera and authorized students."
      capability="sessions"
    >
      <SessionsContent />
    </FacultyPage>
  );
}
function SessionsContent() {
  const { adapter, revision } = useClassroom();
  const [filters, setFilters] = useState<Filters>({});
  const deferred = useDebounce(filters);
  const pager = useCursor(JSON.stringify(deferred));
  const result = useResource(
    (s) => adapter!.sessions({ ...deferred, cursor: pager.cursor }, s),
    `sessions-${revision}-${JSON.stringify(deferred)}-${pager.cursor}`,
  );
  return (
    <>
      <FilterBar
        enabled={adapter!.filters.sessions ?? []}
        value={filters}
        onChange={setFilters}
      />
      <ResourceState resource={result}>
        <SessionCards sessions={result.data?.items ?? []} />
        <Pagination data={result.data} pager={pager} loading={result.loading} />
      </ResourceState>
    </>
  );
}
export function FacultySession() {
  const { sessionId = "" } = useParams();
  return (
    <FacultyPage
      title="Session details"
      description="Class information and the attendance history reported for this session."
      capability="sessions"
    >
      <SessionContent key={sessionId} id={sessionId} />
    </FacultyPage>
  );
}
function SessionContent({ id }: { id: string }) {
  const { adapter, revision, can } = useClassroom();
  const result = useResource(
    (s) => adapter!.session(id, s),
    `session-${id}-${revision}`,
  );
  const item = result.data;
  return (
    <ResourceState resource={result}>
      {item && (
        <>
          <Panel
            title={item.course}
            subtitle={`${item.classroom} · ${item.faculty}`}
            action={<ClassroomStatus value={item.status} />}
          >
            <dl className="details-list classroom-details">
              <dt>Weekly schedule</dt>
              <dd>{sessionTime(item)}</dd>
              <dt>Term dates</dt>
              <dd>
                {item.termStart} – {item.termEnd}
              </dd>
              <dt>Next occurrence</dt>
              <dd>{item.nextOccurrence || "No upcoming occurrence"}</dd>
              <dt>Minimum presence</dt>
              <dd>{item.minimumMinutes} minutes</dd>
              <dt>Assigned camera</dt>
              <dd>{item.cameraName}</dd>
              <dt>Authorized students</dt>
              <dd>{item.studentCount}</dd>
            </dl>
          </Panel>
          {can("cameras") && <CamerasContent sessionCameraId={item.cameraId} />}
          {can("attendance") && (
            <Panel title="Live attendance">
              <AttendanceContent sessionId={id} />
            </Panel>
          )}
          {can("activity") && (
            <Panel title="IN / OUT history">
              <ActivityContent sessionId={id} />
            </Panel>
          )}
          {can("alerts") && (
            <Panel title="Session alerts">
              <AlertsContent sessionId={id} />
            </Panel>
          )}
          {can("evidence") && (
            <Panel title="Session evidence">
              <EvidenceContent sessionId={id} />
            </Panel>
          )}
        </>
      )}
    </ResourceState>
  );
}
export function FacultyCameras() {
  return (
    <FacultyPage
      title="Assigned camera feeds"
      description="Live views from cameras made available to your account."
      capability="cameras"
    >
      <CamerasContent />
    </FacultyPage>
  );
}
function CamerasContent({ sessionCameraId }: { sessionCameraId?: string }) {
  const { adapter, revision } = useClassroom();
  const result = useResource(
    (s) => adapter!.cameras(s),
    `faculty-cameras-${revision}`,
  );
  const rows =
    result.data?.filter((c) => !sessionCameraId || c.id === sessionCameraId) ??
    [];
  return (
    <ResourceState resource={result}>
      {!rows.length ? (
        <Empty
          title="No assigned camera available"
          detail="Camera access is assigned by your administrator."
          icon={Video}
        />
      ) : (
        <div className="camera-grid">
          {rows.map((camera) => (
            <div key={camera.id}>
              <CameraTile
                camera={{
                  camera_id: camera.id,
                  camera_name: camera.name,
                  location_name: camera.classroom,
                }}
              />
              <div className="classroom-camera-info">
                <Badge>{camera.connectionStatus}</Badge>
                <p>{camera.classroom}</p>
                <p>{camera.currentSession || "No active session"}</p>
                <p>
                  {camera.attendanceSummary || "Attendance summary unavailable"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </ResourceState>
  );
}
export function FacultyAttendance() {
  const [sessionId, setSessionId] = useState("");
  return (
    <FacultyPage
      title="Live attendance"
      description="Student states and attendance totals are provided by the classroom service."
      capability="attendance"
    >
      <SessionPicker value={sessionId} onChange={setSessionId} />
      {sessionId ? (
        <Panel title="Attendance">
          <AttendanceContent key={sessionId} sessionId={sessionId} />
        </Panel>
      ) : (
        <Empty title="Select a session to view attendance" />
      )}
    </FacultyPage>
  );
}
function AttendanceContent({ sessionId }: { sessionId: string }) {
  const { adapter, revision } = useClassroom();
  const [filters, setFilters] = useState<Filters>({});
  const deferred = useDebounce(filters);
  const pager = useCursor(JSON.stringify(deferred));
  const result = useResource(
    (s) =>
      adapter!.attendance(sessionId, { ...deferred, cursor: pager.cursor }, s),
    `attendance-${sessionId}-${revision}-${JSON.stringify(deferred)}-${pager.cursor}`,
  );
  return (
    <>
      <FilterBar
        enabled={adapter!.filters.attendance ?? []}
        value={filters}
        onChange={setFilters}
      />
      <ResourceState resource={result}>
        {!result.data?.items.length ? (
          <Empty title="No attendance records for this session" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Roll number</th>
                  <th>Student</th>
                  <th>Current state</th>
                  <th>Last entry</th>
                  <th>Last exit</th>
                  <th>Duration inside</th>
                  <th>Attendance status</th>
                </tr>
              </thead>
              <tbody>
                {result.data.items.map((row) => (
                  <tr key={row.id}>
                    <td>{row.rollNumber}</td>
                    <td>{row.name}</td>
                    <td>
                      <ClassroomStatus value={row.state} />
                    </td>
                    <td>{dateTime(row.lastEntry)}</td>
                    <td>{dateTime(row.lastExit)}</td>
                    <td>{duration(row.durationSeconds)}</td>
                    <td>
                      <ClassroomStatus value={row.attendanceStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination data={result.data} pager={pager} loading={result.loading} />
      </ResourceState>
    </>
  );
}
export function FacultyActivity() {
  const [sessionId, setSessionId] = useState("");
  return (
    <FacultyPage
      title="Student activity"
      description="Complete entry and exit history, including repeated exits and re-entry."
      capability="activity"
    >
      <SessionPicker value={sessionId} onChange={setSessionId} />
      {sessionId ? (
        <Panel title="Movement history">
          <ActivityContent key={sessionId} sessionId={sessionId} />
        </Panel>
      ) : (
        <Empty title="Select a session to view activity" />
      )}
    </FacultyPage>
  );
}
function ActivityContent({ sessionId }: { sessionId: string }) {
  const { adapter, revision } = useClassroom();
  const [filters, setFilters] = useState<Filters>({});
  const deferred = useDebounce(filters);
  const pager = useCursor(JSON.stringify(deferred));
  const result = useResource(
    (s) =>
      adapter!.activity({ ...deferred, sessionId, cursor: pager.cursor }, s),
    `activity-${sessionId}-${revision}-${JSON.stringify(deferred)}-${pager.cursor}`,
  );
  return (
    <>
      <FilterBar
        enabled={adapter!.filters.activity ?? []}
        value={filters}
        onChange={setFilters}
      />
      <ResourceState resource={result}>
        {!result.data?.items.length ? (
          <Empty title="No movement events recorded" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Student</th>
                  <th>Roll number</th>
                  <th>Event</th>
                  <th>Classroom</th>
                  <th>Camera</th>
                  <th>Session</th>
                  <th>Duration</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {result.data.items.map((row) => (
                  <tr key={row.id}>
                    <td>{dateTime(row.timestamp)}</td>
                    <td>{row.name}</td>
                    <td>{row.rollNumber}</td>
                    <td>
                      <ClassroomStatus value={row.event} />
                    </td>
                    <td>{row.classroom}</td>
                    <td>{row.camera}</td>
                    <td>{row.session}</td>
                    <td>{duration(row.durationSeconds)}</td>
                    <td>
                      <ClassroomStatus value={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination data={result.data} pager={pager} loading={result.loading} />
      </ResourceState>
    </>
  );
}
export function FacultyAlerts() {
  return (
    <FacultyPage
      title="Classroom alerts"
      description="Review early exits and unauthorized entries reported for your classes."
      capability="alerts"
    >
      <AlertsContent />
    </FacultyPage>
  );
}
function AlertsContent({ sessionId }: { sessionId?: string }) {
  const { adapter, revision, can, refresh } = useClassroom();
  const [selected, setSelected] = useState<AlertView | null>(null),
    [filters, setFilters] = useState<Filters>({});
  const deferred = useDebounce(filters),
    pager = useCursor(JSON.stringify(deferred));
  const result = useResource(
    (s) => adapter!.alerts({ ...deferred, sessionId, cursor: pager.cursor }, s),
    `alerts-${sessionId}-${revision}-${JSON.stringify(deferred)}-${pager.cursor}`,
  );
  return (
    <>
      <FilterBar
        enabled={adapter!.filters.alerts ?? []}
        value={filters}
        onChange={setFilters}
      />
      <ResourceState resource={result}>
        {!result.data?.items.length ? (
          <Empty title="No classroom alerts" icon={Bell} />
        ) : (
          <div className="classroom-stack">
            {result.data.items.map((item) => (
              <Panel key={item.id}>
                <div className="classroom-card-body">
                  <div className="classroom-row">
                    <h3>{item.type.replaceAll("_", " ")}</h3>
                    <ClassroomStatus value={item.severity} />
                  </div>
                  <p>{item.message}</p>
                  <p>
                    {item.name} · {item.rollNumber} · {item.classroom}
                  </p>
                  <p>
                    {item.session} · {item.camera} · {dateTime(item.createdAt)}
                  </p>
                  <div className="actions">
                    <ClassroomStatus value={item.status} />
                    {item.evidenceId && can("evidence") && (
                      <Link
                        className="button"
                        to={`/faculty/evidence/${encodeURIComponent(item.evidenceId)}`}
                      >
                        View evidence
                      </Link>
                    )}
                    {can("resolveAlerts") &&
                      item.canResolve &&
                      adapter!.resolveAlert && (
                        <Button onClick={() => setSelected(item)}>
                          Resolve
                        </Button>
                      )}
                  </div>
                </div>
              </Panel>
            ))}
          </div>
        )}
        <Pagination data={result.data} pager={pager} loading={result.loading} />
      </ResourceState>
      {selected && (
        <ConfirmAction
          title="Resolve classroom alert"
          detail="Mark this alert as resolved? The attendance history will remain available."
          action={(s) => adapter!.resolveAlert!(selected.id, s)}
          onClose={() => setSelected(null)}
          onSuccess={refresh}
        />
      )}
    </>
  );
}
export function FacultyEvidence() {
  return (
    <FacultyPage
      title="Evidence box"
      description="Review classroom snapshots, retention dates and alert status."
      capability="evidence"
    >
      <EvidenceContent />
    </FacultyPage>
  );
}
function EvidenceContent({ sessionId }: { sessionId?: string }) {
  const { adapter, revision } = useClassroom();
  const [filters, setFilters] = useState<Filters>({});
  const deferred = useDebounce(filters),
    pager = useCursor(JSON.stringify(deferred));
  const result = useResource(
    (s) =>
      adapter!.evidence({ ...deferred, sessionId, cursor: pager.cursor }, s),
    `evidence-${sessionId}-${revision}-${JSON.stringify(deferred)}-${pager.cursor}`,
  );
  return (
    <>
      <FilterBar
        enabled={adapter!.filters.evidence ?? []}
        value={filters}
        onChange={setFilters}
      />
      <ResourceState resource={result}>
        {!result.data?.items.length ? (
          <Empty
            title="No active evidence"
            detail="Snapshots requiring review will appear here."
            icon={Image}
          />
        ) : (
          <div className="classroom-card-grid">
            {result.data.items.map((item) => (
              <Panel key={item.id}>
                <div className="classroom-snapshot">
                  {item.snapshotAvailable ? (
                    <AuthenticatedImage
                      load={(s) => adapter!.snapshot(item.id, s)}
                      resourceKey={`snapshot-${item.id}-${revision}`}
                      alt={`Evidence for ${item.rollNumber}`}
                    />
                  ) : (
                    <Empty title="Snapshot unavailable" />
                  )}
                </div>
                <div className="classroom-card-body">
                  <h3>
                    {item.name} · {item.rollNumber}
                  </h3>
                  <p>
                    {item.classroom} · {item.session}
                  </p>
                  <ClassroomStatus value={item.alertType} />
                  <p>
                    Inside: {duration(item.durationSeconds)} · Exit:{" "}
                    {dateTime(item.exitTime)}
                  </p>
                  <p>Created: {dateTime(item.createdAt)}</p>
                  <p>Expires: {dateTime(item.expiresAt)}</p>
                  <ClassroomStatus value={item.alertStatus} />
                  <Link
                    className="button"
                    to={`/faculty/evidence/${encodeURIComponent(item.id)}`}
                  >
                    View evidence
                  </Link>
                </div>
              </Panel>
            ))}
          </div>
        )}
        <Pagination data={result.data} pager={pager} loading={result.loading} />
      </ResourceState>
    </>
  );
}
export function FacultyEvidenceDetail() {
  const { evidenceId = "" } = useParams();
  return (
    <FacultyPage
      title="Evidence details"
      description="Snapshot, attendance history and the associated classroom alert."
      capability="evidence"
    >
      <EvidenceDetailContent key={evidenceId} id={evidenceId} />
    </FacultyPage>
  );
}
function EvidenceDetailContent({ id }: { id: string }) {
  const { adapter, revision, can, refresh } = useClassroom();
  const result = useResource(
    (s) => adapter!.evidenceDetail(id, s),
    `evidence-detail-${id}-${revision}`,
  );
  const [resolve, setResolve] = useState(false);
  const item: EvidenceView | null = result.data;
  return (
    <>
      <Link to="/faculty/evidence">← Back to evidence box</Link>
      <ResourceState resource={result}>
        {item && (
          <Panel title={`${item.name} · ${item.rollNumber}`}>
            <div className="classroom-evidence-detail">
              <div className="classroom-snapshot">
                {item.snapshotAvailable ? (
                  <AuthenticatedImage
                    load={(s) => adapter!.snapshot(id, s)}
                    resourceKey={`snapshot-detail-${id}-${revision}`}
                    alt={`Evidence for ${item.rollNumber}`}
                  />
                ) : (
                  <Empty
                    title="Snapshot unavailable"
                    detail="Attendance history is retained when snapshots are removed."
                  />
                )}
              </div>
              <dl className="details-list">
                {[
                  ["Classroom", item.classroom],
                  ["Session", item.session],
                  ["Camera", item.camera],
                  ["Exit", dateTime(item.exitTime)],
                  ["Duration inside", duration(item.durationSeconds)],
                  ["Alert", item.alertType],
                  ["Status", item.alertStatus],
                  ["Created", dateTime(item.createdAt)],
                  ["Expires", dateTime(item.expiresAt)],
                ].map(([label, value]) => (
                  <div className="detail-pair" key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            {item.timeline && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Event</th>
                      <th>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.timeline.map((event) => (
                      <tr key={event.id}>
                        <td>{dateTime(event.timestamp)}</td>
                        <td>
                          <ClassroomStatus value={event.event} />
                        </td>
                        <td>{duration(event.durationSeconds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {can("resolveEvidence") &&
              item.canResolve &&
              adapter!.resolveEvidence && (
                <div className="form-actions">
                  <Button onClick={() => setResolve(true)}>
                    Resolve evidence
                  </Button>
                </div>
              )}
          </Panel>
        )}
      </ResourceState>
      {resolve && (
        <ConfirmAction
          title="Resolve evidence"
          detail="Resolve this evidence and its associated alert? The server will apply its snapshot retention policy. Attendance logs are preserved."
          action={(s) => adapter!.resolveEvidence!(id, s)}
          onClose={() => setResolve(false)}
          onSuccess={refresh}
        />
      )}
    </>
  );
}
