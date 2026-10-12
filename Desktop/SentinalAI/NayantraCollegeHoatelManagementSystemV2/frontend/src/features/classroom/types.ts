/** Presentation models only. These are NOT claims about the backend JSON schema.
 * A verified backend adapter maps server responses and permissions to these views.
 */
export type Capability =
  | "overview"
  | "sessions"
  | "cameras"
  | "attendance"
  | "activity"
  | "alerts"
  | "evidence"
  | "resolveAlerts"
  | "resolveEvidence"
  | "manageFaculty"
  | "manageClassrooms"
  | "manageCourses"
  | "manageSessions"
  | "assignStudents"
  | "assignCameras"
  | "manageZones";
export interface AccessView {
  capabilities: Capability[];
  permissions: string[];
}
export interface Option {
  id: string;
  label: string;
}
export interface Page<T> {
  items: T[];
  nextCursor?: string | null;
  total?: number;
  notice?: string;
}
export interface Filters {
  cursor?: string;
  search?: string;
  sessionId?: string;
  studentId?: string;
  date?: string;
  event?: "IN" | "OUT";
  status?: string;
  kind?: string;
  includeClosed?: boolean;
}
export interface SessionView {
  id: string;
  course: string;
  classroom: string;
  cameraId: string;
  cameraName: string;
  faculty: string;
  weekday: number;
  startTime: string;
  endTime: string;
  termStart: string;
  termEnd: string;
  timeZone: string;
  minimumMinutes: number;
  active: boolean;
  nextOccurrence: string | null;
  status: string;
  studentCount: number;
  facultyId: string;
  classroomId: string;
  courseId: string;
}
export interface OverviewView {
  activeSessions: number;
  studentsInside: number;
  studentsOutside: number;
  earlyExitAlerts: number;
  unauthorizedEntryAlerts: number;
  pendingEvidence: number;
  assignedCameras: number;
  todaySessions: number;
  sessions: SessionView[];
  note?: string;
}
export interface CameraView {
  id: string;
  name: string;
  classroom: string;
  connectionStatus: string;
  currentSession?: string;
  attendanceSummary?: string;
}
export interface AttendanceView {
  id: string;
  studentId: string;
  name: string;
  rollNumber: string;
  state: string;
  lastEntry?: string | null;
  lastExit?: string | null;
  durationSeconds?: number | null;
  attendanceStatus: string;
}
export interface ActivityView {
  id: string;
  studentId?: string;
  timestamp: string;
  name: string;
  rollNumber: string;
  event: string;
  classroom: string;
  camera: string;
  session: string;
  durationSeconds?: number | null;
  status: string;
}
export interface AlertView {
  id: string;
  type: string;
  severity: string;
  status: string;
  createdAt: string;
  message: string;
  name: string;
  rollNumber: string;
  classroom: string;
  session: string;
  camera: string;
  evidenceId?: string;
  canResolve: boolean;
}
export interface EvidenceView {
  id: string;
  name: string;
  rollNumber: string;
  classroom: string;
  session: string;
  camera: string;
  exitTime?: string | null;
  durationSeconds?: number | null;
  alertType: string;
  alertStatus: string;
  createdAt: string;
  expiresAt?: string | null;
  snapshotAvailable: boolean;
  canResolve: boolean;
  timeline?: ActivityView[];
}
export interface FacultyView {
  emailVerified?: boolean;
  id: string;
  username: string;
  name: string;
  email: string;
  active: boolean;
  cameras: string[];
  classrooms: string[];
  permissions: string[];
  phone: string;
  facultyCode: string;
  department: string;
  designation: string;
  office: string;
}
export interface ClassroomView {
  id: string;
  name: string;
  code: string;
  location: string;
  active: boolean;
  cameras: string[];
  zoneStatus: string;
  cameraId: string;
  capacity: number | null;
}
export interface CourseView {
  id: string;
  name: string;
  code: string;
  active: boolean;
  department: string;
}
export interface StudentView extends Option {
  rollNumber: string;
}
export interface FormOptions {
  faculty: Option[];
  classrooms: Option[];
  courses: Option[];
  cameras: Option[];
  classroomCameras: Record<string, { id: string; label: string }>;
}
export interface FacultyDraft {
  username: string;
  name: string;
  email: string;
  password?: string;
  active: boolean;
  phone: string;
  age?: number;
  facultyCode: string;
  department: string;
  designation: string;
  office: string;
}
export interface ClassroomDraft {
  name: string;
  code: string;
  location: string;
  active: boolean;
  cameraId: string;
  capacity: number | null;
}
export interface CourseDraft {
  name: string;
  code: string;
  active: boolean;
  department: string;
}
export interface SessionDraft {
  facultyId: string;
  classroomId: string;
  courseId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  termStart: string;
  termEnd: string;
  timeZone: string;
  minimumMinutes: number;
  active: boolean;
}
export type AssignmentTarget = "faculty" | "classroom" | "session";
export interface AssignmentView {
  selected: Option[];
  available: Page<Option>;
  multiple?: boolean;
  readOnly?: boolean;
  notice?: string;
}
export interface Point {
  x: number;
  y: number;
}
export interface ZoneView {
  id: string;
  name: string;
  cameraId: string;
  camera: string;
  classroomId: string;
  configured: boolean;
  points: Point[];
}
export interface ZoneDraft {
  name: string;
  cameraId: string;
  classroomId: string;
  points: Point[];
}
export interface ClassroomEvent {
  /** Stable event ID from the backend. The adapter must reject malformed events. */
  id: string;
  kind:
    | "in"
    | "out"
    | "early_exit"
    | "unauthorized_entry"
    | "evidence_created"
    | "alert_created"
    | "alert_updated"
    | "alert_resolved";
  revision?: string;
  alertId?: string;
  alertType?: string;
  evidenceId?: string;
  sessionId?: string;
  message: string;
  soundRequired: boolean;
}
