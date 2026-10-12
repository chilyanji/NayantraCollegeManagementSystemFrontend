/** Wire contracts inspected in backend/schemas/{academic,faculty,camera,subject,user}.py. */
export interface FacultyResponse {
  email_verified?: boolean;
  user_id: number;
  username: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  last_login: string | null;
  faculty_code: string;
  department: string | null;
  designation: string | null;
  office: string | null;
}
export interface CourseResponse {
  course_id: string;
  code: string;
  name: string;
  department: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
export interface ClassroomResponse {
  classroom_id: string;
  code: string;
  name: string;
  building: string | null;
  capacity: number | null;
  camera_id: string | null;
  camera_name: string | null;
  attendance_zone_id: string | null;
  attendance_zone_points: number[][] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
export interface SessionResponse {
  session_id: string;
  course_id: string;
  course_code: string;
  course_name: string;
  classroom_id: string;
  classroom_code: string;
  classroom_name: string;
  camera_id: string | null;
  faculty_user_id: number;
  faculty_name: string | null;
  faculty_code: string | null;
  weekday: number;
  start_time: string;
  end_time: string;
  term_start: string;
  term_end: string;
  time_zone: string;
  min_presence_minutes: number;
  is_active: boolean;
  student_count: number;
  is_live: boolean;
  next_occurrence: string | null;
  created_at: string;
  updated_at: string;
}
export interface SessionStudent {
  person_id: string;
  reference: string | null;
  roll_num: string | null;
  name: string | null;
  branch: string | null;
  auth_status: string;
  added_at: string;
}
export interface SessionDetail extends SessionResponse {
  students: SessionStudent[];
}
export interface SessionStudentsResult {
  session_id: string;
  assigned: number;
  not_found: string[];
  students: SessionStudent[];
}
export interface SessionAttendance {
  session_id: string;
  course_code: string;
  course_name: string;
  classroom_code: string;
  occurrence_date: string;
  summary: {
    on_list: number;
    present: number;
    absent: number;
    inside_now: number;
    early_exits: number;
    not_on_list: number;
  };
  records: {
    person_id: string | null;
    person_ref: string;
    name: string | null;
    roll_number: string | null;
    branch: string | null;
    state: "inside" | "outside";
    status: string;
    first_in_at: string | null;
    last_in_at: string | null;
    last_out_at: string | null;
    entries: number;
    total_inside_seconds: number;
    on_list: boolean;
  }[];
  occurrences: {
    occurrence_date: string;
    people: number;
    early_exits: number;
  }[];
}
export interface Movement {
  attendance_event_id: number;
  direction: "in" | "out";
  occurred_at: string;
  duration_seconds: number | null;
  in_event_id: number | null;
  auth_result: string;
  person_id: string | null;
  person_ref: string;
  name: string | null;
  roll_number: string | null;
}
export interface SessionMovements {
  session_id: string;
  occurrence_date: string;
  events: Movement[];
}
export interface FacultyAlert {
  alert_id: string;
  alert_type: "early_exit" | "unauthorized_entry" | "unidentified_person";
  severity: string;
  status: string;
  title: string;
  description: string | null;
  sound_required: boolean;
  created_at: string;
  session_id: string;
  occurrence_date: string;
  course_code: string;
  classroom_id: string;
  classroom_code: string;
  camera_id: string | null;
  camera_name: string | null;
  faculty_user_id: number;
  person_id: string | null;
  person_ref: string;
  person_name: string | null;
  roll_number: string | null;
  evidence_id: string | null;
}
export interface EvidenceBoxItem {
  evidence_id: string;
  alert_id: string;
  alert_status: string;
  person_id: string | null;
  student_name: string | null;
  roll_number: string | null;
  classroom_code: string;
  course_code: string;
  course_name: string;
  session_id: string;
  occurrence_date: string;
  exit_time: string | null;
  duration_seconds: number | null;
  camera_id: string | null;
  camera_name: string | null;
  faculty_user_id: number;
  created_at: string;
  expires_at: string | null;
  purged_at: string | null;
  has_snapshot: boolean;
}
export interface EvidenceBoxDetail extends EvidenceBoxItem {
  snapshot_url: string | null;
  snapshot_url_expires_in: number | null;
}
export interface CameraResponse {
  camera_id: string;
  camera_name: string;
  is_active: boolean;
  location_name?: string | null;
}
export interface SubjectSummary {
  person_id: string;
  external_reference: string | null;
  roll_num: string | null;
  display_name: string | null;
  full_name: string | null;
  branch: string | null;
  auth_status: string;
}
export interface SessionPayload {
  course_id: string;
  classroom_id: string;
  faculty_user_id: number;
  weekday: number;
  start_time: string;
  end_time: string;
  term_start: string;
  term_end: string;
  time_zone: string;
  min_presence_minutes: number;
  is_active: boolean;
}
