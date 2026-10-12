import type * as V from "./types";
import { createBackendAdapter } from "./api";

/**
 * UI boundary implemented against the supplied backend.zip (4 October 2026).
 * Wire types and route mapping live in contracts.ts and api.ts.
 * See docs/CLASSROOM_INTEGRATION.md for the verification and mapping checklist.
 */
export interface ClassroomAdapter {
  access(signal: AbortSignal): Promise<V.AccessView>;
  overview(signal: AbortSignal): Promise<V.OverviewView>;
  sessions(
    filters: V.Filters,
    signal: AbortSignal,
  ): Promise<V.Page<V.SessionView>>;
  session(id: string, signal: AbortSignal): Promise<V.SessionView>;
  cameras(signal: AbortSignal): Promise<V.CameraView[]>;
  attendance(
    sessionId: string,
    filters: V.Filters,
    signal: AbortSignal,
  ): Promise<V.Page<V.AttendanceView>>;
  activity(
    filters: V.Filters,
    signal: AbortSignal,
  ): Promise<V.Page<V.ActivityView>>;
  alerts(filters: V.Filters, signal: AbortSignal): Promise<V.Page<V.AlertView>>;
  evidence(
    filters: V.Filters,
    signal: AbortSignal,
  ): Promise<V.Page<V.EvidenceView>>;
  evidenceDetail(id: string, signal: AbortSignal): Promise<V.EvidenceView>;
  /** Fetch authenticated bytes. Do not return filesystem paths or token URLs. */
  snapshot(id: string, signal: AbortSignal): Promise<Blob | string>;
  resolveAlert?(id: string, signal: AbortSignal): Promise<void>;
  resolveEvidence?(id: string, signal: AbortSignal): Promise<void>;
  faculty(
    filters: V.Filters,
    signal: AbortSignal,
  ): Promise<V.Page<V.FacultyView>>;
  classrooms(
    filters: V.Filters,
    signal: AbortSignal,
  ): Promise<V.Page<V.ClassroomView>>;
  courses(
    filters: V.Filters,
    signal: AbortSignal,
  ): Promise<V.Page<V.CourseView>>;
  formOptions(signal: AbortSignal): Promise<V.FormOptions>;
  saveFaculty?(
    id: string | null,
    draft: V.FacultyDraft,
    signal: AbortSignal,
  ): Promise<void>;
  saveClassroom?(
    id: string | null,
    draft: V.ClassroomDraft,
    signal: AbortSignal,
  ): Promise<void>;
  saveCourse?(
    id: string | null,
    draft: V.CourseDraft,
    signal: AbortSignal,
  ): Promise<void>;
  saveSession?(
    id: string | null,
    draft: V.SessionDraft,
    signal: AbortSignal,
  ): Promise<void>;
  /** A complete existing selection plus a paginated/searchable candidate page. */
  studentAssignment(
    sessionId: string,
    filters: V.Filters,
    signal: AbortSignal,
  ): Promise<V.AssignmentView>;
  saveStudentAssignment?(
    sessionId: string,
    ids: string[],
    signal: AbortSignal,
  ): Promise<{ warning?: string }>;
  cameraAssignment(
    target: V.AssignmentTarget,
    id: string,
    filters: V.Filters,
    signal: AbortSignal,
  ): Promise<V.AssignmentView>;
  saveCameraAssignment?(
    target: V.AssignmentTarget,
    id: string,
    ids: string[],
    signal: AbortSignal,
  ): Promise<void>;
  zones(filters: V.Filters, signal: AbortSignal): Promise<V.Page<V.ZoneView>>;
  zoneFrame(cameraId: string, signal: AbortSignal): Promise<Blob>;
  saveZone?(
    id: string | null,
    draft: V.ZoneDraft,
    signal: AbortSignal,
  ): Promise<void>;
  /** Reuse the existing single socket; return a verified, authenticated URL. */
  socketUrl(token: string): string;
  /** Parse the actual event contract; return null for unrecognized/invalid input. */
  event(raw: unknown): V.ClassroomEvent | null;
  /** Only expose filters whose semantics/pagination the adapter has verified. */
  filters: Partial<
    Record<
      | "sessions"
      | "attendance"
      | "activity"
      | "alerts"
      | "evidence"
      | "faculty"
      | "classrooms"
      | "courses"
      | "assignments",
      (keyof V.Filters)[]
    >
  >;
}

export const classroomAdapter: ClassroomAdapter = createBackendAdapter();
