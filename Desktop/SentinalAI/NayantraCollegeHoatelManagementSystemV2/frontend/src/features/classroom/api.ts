import {
  api,
  apiUrl,
  ApiError,
  getSession,
  messageOf,
  query,
  request,
  socketUrl,
} from "../../lib/api";
import { JpegParser } from "../../lib/mjpeg";
import type { ClassroomAdapter } from "./backend";
import type * as C from "./contracts";
import type * as V from "./types";

const encode = encodeURIComponent;
async function list<T>(path: string, signal: AbortSignal): Promise<T[]> {
  const value = await request<unknown>(path, { signal });
  if (
    !Array.isArray(value) ||
    value.some((v) => !v || typeof v !== "object" || Array.isArray(v))
  )
    throw new ApiError("Unexpected classroom response. Expected a list.");
  return value as T[];
}
const rooms = (s: AbortSignal) =>
  list<C.ClassroomResponse>("/admin/classrooms", s);
const sessions = (s: AbortSignal) =>
  list<C.SessionResponse>("/faculty/sessions", s);
const detail = (id: string, s: AbortSignal) =>
  request<C.SessionDetail>(`/faculty/sessions/${encode(id)}`, { signal: s });
const attendance = (id: string, s: AbortSignal, date?: string) =>
  request<C.SessionAttendance>(
    `/faculty/sessions/${encode(id)}/attendance${query({ date })}`,
    { signal: s },
  );
const closed = (status: string) => ["resolved", "dismissed"].includes(status);
const match = (
  needle: string | undefined,
  ...values: (string | null | undefined)[]
) => !needle || values.join(" ").toLowerCase().includes(needle.toLowerCase());

/** Client pages are used ONLY for complete-list routes, or explicitly labelled server-limited results. */
function page<T>(
  items: T[],
  filters: V.Filters,
  size = 25,
  notice?: string,
): V.Page<T> {
  const offset = filters.cursor ? Number(filters.cursor) : 0;
  if (!Number.isSafeInteger(offset) || offset < 0)
    throw new ApiError("Invalid page cursor.");
  return {
    items: items.slice(offset, offset + size),
    total: items.length,
    nextCursor: offset + size < items.length ? String(offset + size) : null,
    notice,
  };
}
export function mapSession(v: C.SessionResponse): V.SessionView {
  return {
    id: v.session_id,
    course: `${v.course_code} · ${v.course_name}`,
    classroom: v.classroom_code,
    cameraId: v.camera_id ?? "",
    cameraName: v.camera_id ?? "No classroom camera",
    faculty: v.faculty_name || v.faculty_code || "—",
    weekday: v.weekday,
    startTime: v.start_time,
    endTime: v.end_time,
    termStart: v.term_start,
    termEnd: v.term_end,
    timeZone: v.time_zone,
    minimumMinutes: v.min_presence_minutes,
    active: v.is_active,
    nextOccurrence: v.next_occurrence,
    status: v.is_live
      ? "ACTIVE"
      : !v.is_active
        ? "DISABLED"
        : v.next_occurrence
          ? "UPCOMING"
          : "COMPLETED",
    studentCount: v.student_count,
    facultyId: String(v.faculty_user_id),
    classroomId: v.classroom_id,
    courseId: v.course_id,
  };
}
export function sessionPayload(v: V.SessionDraft): C.SessionPayload {
  return {
    course_id: v.courseId,
    classroom_id: v.classroomId,
    faculty_user_id: Number(v.facultyId),
    weekday: v.weekday,
    start_time: v.startTime,
    end_time: v.endTime,
    term_start: v.termStart,
    term_end: v.termEnd,
    time_zone: v.timeZone,
    min_presence_minutes: v.minimumMinutes,
    is_active: v.active,
  };
}
function mapAlert(v: C.FacultyAlert): V.AlertView {
  return {
    id: v.alert_id,
    type: v.alert_type.toUpperCase(),
    severity: v.severity,
    status: v.status,
    createdAt: v.created_at,
    message: v.description || v.title,
    name: v.person_name || v.person_ref,
    rollNumber: v.roll_number || v.person_ref,
    classroom: v.classroom_code,
    session: v.course_code,
    camera: v.camera_name || v.camera_id || "—",
    evidenceId: v.evidence_id || undefined,
    canResolve: !closed(v.status),
  };
}
function mapEvidence(v: C.EvidenceBoxItem): V.EvidenceView {
  return {
    id: v.evidence_id,
    name: v.student_name || "Unidentified person",
    rollNumber: v.roll_number || "—",
    classroom: v.classroom_code,
    session: `${v.course_code} · ${v.course_name}`,
    camera: v.camera_name || v.camera_id || "—",
    exitTime: v.exit_time,
    durationSeconds: v.duration_seconds,
    alertType: "EARLY_EXIT",
    alertStatus: v.alert_status,
    createdAt: v.created_at,
    expiresAt: v.expires_at,
    snapshotAvailable: v.has_snapshot,
    canResolve: !closed(v.alert_status),
  };
}
function movement(v: C.Movement, session: C.SessionResponse): V.ActivityView {
  return {
    id: String(v.attendance_event_id),
    studentId: v.person_id || undefined,
    timestamp: v.occurred_at,
    name: v.name || v.person_ref,
    rollNumber: v.roll_number || v.person_ref,
    event: v.direction.toUpperCase(),
    classroom: session.classroom_code,
    camera: session.camera_id || "—",
    session: session.course_code,
    durationSeconds: v.duration_seconds,
    status: v.auth_result.toUpperCase(),
  };
}
function localDate(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return ["year", "month", "day"]
    .map((key) => parts.find((p) => p.type === key)?.value)
    .join("-");
}
async function parallelMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const result: R[] = new Array(items.length);
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(items.length, 4) }, async () => {
      while (index < items.length) {
        const i = index++;
        result[i] = await fn(items[i]);
      }
    }),
  );
  return result;
}
export function safeSnapshotUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError("Invalid snapshot link.");
  }
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new ApiError("Invalid snapshot link.");
  return url.href;
}
export function parseClassroomEvent(raw: unknown): V.ClassroomEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const envelope = raw as Record<string, unknown>;
  if (
    !envelope.data ||
    typeof envelope.data !== "object" ||
    Array.isArray(envelope.data)
  )
    return null;
  const d = envelope.data as Record<string, unknown>;
  if (
    typeof envelope.type !== "string" ||
    typeof d.session_id !== "string" ||
    typeof d.camera_id !== "string"
  )
    return null;
  const kinds: Record<string, V.ClassroomEvent["kind"]> = {
    "attendance.in": "in",
    "attendance.out": "out",
    "attendance.early_exit": "early_exit",
    "attendance.unauthorized_entry": "unauthorized_entry",
    "attendance.unidentified_person": "alert_created",
    "evidence.created": "evidence_created",
    "alert.created": "alert_created",
    "alert.updated": "alert_updated",
    "alert.acknowledged": "alert_updated",
    "alert.resolved": "alert_resolved",
  };
  const kind =
    envelope.type === "alert.updated" && d.escalated === true
      ? "unauthorized_entry"
      : kinds[envelope.type];
  if (!kind) return null;
  const stableId =
    kind === "in" || kind === "out"
      ? d.attendance_event_id
      : kind === "evidence_created"
        ? d.evidence_id
        : d.alert_id;
  if (
    (typeof stableId !== "string" && typeof stableId !== "number") ||
    String(stableId).length === 0
  )
    return null;
  const text = (key: string) =>
    typeof d[key] === "string" ? (d[key] as string) : undefined;
  const message = [
    text("title"),
    text("person_name") || text("person_ref"),
    text("roll_number"),
    text("classroom"),
    typeof d.duration_seconds === "number"
      ? `${Math.floor(d.duration_seconds / 60)} minutes inside`
      : "",
    text("timestamp"),
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    id: String(stableId),
    kind,
    alertId: text("alert_id"),
    alertType: text("alert_type")?.toUpperCase(),
    evidenceId: text("evidence_id"),
    sessionId: text("session_id"),
    message: message || "Classroom activity updated",
    soundRequired: d.sound_required === true,
    revision: d.escalated === true ? "escalated" : text("status"),
  };
}

export function createBackendAdapter(): ClassroomAdapter {
  return {
    async access(signal) {
      const session = getSession();
      if (!session) throw new ApiError("Sign in to view classroom data.", 401);
      const user = await api.profile(session.user.username, signal);
      // This backend exposes role, not a granular permission list. These are UI
      // capabilities matching the inspected require_faculty/require_admin gates.
      // Every HTTP operation still goes through server authorization and scoping.
      const faculty: V.Capability[] = [
        "overview",
        "sessions",
        "cameras",
        "attendance",
        "activity",
        "alerts",
        "evidence",
        "resolveAlerts",
        "resolveEvidence",
      ];
      if (!user.is_active) return { capabilities: [], permissions: [] };
      if (user.role === "admin")
        return {
          capabilities: [
            ...faculty,
            "manageFaculty",
            "manageClassrooms",
            "manageCourses",
            "manageSessions",
            "assignStudents",
            "assignCameras",
            "manageZones",
          ],
          permissions: [],
        };
      if (user.role === "faculty") {
        await request<C.FacultyResponse>("/faculty/me", { signal });
        return { capabilities: faculty, permissions: [] };
      }
      return { capabilities: [], permissions: [] };
    },
    async overview(signal) {
      const [slots, cameras, alerts, evidence] = await Promise.all([
        sessions(signal),
        list<C.CameraResponse>("/faculty/cameras", signal),
        list<C.FacultyAlert>("/faculty/alerts?status=open&limit=200", signal),
        list<C.EvidenceBoxItem>("/faculty/evidence", signal),
      ]);
      const active = slots.filter((s) => s.is_live);
      const summaries = await parallelMap(active, (s) =>
        attendance(s.session_id, signal, localDate(s.time_zone)),
      );
      const today = slots.filter(
        (s) => s.next_occurrence === localDate(s.time_zone),
      );
      return {
        activeSessions: active.length,
        studentsInside: summaries.reduce((n, v) => n + v.summary.inside_now, 0),
        studentsOutside: summaries.reduce(
          (n, v) => n + v.records.filter((r) => r.state === "outside").length,
          0,
        ),
        earlyExitAlerts: alerts.filter((a) => a.alert_type === "early_exit")
          .length,
        unauthorizedEntryAlerts: alerts.filter(
          (a) => a.alert_type === "unauthorized_entry",
        ).length,
        pendingEvidence: evidence.length,
        assignedCameras: cameras.length,
        todaySessions: today.length,
        sessions: today.map(mapSession),
        note: "Attendance totals cover active sessions. Today's list includes current/upcoming occurrences. Alert counts cover up to 200 open alerts; evidence is limited by the server to 500 items.",
      };
    },
    async sessions(filters, signal) {
      return page(
        (await sessions(signal))
          .filter((v) =>
            match(
              filters.search,
              v.course_code,
              v.course_name,
              v.classroom_code,
              v.faculty_name,
            ),
          )
          .map(mapSession),
        filters,
      );
    },
    async session(id, signal) {
      const [slot, cameras] = await Promise.all([
        detail(id, signal),
        list<C.CameraResponse>("/faculty/cameras", signal),
      ]);
      return {
        ...mapSession(slot),
        cameraName:
          cameras.find((c) => c.camera_id === slot.camera_id)?.camera_name ||
          slot.camera_id ||
          "No camera assigned",
      };
    },
    async cameras(signal) {
      const [cameras, slots, runtime] = await Promise.all([
        list<C.CameraResponse>("/faculty/cameras", signal),
        sessions(signal),
        api.aiCameras(signal),
      ]);
      const active = slots.filter((s) => s.is_live);
      const counts = await parallelMap(active, async (s) => ({
        id: s.session_id,
        attendance: await attendance(
          s.session_id,
          signal,
          localDate(s.time_zone),
        ),
      }));
      return cameras.map((c) => {
        const slot = active.find((s) => s.camera_id === c.camera_id),
          status = runtime.find((r) => r.camera_id === c.camera_id);
        const count = counts.find((v) => v.id === slot?.session_id)?.attendance
          .summary.inside_now;
        return {
          id: c.camera_id,
          name: c.camera_name,
          classroom:
            slots
              .filter((s) => s.camera_id === c.camera_id)
              .map((s) => s.classroom_code)
              .filter((v, i, a) => a.indexOf(v) === i)
              .join(", ") ||
            c.location_name ||
            "Assigned camera",
          connectionStatus:
            status?.running && (status.connected || status.camera_connected)
              ? "Online"
              : "Offline",
          currentSession: slot
            ? `${slot.course_code} · ${slot.course_name}`
            : undefined,
          attendanceSummary:
            count != null ? `${count} students inside` : undefined,
        };
      });
    },
    async attendance(id, filters, signal) {
      const result = await attendance(id, signal, filters.date);
      return page(
        result.records
          .filter((r) =>
            match(filters.search, r.name, r.roll_number, r.person_ref),
          )
          .map((r) => ({
            id: r.person_ref,
            studentId: r.person_id || r.person_ref,
            name: r.name || r.person_ref,
            rollNumber: r.roll_number || r.person_ref,
            state: r.state.toUpperCase(),
            lastEntry: r.last_in_at,
            lastExit: r.last_out_at,
            durationSeconds: r.total_inside_seconds,
            attendanceStatus: r.status.replaceAll("_", " "),
          })),
        filters,
        25,
        `Occurrence: ${result.occurrence_date}`,
      );
    },
    async activity(filters, signal) {
      if (!filters.sessionId) throw new ApiError("Select a session.");
      const [result, slot] = await Promise.all([
        request<C.SessionMovements>(
          `/faculty/sessions/${encode(filters.sessionId)}/attendance/events${query({ date: filters.date })}`,
          { signal },
        ),
        detail(filters.sessionId, signal),
      ]);
      return page(
        result.events
          .filter(
            (v) =>
              (!filters.event || v.direction.toUpperCase() === filters.event) &&
              match(filters.search, v.name, v.person_ref, v.roll_number),
          )
          .map((v) => movement(v, slot)),
        filters,
        25,
        `Occurrence: ${result.occurrence_date}. All IN/OUT events for this day are retained.`,
      );
    },
    async alerts(filters, signal) {
      const rows = await list<C.FacultyAlert>(
        `/faculty/alerts${query({ status: filters.status || "open", kind: filters.kind, session_id: filters.sessionId, before: filters.cursor, limit: 50 })}`,
        signal,
      );
      return {
        items: rows.map(mapAlert),
        nextCursor: rows.length === 50 ? rows.at(-1)!.created_at : null,
        notice:
          "Newest first. Page boundaries use the backend's before timestamp cursor.",
      };
    },
    async evidence(filters, signal) {
      const rows = await list<C.EvidenceBoxItem>(
        `/faculty/evidence${query({ include_closed: filters.includeClosed ? "true" : undefined })}`,
        signal,
      );
      return page(
        rows
          .filter(
            (r) => !filters.sessionId || r.session_id === filters.sessionId,
          )
          .map(mapEvidence),
        filters,
        12,
        "The server returns up to 500 recent evidence records. Snapshot expiry is managed by the server.",
      );
    },
    async evidenceDetail(id, signal) {
      const item = await request<C.EvidenceBoxDetail>(
        `/faculty/evidence/${encode(id)}`,
        { signal },
      );
      const [events, slot] = await Promise.all([
        request<C.SessionMovements>(
          `/faculty/sessions/${encode(item.session_id)}/attendance/events${query({ date: item.occurrence_date })}`,
          { signal },
        ),
        detail(item.session_id, signal),
      ]);
      return {
        ...mapEvidence(item),
        timeline: events.events
          .filter((e) =>
            item.person_id
              ? e.person_id === item.person_id
              : e.roll_number === item.roll_number,
          )
          .map((e) => movement(e, slot)),
      };
    },
    async snapshot(id, signal) {
      const item = await request<C.EvidenceBoxDetail>(
        `/faculty/evidence/${encode(id)}`,
        { signal },
      );
      if (!item.snapshot_url || !item.has_snapshot)
        throw new ApiError("This snapshot has been removed or expired.", 410);
      return safeSnapshotUrl(item.snapshot_url);
    },
    async resolveAlert(id, signal) {
      await request(`/faculty/alerts/${encode(id)}/resolve`, {
        method: "PATCH",
        signal,
      });
    },
    async resolveEvidence(id, signal) {
      await request(`/faculty/evidence/${encode(id)}/resolve`, {
        method: "PATCH",
        signal,
      });
    },
    async faculty(filters, signal) {
      const [faculty, slots, cameras] = await Promise.all([
        list<C.FacultyResponse>("/admin/faculty", signal),
        sessions(signal),
        list<C.CameraResponse>("/admin/cameras", signal),
      ]);
      const mapped = await parallelMap(
        faculty.filter((f) =>
          match(filters.search, f.full_name, f.username, f.faculty_code),
        ),
        async (f): Promise<V.FacultyView> => {
          const assigned = await api.access(String(f.user_id), signal),
            teaching = slots.filter((s) => s.faculty_user_id === f.user_id);
          const ids = new Set([
            ...assigned,
            ...teaching
              .filter((s) => s.is_active && s.camera_id)
              .map((s) => s.camera_id!),
          ]);
          return {
            id: String(f.user_id),
            username: f.username,
            name: f.full_name || f.username,
            email: f.email || "",
            emailVerified: f.email_verified === true,
            active: f.is_active,
            phone: f.phone || "",
            facultyCode: f.faculty_code,
            department: f.department || "",
            designation: f.designation || "",
            office: f.office || "",
            cameras: [...ids].map(
              (id) =>
                cameras.find((c) => c.camera_id === id)?.camera_name || id,
            ),
            classrooms: [...new Set(teaching.map((s) => s.classroom_code))],
            permissions: [],
          };
        },
      );
      return page(mapped, filters);
    },
    async classrooms(filters, signal) {
      return page(
        (await rooms(signal))
          .filter((r) => match(filters.search, r.code, r.name, r.building))
          .map((r) => ({
            id: r.classroom_id,
            name: r.name,
            code: r.code,
            location: r.building || "",
            active: r.is_active,
            cameraId: r.camera_id || "",
            capacity: r.capacity,
            cameras: r.camera_id ? [r.camera_name || r.camera_id] : [],
            zoneStatus: r.attendance_zone_id
              ? "Zone configured"
              : "Zone not configured",
          })),
        filters,
      );
    },
    async courses(filters, signal) {
      return page(
        (await list<C.CourseResponse>("/admin/courses", signal))
          .filter((v) => match(filters.search, v.name, v.code))
          .map((v) => ({
            id: v.course_id,
            name: v.name,
            code: v.code,
            active: v.is_active,
            department: v.department || "",
          })),
        filters,
      );
    },
    async formOptions(signal) {
      const [faculty, classrooms, courses, cameras] = await Promise.all([
        list<C.FacultyResponse>("/admin/faculty", signal),
        rooms(signal),
        list<C.CourseResponse>("/admin/courses", signal),
        list<C.CameraResponse>("/admin/cameras", signal),
      ]);
      return {
        faculty: faculty
          .filter((f) => f.is_active)
          .map((f) => ({
            id: String(f.user_id),
            label: `${f.faculty_code} · ${f.full_name}`,
          })),
        classrooms: classrooms.map((r) => ({
          id: r.classroom_id,
          label: `${r.code} · ${r.name}`,
        })),
        courses: courses.map((c) => ({
          id: c.course_id,
          label: `${c.code} · ${c.name}`,
        })),
        cameras: cameras.map((c) => ({
          id: c.camera_id,
          label: c.camera_name,
        })),
        classroomCameras: Object.fromEntries(
          classrooms
            .filter((r) => r.camera_id)
            .map((r) => [
              r.classroom_id,
              { id: r.camera_id!, label: r.camera_name || r.camera_id! },
            ]),
        ),
      };
    },
    async saveFaculty(id, draft, signal) {
      const profile = {
        faculty_code: draft.facultyCode,
        department: draft.department || null,
        designation: draft.designation || null,
        office: draft.office || null,
      };
      if (!id) {
        const created = await request<C.FacultyResponse>("/admin/faculty", {
          method: "POST",
          signal,
          body: {
            ...profile,
            username: draft.username,
            password: draft.password,
            full_name: draft.name,
            email: draft.email,
            phone: draft.phone.replace(/[\s-]/g, ""),
            age: draft.age,
          },
        });
        if (!draft.active) {
          try {
            await request(`/admin/users/${created.user_id}`, {
              method: "PUT",
              signal,
              body: { is_active: false },
            });
          } catch (e) {
            throw new ApiError(
              `Faculty account was created, but deactivation could not be confirmed: ${messageOf(e)}. Refresh the directory and edit that account before trying to create it again.`,
            );
          }
        }
      } else {
        await request(`/admin/faculty/${encode(id)}`, {
          method: "PUT",
          signal,
          body: profile,
        });
        try {
          await request(`/admin/users/${encode(id)}`, {
            method: "PUT",
            signal,
            body: {
              full_name: draft.name,
              email: draft.email,
              phone: draft.phone.replace(/[\s-]/g, ""),
              is_active: draft.active,
            },
          });
          if (draft.password)
            await request(`/admin/users/${encode(id)}/password`, {
              method: "POST",
              signal,
              body: { password: draft.password },
            });
        } catch (e) {
          throw new ApiError(
            `Faculty profile was saved. Account/password changes may be incomplete: ${messageOf(e)}`,
          );
        }
      }
    },
    async saveClassroom(id, v, signal) {
      await request(`/admin/classrooms${id ? `/${encode(id)}` : ""}`, {
        method: id ? "PUT" : "POST",
        signal,
        body: {
          code: v.code,
          name: v.name,
          building: v.location || null,
          capacity: v.capacity,
          camera_id: v.cameraId || null,
          is_active: v.active,
        },
      });
    },
    async saveCourse(id, v, signal) {
      await request(`/admin/courses${id ? `/${encode(id)}` : ""}`, {
        method: id ? "PUT" : "POST",
        signal,
        body: {
          code: v.code,
          name: v.name,
          department: v.department || null,
          is_active: v.active,
        },
      });
    },
    async saveSession(id, v, signal) {
      await request(`/admin/sessions${id ? `/${encode(id)}` : ""}`, {
        method: id ? "PUT" : "POST",
        signal,
        body: sessionPayload(v),
      });
    },
    async studentAssignment(id, filters, signal) {
      const [slot, candidates] = await Promise.all([
        request<C.SessionDetail>(`/admin/sessions/${encode(id)}`, { signal }),
        list<C.SubjectSummary>(
          `/subjects${query({ auth_status: "enrolled", search: filters.search, limit: 500 })}`,
          signal,
        ),
      ]);
      const selection = slot.students.map((s) => {
        const reference = s.reference || s.roll_num;
        if (!reference)
          throw new ApiError(
            "A current student has no enrollment reference. Ask the administrator to repair that record before replacing assignments.",
          );
        return {
          id: reference,
          label: `${s.name || reference} · ${s.roll_num || reference}`,
        };
      });
      return {
        selected: selection,
        available: {
          items: candidates
            .filter((c) => c.external_reference || c.roll_num)
            .map((c) => ({
              id: (c.external_reference || c.roll_num)!,
              label: `${c.display_name || c.full_name || c.external_reference} · ${c.roll_num || c.external_reference}`,
            })),
          notice:
            "Search returns up to 500 enrolled subjects. Narrow the search to find more.",
        },
      };
    },
    async saveStudentAssignment(id, references, signal) {
      if (references.length > 500)
        throw new ApiError(
          "The server supports at most 500 students in one session.",
        );
      const result = await request<C.SessionStudentsResult>(
        `/admin/sessions/${encode(id)}/students`,
        { method: "PUT", body: { references }, signal },
      );
      return {
        warning: result.not_found.length
          ? `Assignments saved, but these references were not found or eligible: ${result.not_found.join(", ")}. Review the updated selection.`
          : undefined,
      };
    },
    async cameraAssignment(target, id, filters, signal) {
      const cameras = await list<C.CameraResponse>("/admin/cameras", signal);
      let selected: string[], notice: string | undefined;
      if (target === "faculty") {
        selected = await api.access(id, signal);
        notice =
          "Explicit camera grants. Teaching cameras may also appear automatically; explicitly grant them here if streaming returns 403.";
      } else if (target === "classroom") {
        const room = (await rooms(signal)).find((r) => r.classroom_id === id);
        if (!room) throw new ApiError("Classroom not found.");
        selected = room.camera_id ? [room.camera_id] : [];
        notice =
          "A classroom has one camera. Changing it clears that classroom's saved attendance zone.";
      } else {
        const slot = await detail(id, signal);
        selected = slot.camera_id ? [slot.camera_id] : [];
        notice =
          "Session camera is inherited from its classroom. Change the classroom camera or the session's classroom to update it.";
      }
      const option = (id: string) => ({
        id,
        label: cameras.find((c) => c.camera_id === id)?.camera_name || id,
      });
      return {
        selected: selected.map(option),
        available: page(
          cameras
            .filter((c) => match(filters.search, c.camera_name))
            .map((c) => option(c.camera_id)),
          filters,
        ),
        multiple: target === "faculty",
        readOnly: target === "session",
        notice,
      };
    },
    async saveCameraAssignment(target, id, ids, signal) {
      if (target === "session")
        throw new ApiError("Session camera is inherited from its classroom.");
      if (target === "faculty") {
        if (ids.length > 200)
          throw new ApiError(
            "At most 200 explicit camera grants are supported.",
          );
        await request(`/admin/members/${encode(id)}/cameras`, {
          method: "PUT",
          signal,
          body: { camera_ids: ids },
        });
      } else {
        if (ids.length > 1)
          throw new ApiError("A classroom supports one camera.");
        await request(`/admin/classrooms/${encode(id)}`, {
          method: "PUT",
          signal,
          body: { camera_id: ids[0] || null },
        });
      }
    },
    async zones(filters, signal) {
      return page(
        (await rooms(signal)).map((r) => ({
          id: r.classroom_id,
          classroomId: r.classroom_id,
          name: `Attendance ${r.code}`,
          cameraId: r.camera_id || "",
          camera: r.camera_name || "No camera assigned",
          configured: !!r.attendance_zone_id,
          points: (r.attendance_zone_points || []).map(([x, y]) => ({ x, y })),
        })),
        filters,
      );
    },
    zoneFrame: cameraFrame,
    async saveZone(_id, v, signal) {
      await request(
        `/admin/classrooms/${encode(v.classroomId)}/attendance-zone`,
        {
          method: "PUT",
          signal,
          body: { points: v.points.map((p) => [p.x, p.y]) },
        },
      );
    },
    socketUrl,
    event: parseClassroomEvent,
    filters: {
      sessions: ["search"],
      attendance: ["date", "search"],
      activity: ["date", "search", "event"],
      alerts: ["status", "kind"],
      evidence: ["includeClosed"],
      faculty: ["search"],
      classrooms: ["search"],
      courses: ["search"],
      assignments: ["search"],
    },
  };
}

/** A single authenticated frame from the existing MJPEG stream and parser. */
export async function cameraFrame(
  cameraId: string,
  signal: AbortSignal,
): Promise<Blob> {
  const captured = getSession();
  if (!captured) throw new ApiError("Sign in to view this camera.", 401);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  const timer = setTimeout(abort, 15000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetch(
      apiUrl(`/ai/camera/${encode(cameraId)}/stream`),
      {
        headers: { Authorization: `Bearer ${captured.token}` },
        credentials: "omit",
        signal: controller.signal,
      },
    );
    if (response.status === 401 && getSession()?.token === captured.token)
      window.dispatchEvent(new CustomEvent("sentinel:expired"));
    if (!response.ok || !response.body)
      throw new ApiError(
        `Camera frame unavailable (${response.status}).`,
        response.status,
      );
    reader = response.body.getReader();
    const parser = new JpegParser();
    while (true) {
      const { value, done } = await reader.read();
      if (done) throw new ApiError("No camera frame received.");
      const frames = parser.push(value);
      if (frames.length)
        return new Blob([new Uint8Array(frames[0])], { type: "image/jpeg" });
    }
  } catch (e) {
    if (signal.aborted) throw e;
    if (controller.signal.aborted)
      throw new ApiError("No camera frame received within 15 seconds.");
    throw e;
  } finally {
    clearTimeout(timer);
    controller.abort();
    signal.removeEventListener("abort", abort);
    void reader?.cancel().catch(() => {});
  }
}
