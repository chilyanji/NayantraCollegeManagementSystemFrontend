import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Plus } from "lucide-react";
import {
  Button,
  Empty,
  ErrorBox,
  Field,
  Modal,
  PageTitle,
  Panel,
} from "../components/ui";
import { messageOf } from "../lib/api";
import { dateTime } from "../lib/domain";
import { useDebounce, useResource } from "../lib/hooks";
import { ClassroomGate, useClassroom } from "../features/classroom/state";
import {
  ClassroomStatus,
  FilterBar,
  Pagination,
  ResourceState,
  SessionPicker,
  useCursor,
} from "../features/classroom/components";
import { DirectoryEditor } from "../features/classroom/AdminForm";
import { sessionTime } from "../features/classroom/components";
import { ZoneEditor } from "../features/classroom/ZoneEditor";
import type {
  AssignmentTarget,
  Capability,
  ClassroomView,
  CourseView,
  FacultyView,
  Filters,
  Option,
  Page,
  SessionView,
  ZoneView,
} from "../features/classroom/types";

const sections = [
  ["faculty", "Faculty", "manageFaculty"],
  ["classrooms", "Classrooms", "manageClassrooms"],
  ["courses", "Courses", "manageCourses"],
  ["sessions", "Sessions", "manageSessions"],
  ["students", "Student assignment", "assignStudents"],
  ["cameras", "Camera assignment", "assignCameras"],
  ["zones", "Attendance zones", "manageZones"],
] as const;
type DirectoryKind = "faculty" | "classrooms" | "courses" | "sessions";
type Entity = FacultyView | ClassroomView | CourseView | SessionView;
interface Listed {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  source: Entity;
}

export function ClassroomAdmin() {
  const { section = "faculty" } = useParams();
  const { can, adapter } = useClassroom();
  const selected = sections.find(([path]) => path === section);
  return (
    <>
      <PageTitle
        eyebrow="ADMINISTRATION / CLASSROOMS"
        title="Classroom setup"
        description="Manage faculty, classrooms, class sessions, assignments and attendance zones."
      />
      <div className="classroom-tabs">
        {sections
          .filter(([, , capability]) => !adapter || can(capability))
          .map(([path, label]) => (
            <Link
              key={path}
              className={path === section ? "active" : ""}
              to={`/classroom-admin/${path}`}
            >
              {label}
            </Link>
          ))}
      </div>
      {selected ? (
        <ClassroomGate capability={selected[2]}>
          {section === "zones" ? (
            <Zones />
          ) : section === "students" || section === "cameras" ? (
            <Assignments key={section} kind={section} />
          ) : (
            <Directory key={section} kind={section as DirectoryKind} />
          )}
        </ClassroomGate>
      ) : (
        <Empty title="Configuration page not found" />
      )}
    </>
  );
}
function Directory({ kind }: { kind: DirectoryKind }) {
  const { adapter, revision } = useClassroom();
  const [filters, setFilters] = useState<Filters>({}),
    [editor, setEditor] = useState<Entity | "new" | null>(null);
  const deferred = useDebounce(filters),
    pager = useCursor(JSON.stringify(deferred));
  const result = useResource(
    async (s): Promise<Page<Listed>> => {
      const f = { ...deferred, cursor: pager.cursor };
      if (kind === "faculty") {
        const p = await adapter!.faculty(f, s);
        return {
          ...p,
          items: p.items.map((v) => ({
            id: v.id,
            title: v.name,
            subtitle: `${v.username} · ${v.email} · ${v.emailVerified ? "Email verified" : "Email pending"}`,
            status: v.active ? "ACTIVE" : "INACTIVE",
            source: v,
          })),
        };
      }
      if (kind === "classrooms") {
        const p = await adapter!.classrooms(f, s);
        return {
          ...p,
          items: p.items.map((v) => ({
            id: v.id,
            title: `${v.code} · ${v.name}`,
            subtitle: `${v.location} · ${v.cameras.join(", ") || "No camera assigned"} · ${v.zoneStatus}`,
            status: v.active ? "ACTIVE" : "INACTIVE",
            source: v,
          })),
        };
      }
      if (kind === "courses") {
        const p = await adapter!.courses(f, s);
        return {
          ...p,
          items: p.items.map((v) => ({
            id: v.id,
            title: v.name,
            subtitle: v.code,
            status: v.active ? "ACTIVE" : "INACTIVE",
            source: v,
          })),
        };
      }
      const p = await adapter!.sessions(f, s);
      return {
        ...p,
        items: p.items.map((v) => ({
          id: v.id,
          title: `${v.course} · ${v.classroom}`,
          subtitle: `${v.faculty} · ${v.cameraName} · ${sessionTime(v)} · ${v.studentCount} students`,
          status: v.status,
          source: v,
        })),
      };
    },
    `admin-${kind}-${revision}-${JSON.stringify(deferred)}-${pager.cursor}`,
  );
  const singular = {
    faculty: "faculty account",
    classrooms: "classroom",
    courses: "course",
    sessions: "session",
  }[kind];
  const editable = !!{
    faculty: adapter!.saveFaculty,
    classrooms: adapter!.saveClassroom,
    courses: adapter!.saveCourse,
    sessions: adapter!.saveSession,
  }[kind];
  return (
    <Panel
      title={sections.find(([s]) => s === kind)?.[1]}
      action={
        editable && (
          <Button variant="primary" onClick={() => setEditor("new")}>
            <Plus size={15} />
            Create {singular}
          </Button>
        )
      }
    >
      <FilterBar
        enabled={adapter!.filters[kind] ?? []}
        value={filters}
        onChange={setFilters}
      />
      <ResourceState resource={result}>
        {!result.data?.items.length ? (
          <Empty title={`No ${kind} configured`} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Details</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {result.data.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.title}</td>
                    <td>
                      <span className="classroom-wrap">{item.subtitle}</span>
                      {"permissions" in item.source && (
                        <details>
                          <summary>Permissions and assignments</summary>
                          <p>
                            {item.source.permissions.join(", ") ||
                              "Access follows the faculty role and server assignments. Individual permission details are not supplied by the server."}
                          </p>
                          <p>
                            Cameras: {item.source.cameras.join(", ") || "None"}
                          </p>
                          <p>
                            Classrooms:{" "}
                            {item.source.classrooms.join(", ") || "None"}
                          </p>
                        </details>
                      )}
                    </td>
                    <td>
                      <ClassroomStatus value={item.status} />
                    </td>
                    <td>
                      {editable && (
                        <Button onClick={() => setEditor(item.source)}>
                          Edit
                        </Button>
                      )}
                      {kind === "sessions" && (
                        <Link
                          className="button"
                          to={`/faculty/sessions/${encodeURIComponent(item.id)}`}
                        >
                          View session
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination data={result.data} pager={pager} loading={result.loading} />
      </ResourceState>
      {editor && (
        <DirectoryEditor
          kind={kind}
          item={editor === "new" ? null : editor}
          onClose={() => setEditor(null)}
        />
      )}
    </Panel>
  );
}
function Assignments({ kind }: { kind: "students" | "cameras" }) {
  const { adapter } = useClassroom();
  const [target, setTarget] = useState<AssignmentTarget>(
      kind === "students" ? "session" : "faculty",
    ),
    [id, setId] = useState("");
  const options = useResource(
    (s) => adapter!.formOptions(s),
    "assignment-options",
  );
  return (
    <div className="classroom-stack">
      <Panel
        title={
          kind === "students" ? "Assign authorized students" : "Assign cameras"
        }
      >
        <ResourceState resource={options}>
          <div className="classroom-filters">
            {kind === "cameras" && (
              <Field label="Assign cameras to">
                <select
                  value={target}
                  onChange={(e) => {
                    setTarget(e.target.value as AssignmentTarget);
                    setId("");
                  }}
                >
                  <option value="faculty">Faculty</option>
                  <option value="classroom">Classroom</option>
                  <option value="session">Session</option>
                </select>
              </Field>
            )}
            {target !== "session" && (
              <Field label={target === "faculty" ? "Faculty" : "Classroom"}>
                <select value={id} onChange={(e) => setId(e.target.value)}>
                  <option value="">Select {target}</option>
                  {(target === "faculty"
                    ? options.data?.faculty
                    : options.data?.classrooms
                  )?.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
        </ResourceState>
        {target === "session" && <SessionPicker value={id} onChange={setId} />}
      </Panel>
      {id && (
        <AssignmentSelection
          key={`${target}-${id}`}
          kind={kind}
          target={target}
          id={id}
        />
      )}
    </div>
  );
}
function AssignmentSelection({
  kind,
  target,
  id,
}: {
  kind: "students" | "cameras";
  target: AssignmentTarget;
  id: string;
}) {
  const { adapter, refresh } = useClassroom();
  const [search, setSearch] = useState(""),
    [selected, setSelected] = useState<Map<string, Option> | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const deferred = useDebounce(search),
    pager = useCursor(deferred);
  const pending = useRef<AbortController | null>(null);
  const result = useResource(
    (s) =>
      kind === "students"
        ? adapter!.studentAssignment(
            id,
            { search: deferred, cursor: pager.cursor },
            s,
          )
        : adapter!.cameraAssignment(
            target,
            id,
            { search: deferred, cursor: pager.cursor },
            s,
          ),
    `assignment-${kind}-${id}-${deferred}-${pager.cursor}`,
  );
  useEffect(() => {
    if (result.data && !result.error)
      setSelected(
        (v) => v ?? new Map(result.data!.selected.map((o) => [o.id, o])),
      );
  }, [result.data, result.error]);
  useEffect(() => () => pending.current?.abort(), []);
  const supported =
    kind === "students"
      ? !!adapter!.saveStudentAssignment
      : !!adapter!.saveCameraAssignment;
  async function save() {
    if (
      !selected ||
      !result.data ||
      result.error ||
      pending.current ||
      result.data.readOnly
    )
      return;
    if (
      !selected.size &&
      !window.confirm("Remove every current assignment from this selection?")
    )
      return;
    const c = new AbortController();
    pending.current = c;
    setBusy(true);
    setError("");
    try {
      if (kind === "students") {
        const outcome = await adapter!.saveStudentAssignment!(
          id,
          [...selected.keys()],
          c.signal,
        );
        if (outcome.warning && !c.signal.aborted) setError(outcome.warning);
      } else
        await adapter!.saveCameraAssignment!(
          target,
          id,
          [...selected.keys()],
          c.signal,
        );
      if (!c.signal.aborted) {
        setSelected(null);
        result.refresh();
        refresh();
      }
    } catch (err) {
      if (!c.signal.aborted) setError(messageOf(err));
    } finally {
      if (!c.signal.aborted) {
        pending.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <Panel
      title={kind === "students" ? "Student selection" : "Camera selection"}
    >
      <ErrorBox message={error} />
      {adapter!.filters.assignments?.includes("search") && (
        <div className="classroom-filters">
          <Field label="Find candidates">
            <input
              type="search"
              value={search}
              disabled={busy}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
        </div>
      )}
      <ResourceState resource={result}>
        <p className="classroom-card-body muted">{result.data?.notice}</p>
        <fieldset
          disabled={
            busy || !!result.error || !selected || result.data?.readOnly
          }
        >
          {!!selected?.size && (
            <div className="classroom-card-body">
              <p>{selected.size} selected across all pages</p>
              <div className="classroom-selected">
                {[...selected.values()].map((v) => (
                  <Button
                    key={v.id}
                    onClick={() =>
                      setSelected((previous) => {
                        const next = new Map(previous);
                        next.delete(v.id);
                        return next;
                      })
                    }
                  >
                    Remove {v.label} ×
                  </Button>
                ))}
              </div>
            </div>
          )}
          <div className="permission-list">
            {result.data?.available.items.map((item) => (
              <label className="permission-row" key={item.id}>
                <span>{item.label}</span>
                <input
                  type="checkbox"
                  checked={selected?.has(item.id) ?? false}
                  onChange={(e) =>
                    setSelected((previous) => {
                      const next = new Map(
                        result.data?.multiple === false ? [] : previous,
                      );
                      if (e.target.checked) next.set(item.id, item);
                      else next.delete(item.id);
                      return next;
                    })
                  }
                />
              </label>
            ))}
            {!result.data?.available.items.length && (
              <Empty title="No candidates found" />
            )}
          </div>
          <Pagination
            data={result.data?.available ?? null}
            pager={pager}
            loading={result.loading || busy}
          />
          <div className="form-actions">
            <Button
              variant="primary"
              onClick={save}
              disabled={
                busy ||
                result.loading ||
                !result.data ||
                !!result.error ||
                !selected ||
                !supported ||
                result.data?.readOnly
              }
            >
              {busy ? "Saving…" : "Save assignments"}
            </Button>
          </div>
        </fieldset>
      </ResourceState>
    </Panel>
  );
}
function Zones() {
  const { adapter, revision } = useClassroom();
  const pager = useCursor("zones"),
    [editor, setEditor] = useState<ZoneView | "new" | null>(null);
  const result = useResource(
    (s) => adapter!.zones({ cursor: pager.cursor }, s),
    `zones-${revision}-${pager.cursor}`,
  );
  return (
    <Panel
      title="Attendance zones"
      action={
        adapter!.saveZone && (
          <Button variant="primary" onClick={() => setEditor("new")}>
            <Plus size={15} />
            Configure zone
          </Button>
        )
      }
    >
      <ResourceState resource={result}>
        {!result.data?.items.length ? (
          <Empty title="No attendance zones configured" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Zone</th>
                  <th>Camera</th>
                  <th>Status</th>
                  <th>Points</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {result.data.items.map((z) => (
                  <tr key={z.id}>
                    <td>{z.name}</td>
                    <td>{z.camera}</td>
                    <td>
                      <ClassroomStatus
                        value={z.configured ? "CONFIGURED" : "NOT CONFIGURED"}
                      />
                    </td>
                    <td>{z.points.length}</td>
                    <td>
                      {adapter!.saveZone && (
                        <Button onClick={() => setEditor(z)}>Edit zone</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination data={result.data} pager={pager} loading={result.loading} />
      </ResourceState>
      {editor && (
        <ZoneEditor
          zone={editor === "new" ? null : editor}
          onClose={() => setEditor(null)}
        />
      )}
    </Panel>
  );
}
