# Faculty and classroom integration

This update extends `NayantraFrontend.zip` against the separately supplied `backend.zip`. Backend source was inspected, not changed. The shared React/TypeScript/Vite application, plain CSS visual system, Lucide icons, authentication wrapper, resource hooks and MJPEG player are reused. No new package dependency is introduced.

## Source of truth

The implementation was matched to these backend files:

- `routers/faculty.py`, `routers/academic_admin.py`, `routers/admin.py`, `routers/users.py`, `routers/live.py` and camera routes in `main.py`.
- `schemas/academic.py`, `schemas/faculty.py`, `schemas/user.py`, `schemas/camera.py`, `schemas/subject.py` and `schemas/zone.py`.
- `services/academic_service.py`, `services/faculty_service.py`, `services/camera_access_service.py`, `services/zone_service.py`.
- `repositories/academic_repo.py`, `repositories/attendance_repo.py`, `repositories/camera_repo.py` and the attendance broadcaster/monitor.

The running backend must match those contracts. Test fixtures establish frontend behavior against the inspected contracts; they do not establish live server correctness.

## Pages and access

| Route                           | Purpose                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------- |
| `/faculty`                      | Overview and current/upcoming sessions today                                  |
| `/faculty/sessions`             | Assigned weekly timetable slots                                               |
| `/faculty/sessions/:sessionId`  | Session details, camera and related attendance/activity/alert/evidence panels |
| `/faculty/cameras`              | Scoped cameras using the existing MJPEG player                                |
| `/faculty/attendance`           | Session/date attendance records and backend statuses                          |
| `/faculty/activity`             | Session/date IN/OUT history, student search and movement filters              |
| `/faculty/alerts`               | Type/status filters, evidence links and confirmed resolve action              |
| `/faculty/evidence`             | Active evidence or server-provided closed history                             |
| `/faculty/evidence/:evidenceId` | Snapshot, metadata, movements and confirmed resolve action                    |
| `/classroom-admin/:section`     | Faculty, classrooms, courses, sessions, students, cameras and zones           |

The existing login adds a Faculty portal and redirects the authenticated faculty role to `/faculty`. Route guards cover direct URLs, not only navigation links. Administrator access follows the inspected backend's `require_admin`/`require_faculty` gates. A faculty session skips the legacy global AI/detection polling. Existing administrator/member pages remain available to their original roles.

The adapter revalidates `/users/{username}` and, for faculty, `/faculty/me`. The supplied server exposes `role` and `is_active`, not a granular permission list. UI capabilities mirror those actual role gates; they are not persisted permission grants and cannot authorize a request. Every resource/action remains subject to backend authorization. The supplied project implements admin, member and faculty; operator, supervisor and auditor contracts were not present.

## Faculty HTTP contracts

Paths below are backend-relative. The existing API wrapper adds the configured base and bearer token. IDs are encoded, query values use URLSearchParams, obsolete reads are aborted, and validation/server errors are shown.

| Operation                | Actual request                                                               | Important response/use                            |
| ------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------- |
| Login                    | POST `/login` with `{username,password}`                                     | `{access_token,user}`; existing session mechanism |
| Validate own account     | GET `/users/{username}`                                                      | Active state and backend role                     |
| Validate faculty profile | GET `/faculty/me`                                                            | `FacultyResponse`                                 |
| Assigned cameras         | GET `/faculty/cameras`                                                       | `CameraResponse[]`, server scoped                 |
| Session list/detail      | GET `/faculty/sessions`, `/faculty/sessions/{id}`                            | `SessionResponse[]` / `SessionDetail`             |
| Attendance               | GET `/faculty/sessions/{id}/attendance?date=YYYY-MM-DD`                      | Summary, records and occurrence dates             |
| Movements                | GET `/faculty/sessions/{id}/attendance/events?date=YYYY-MM-DD`               | Every returned IN/OUT event for that occurrence   |
| Alerts                   | GET `/faculty/alerts?status=...&kind=...&session_id=...&before=...&limit=50` | Newest first; backend timestamp cursor            |
| Resolve alert            | PATCH `/faculty/alerts/{id}/resolve`                                         | No invented request body; updated server record   |
| Evidence box             | GET `/faculty/evidence?include_closed=true` when requested                   | `EvidenceBoxItem[]`; active-only by default       |
| Evidence detail          | GET `/faculty/evidence/{id}`                                                 | Detail and optional short-lived `snapshot_url`    |
| Resolve evidence         | PATCH `/faculty/evidence/{id}/resolve`                                       | No invented request body; refreshed state         |
| Camera status/stream     | Existing `/ai/camera/status` and `/ai/camera/{camera_id}/stream`             | Existing authenticated status/stream client       |

Attendance statuses, current state, last IN/OUT, total duration, alert severity, evidence expiry and authorization classification are displayed from backend data. There is no browser attendance qualification, early-exit calculation, expiry timer that deletes evidence, or inferred unauthorized classification. Multiple IN/OUT records for the same student are preserved.

The backend also exposes `/faculty/classes`, `/faculty/students/{student_id}/attendance` and alert acknowledge/detail routes. This update uses the session/classroom data already returned by session APIs and a session-scoped activity table; it does not claim an additional cross-session student-history or acknowledgement screen.

## Administrator HTTP contracts

| Operation                            | Actual request and payload                                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Faculty list/create/profile update   | GET/POST `/admin/faculty`; PUT `/admin/faculty/{user_id}`                                                         |
| Faculty account details/active state | PUT `/admin/users/{user_id}` with supported account fields                                                        |
| Optional faculty password reset      | POST `/admin/users/{user_id}/password` with `{password}`                                                          |
| Courses                              | GET/POST `/admin/courses`; PUT `/admin/courses/{id}` with `code,name,department,is_active`                        |
| Classrooms                           | GET/POST `/admin/classrooms`; PUT `/admin/classrooms/{id}` with `code,name,building,capacity,camera_id,is_active` |
| Sessions                             | GET/POST `/admin/sessions`; GET/PUT `/admin/sessions/{id}`                                                        |
| Candidate students                   | GET `/subjects?auth_status=enrolled&search=...&limit=500`                                                         |
| Replace session students             | PUT `/admin/sessions/{id}/students` with `{references:[...]}`                                                     |
| Camera registry                      | GET `/admin/cameras`                                                                                              |
| Faculty explicit camera grants       | GET/PUT `/admin/members/{user_id}/cameras`; replacement body `{camera_ids:[...]}`                                 |
| Classroom camera                     | PUT `/admin/classrooms/{id}` with `{camera_id}`; one camera per classroom                                         |
| Attendance zone                      | PUT `/admin/classrooms/{id}/attendance-zone` with `{points:[[x,y],...]}`                                          |

Faculty creation uses the actual required fields: username, password, full_name, email, phone, age and faculty_code, plus optional department, designation and office. Existing faculty profile fields and account fields are saved through their separate endpoints. Profile/account/password edits are sequential, not transactional; a later failure explicitly reports possible partial completion. Credentials are kept only in transient form state until submission.

Student assignment uses enrollment references or roll numbers, not internal person IDs. Saving replaces the roster. The backend can accept valid references while returning `not_found`; the UI reports that warning and reloads the authoritative selection. Candidates are searchable, capped at 500 by the server. Unsupported batch/section mappings are not fabricated.

### Weekly session shape

The supplied implementation stores a recurring timetable slot, rather than a single start/end datetime:

```json
{
  "course_id": "<existing course ID>",
  "classroom_id": "<existing classroom ID>",
  "faculty_user_id": 7,
  "weekday": 1,
  "start_time": "10:00",
  "end_time": "11:00",
  "term_start": "2026-10-01",
  "term_end": "2026-12-31",
  "time_zone": "Asia/Kolkata",
  "min_presence_minutes": 30,
  "is_active": true
}
```

These values are illustrative, not runtime seed data. Weekday is 1–7. The camera is inherited from the classroom; no separate `camera_id` is submitted for a session. Status uses the backend's `is_live`, `is_active` and `next_occurrence`. Attendance and movements belong to a selected occurrence date. Today's overview is explicitly current/upcoming today, not a claim to include completed occurrences.

### Attendance polygon

The editor loads one frame through the existing authenticated MJPEG endpoint, then stops that reader. Admins can mark, remove and adjust 3–50 normalized points; validation rejects invalid coordinates, zero-area, duplicate and self-intersecting polygons. The payload is only the backend-supported point array. Saving creates/updates and activates the classroom attendance zone. Changing a classroom camera clears its zone according to the backend and is explained in the UI.

## Events, notifications and evidence

The existing `/ws/live?token=...` connection is reused. The inspected broadcaster envelope is `{type, data:{event,...}}`. The backend filters by camera access and faculty user ID; the frontend does not subscribe to invented channels.

- `attendance.in` and `attendance.out` invalidate attendance/activity data.
- `attendance.early_exit` produces a silent popup, even if an inconsistent message requests sound.
- `attendance.unauthorized_entry` and alert notifications play sound only when the explicit backend boolean `sound_required` is `true` and the user has enabled browser audio.
- The attendance alert and its paired `alert.created` are deduplicated by stable alert identity. Escalation of an unidentified-person alert can produce one new notification/sound for that escalation.
- `evidence.created` refreshes the box and can attach its evidence link to an existing popup.
- `alert.acknowledged`, `alert.updated` and `alert.resolved` refresh relevant views. Resolution does not erase attendance history locally.

Notifications react to the socket immediately; resource refreshes are coalesced for 800 ms. Reconnection and visibility restoration refresh data, and a manual refresh is available. No new continuous classroom polling loop is added. A disconnected socket therefore means classroom views may be stale until reconnect/manual refresh. Existing monitoring polling remains unchanged. End-to-end latency depends on the running backend/network; no two-second production guarantee is asserted.

Snapshots come from authenticated evidence-detail metadata and the server's signed HTTP(S) image URL. The bearer token is never forwarded to the object-storage URL. Script/file/credential-bearing URLs are rejected; image failures are explicit and can be retried by refreshing detail. Blob previews are released on cleanup. Browser caching/remote deletion remain subject to the server and storage policy.

Both resolve actions require confirmation, await success and refresh related resources. The supplied backend resolves the alert and purges its snapshot while retaining attendance/movement rows. An API error keeps the evidence view and displays the error; because server operations can partially commit, refresh shows the authoritative result after a failure.

## Backend limits and handoff

| Observed limit                                                                                                             | Frontend behavior / required backend follow-up                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `camera_access_service.cameras_for` includes teaching-camera inheritance, while `assert_can_view` requires explicit access | Faculty may see a camera but get 403 for its stream. Admin can explicitly grant it in Camera assignment. Backend owners should align the two checks.                                                                                                                                                                                                  |
| `schemas/zone.py` defines Rule as intrusion/dwell/crossing, excluding attendance                                           | Generic zone responses can fail validation for attendance zones, including after a mutation has committed. Only the classroom-specific zone save/edit route is used. Separate disable/enable cannot be safely exposed until the backend fixes the enum and exposes attendance-zone active state. Do not blindly retry a failed generic zone mutation. |
| No granular permission list                                                                                                | Show the verified role/resource model and explain that individual permission details are unavailable. Server authorization remains mandatory.                                                                                                                                                                                                         |
| Alert pagination uses timestamp-only `before` with strict `<`                                                              | Pages follow the actual API, but equal timestamps at the boundary can omit records. Complete historical pagination requires a backend timestamp+ID cursor.                                                                                                                                                                                            |
| Evidence returns at most 500 items                                                                                         | UI labels the limit; closed history is also capped. No claim of full archival evidence retrieval.                                                                                                                                                                                                                                                     |
| Enrolled candidate search returns at most 500; session assignment max 500; camera grants max 200                           | Search narrowing and limits are visible/enforced. No unsupported pagination or batch assignment endpoint is called.                                                                                                                                                                                                                                   |
| Attendance/movement routes return complete selected-day lists                                                              | Local paging/search applies after the full selected response; repeated events remain intact.                                                                                                                                                                                                                                                          |
| Overview open-alert query max 200; evidence max 500                                                                        | Counts and their scope are labelled. Occupancy is aggregated from active-session backend records, not globally inferred.                                                                                                                                                                                                                              |

## Live acceptance checklist

With the matching backend and its schema already deployed:

1. Check administrator/member regression workflows against your existing data.
2. Create a faculty account, course, classroom, weekly session and roster. Verify failed and successful validation responses.
3. Verify a faculty account cannot read another faculty member's sessions/evidence through direct requests, and a member cannot access classroom routes.
4. Grant an actual camera, confirm authenticated stream/status, draw its zone and verify the persisted points after reload.
5. During a real scheduled occurrence, verify repeated IN/OUT changes, backend duration/status and daily history.
6. Verify early-exit silence, unauthorized audio after browser audio enablement, paired-event deduplication and socket reconnect refresh.
7. Open a signed snapshot, resolve evidence and confirm server snapshot policy while attendance history remains available.
8. Test actual reverse proxy, HTTPS/WSS, signed-image reachability, Redis delivery and camera outages. These services were not run during frontend validation.

No backend, database, model, Redis or object-storage changes are included in the delivered ZIP.
