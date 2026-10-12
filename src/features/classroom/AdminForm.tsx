import { useEffect, useRef, useState } from "react";
import { Button, ErrorBox, Field, Modal } from "../../components/ui";
import { messageOf } from "../../lib/api";
import { useResource } from "../../lib/hooks";
import { useClassroom } from "./state";
import type {
  FacultyView,
  ClassroomView,
  CourseView,
  SessionView,
} from "./types";

export function DirectoryEditor({
  kind,
  item,
  onClose,
}: {
  kind: "faculty" | "classrooms" | "courses" | "sessions";
  item: FacultyView | ClassroomView | CourseView | SessionView | null;
  onClose: () => void;
}) {
  const { adapter, refresh } = useClassroom();
  const needsOptions = kind === "sessions" || kind === "classrooms";
  const options = useResource(
    (s) => (needsOptions ? adapter!.formOptions(s) : Promise.resolve(null)),
    `options-${kind}`,
  );
  const record = (item ?? {}) as Partial<
    FacultyView & ClassroomView & CourseView & SessionView
  >;
  const [classroomId, setClassroomId] = useState(record.classroomId || "");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending.current) return;
    const f = new FormData(e.currentTarget),
      str = (key: string) => String(f.get(key) ?? "").trim();
    const active = f.get("active") === "on";
    const c = new AbortController();
    pending.current = c;
    setBusy(true);
    setError("");
    try {
      const id = item?.id ?? null;
      if (kind === "faculty")
        await adapter!.saveFaculty!(
          id,
          {
            name: str("name"),
            username: record.username || str("username"),
            email: str("email"),
            active,
            phone: str("phone"),
            age: !item ? Number(str("age")) : undefined,
            facultyCode: str("facultyCode"),
            department: str("department"),
            designation: str("designation"),
            office: str("office"),
            ...(f.get("password")
              ? { password: String(f.get("password")) }
              : {}),
          },
          c.signal,
        );
      else if (kind === "classrooms")
        await adapter!.saveClassroom!(
          id,
          {
            name: str("name"),
            code: str("code"),
            location: str("location"),
            active,
            cameraId: str("cameraId"),
            capacity: str("capacity") ? Number(str("capacity")) : null,
          },
          c.signal,
        );
      else if (kind === "courses")
        await adapter!.saveCourse!(
          id,
          {
            name: str("name"),
            code: str("code"),
            active,
            department: str("department"),
          },
          c.signal,
        );
      else {
        if (str("endTime") <= str("startTime"))
          throw new Error("End time must be after start time.");
        if (str("termEnd") < str("termStart"))
          throw new Error("Term end must be on or after term start.");
        await adapter!.saveSession!(
          id,
          {
            facultyId: str("facultyId"),
            classroomId: str("classroomId"),
            courseId: str("courseId"),
            weekday: Number(str("weekday")),
            startTime: str("startTime"),
            endTime: str("endTime"),
            termStart: str("termStart"),
            termEnd: str("termEnd"),
            timeZone: str("timeZone"),
            minimumMinutes: Number(str("minimumMinutes")),
            active,
          },
          c.signal,
        );
      }
      if (!c.signal.aborted) {
        refresh();
        onClose();
      }
    } catch (err) {
      if (!c.signal.aborted) {
        setError(messageOf(err));
        refresh();
      }
    } finally {
      if (!c.signal.aborted) {
        pending.current = null;
        setBusy(false);
      }
    }
  }
  const field = (
    key: string,
    label: string,
    value?: string | number | null,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <Field label={label}>
      <input name={key} defaultValue={value ?? ""} required {...props} />
    </Field>
  );
  return (
    <Modal
      title={`${item ? "Edit" : "Create"} ${kind === "faculty" ? "faculty account" : kind.slice(0, -1)}`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="modal-body" onSubmit={submit}>
        <ErrorBox message={error} />
        {needsOptions && (
          <ErrorBox message={options.error} retry={options.refresh} />
        )}
        <fieldset
          disabled={
            busy ||
            (needsOptions &&
              (options.loading || !!options.error || !options.data))
          }
        >
          <div className="form-grid">
            {kind !== "sessions" &&
              field("name", "Name", record.name, {
                minLength: kind === "faculty" ? 3 : 2,
                maxLength:
                  kind === "faculty" ? 50 : kind === "courses" ? 150 : 100,
              })}
            {kind === "faculty" && (
              <>
                {field("username", "Username", record.username, {
                  readOnly: !!item,
                  autoComplete: "off",
                  minLength: 3,
                  maxLength: 32,
                  pattern: "[A-Za-z0-9_]+",
                })}
                {field("email", "Email", record.email, { type: "email" })}
                {field("phone", "Phone", record.phone, {
                  type: "tel",
                  pattern: "\\+?[1-9][0-9\\s\\-]{7,20}",
                })}
                {!item &&
                  field("age", "Age", undefined, {
                    type: "number",
                    min: 18,
                    max: 100,
                  })}
                {field("facultyCode", "Faculty code", record.facultyCode, {
                  minLength: 2,
                  maxLength: 30,
                  pattern: "[A-Za-z0-9/\\-]+",
                })}
                {field("department", "Department", record.department, {
                  required: false,
                  maxLength: 100,
                })}
                {field("designation", "Designation", record.designation, {
                  required: false,
                  maxLength: 100,
                })}
                {field("office", "Office", record.office, {
                  required: false,
                  maxLength: 100,
                })}
                {field(
                  "password",
                  item ? "New password (optional)" : "Initial password",
                  "",
                  {
                    type: "password",
                    autoComplete: "new-password",
                    minLength: 12,
                    maxLength: 128,
                    required: !item,
                  },
                )}
              </>
            )}
            {(kind === "classrooms" || kind === "courses") &&
              field("code", "Code", record.code, {
                minLength: 2,
                maxLength: 30,
                pattern: "[A-Za-z0-9/_\\-]+",
              })}
            {kind === "courses" &&
              field("department", "Department", record.department, {
                required: false,
                maxLength: 100,
              })}
            {kind === "classrooms" && (
              <>
                {field("location", "Building / location", record.location, {
                  required: false,
                  maxLength: 100,
                })}
                {field("capacity", "Capacity", record.capacity, {
                  type: "number",
                  min: 1,
                  max: 2000,
                  required: false,
                })}
                <Field label="Classroom camera">
                  <select name="cameraId" defaultValue={record.cameraId || ""}>
                    <option value="">No camera assigned</option>
                    {options.data?.cameras.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}
            {kind === "sessions" && (
              <>
                <Field label="Faculty">
                  <select
                    name="facultyId"
                    required
                    defaultValue={record.facultyId || ""}
                  >
                    <option value="">Select faculty</option>
                    {options.data?.faculty.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Classroom">
                  <select
                    name="classroomId"
                    required
                    value={classroomId}
                    onChange={(e) => setClassroomId(e.target.value)}
                  >
                    <option value="">Select classroom</option>
                    {options.data?.classrooms.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Course">
                  <select
                    name="courseId"
                    required
                    defaultValue={record.courseId || ""}
                  >
                    <option value="">Select course</option>
                    {options.data?.courses.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Camera (from classroom)">
                  <input
                    readOnly
                    value={
                      options.data?.classroomCameras[classroomId]?.label ||
                      "No classroom camera assigned"
                    }
                  />
                </Field>
                <Field label="Weekday">
                  <select
                    name="weekday"
                    required
                    defaultValue={record.weekday ?? 1}
                  >
                    {[
                      "Monday",
                      "Tuesday",
                      "Wednesday",
                      "Thursday",
                      "Friday",
                      "Saturday",
                      "Sunday",
                    ].map((d, i) => (
                      <option key={d} value={i + 1}>
                        {d}
                      </option>
                    ))}
                  </select>
                </Field>
                {field("startTime", "Start time", record.startTime, {
                  type: "time",
                  step: 1,
                })}
                {field("endTime", "End time", record.endTime, {
                  type: "time",
                  step: 1,
                })}
                {field("termStart", "Term start", record.termStart, {
                  type: "date",
                })}
                {field("termEnd", "Term end", record.termEnd, { type: "date" })}
                {field(
                  "timeZone",
                  "Session timezone",
                  record.timeZone || "Asia/Kolkata",
                  { maxLength: 64 },
                )}
                {field(
                  "minimumMinutes",
                  "Minimum presence (minutes)",
                  record.minimumMinutes ?? 30,
                  { type: "number", min: 1, max: 600 },
                )}
              </>
            )}
          </div>
          <label className="permission-row">
            <span>Active</span>
            <input
              type="checkbox"
              name="active"
              defaultChecked={record.active ?? true}
            />
          </label>
          {kind === "sessions" && (
            <p className="muted">
              This weekly class repeats within its term dates. Assign students
              after saving.
            </p>
          )}
          {kind === "classrooms" && item && (
            <p className="muted">
              Changing the classroom camera clears its attendance zone; redraw
              it for the new camera.
            </p>
          )}
          <div className="form-actions">
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
