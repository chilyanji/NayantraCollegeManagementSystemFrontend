# Retained monitoring API contract

This document records the original monitoring integration from `FrontendCopy.zip`, retained in the supplied `NayantraFrontend.zip`. The new faculty/classroom requests were verified against the separately supplied backend and are documented in [CLASSROOM_INTEGRATION.md](CLASSROOM_INTEGRATION.md). The shared login now also accepts the faculty portal; `/ws/live` additionally handles the actual classroom event envelope.

`BASE` is `VITE_API_URL` (default `/api`), optionally overridden in Settings. IDs/references are percent-encoded; query parameters use URLSearchParams. Protected calls use the current session's bearer token. A 401 from that same session signs the user out; a late 401 from a previous session cannot erase the newer session.

| Workflow                       | Method and path on the backend                            | Data and response                                                                                                                                                                   |
| ------------------------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server readiness               | GET `/health`                                             | Object; optional `database` status. Open, no JWT sent.                                                                                                                              |
| Login                          | POST `/login`                                             | `{username,password}` → `{access_token,user}`. Validate complete response and matching admin/member portal before storing a session.                                                |
| Registration                   | POST `/register`                                          | `username,full_name,branch,roll_num,age,email,phone,password,re_enter_password`. Phone spaces/dashes removed, age numeric. No client role grant.                                    |
| Username check                 | GET `/username-available/{username}`                      | `{available:boolean}`. Server remains authoritative at registration.                                                                                                                |
| Own profile/session validation | GET `/users/{username}`                                   | User object; revalidated on page reload.                                                                                                                                            |
| Member directory               | GET `/admin/members`                                      | Array or `{members:[]}`. Names/roll numbers support the aliases used by PyQt.                                                                                                       |
| Raw account directory          | GET `/admin/users`                                        | Array or `{users:[]}`.                                                                                                                                                              |
| Account edit                   | PUT `/admin/users/{id}`                                   | `full_name,branch,roll_num,age,email,phone,role,is_active`.                                                                                                                         |
| Account removal                | DELETE `/admin/users/{id}`                                | Server's delete/deactivate operation; successful JSON or 204 accepted.                                                                                                              |
| All admin cameras              | GET `/admin/cameras`                                      | Array or `{cameras:[]}`. `camera_id` is the stream identifier.                                                                                                                      |
| Member cameras                 | GET `/me/cameras`                                         | Array or `{cameras:[]}`. No admin listing call for members.                                                                                                                         |
| Read camera assignments        | GET `/admin/members/{id}/cameras`                         | Array of IDs or `{camera_ids:[]}`. A failure never becomes a saveable empty list.                                                                                                   |
| Replace camera assignments     | PUT `/admin/members/{id}/cameras`                         | `{camera_ids:[...]}` including an intentional empty list to revoke all.                                                                                                             |
| AI state                       | GET `/ai/health`                                          | `status,scrfd,arcface,camera` from the desktop contract.                                                                                                                            |
| Camera runtime state           | GET `/ai/camera/status`                                   | `running,connected,camera_id,error` and any other existing runtime metadata.                                                                                                        |
| Current detections             | GET `/ai/detections`                                      | `{detections:[]}`; bare arrays also accepted by shared list normalization.                                                                                                          |
| AI start/stop                  | POST `/ai/start`, `/ai/stop`                              | Empty JSON object; start timeout 120 seconds, stop timeout 30 seconds.                                                                                                              |
| Camera stream                  | GET `/ai/camera/{camera_id}/stream`                       | MJPEG fetched with Authorization header. Incremental bounded parser, pause/cleanup, read watchdog, reconnect backoff. No audio contract.                                            |
| Admin full subject             | GET `/subjects/{reference}`                               | Full subject object with identity, the 17 editable fields, `image_url`, statistics, and `sightings`.                                                                                |
| Subject update                 | PUT `/admin/subjects/{reference}`                         | Changed fields only, including null for fields deliberately cleared. Authorization status/embeddings are not editable.                                                              |
| Subject list                   | GET `/subjects?auth_status=...&search=...`                | Array or `{subjects:[]}`.                                                                                                                                                           |
| Member public person           | GET `/persons/{reference}`                                | Only name, roll number, and branch are displayed, matching the uploaded member dashboard.                                                                                           |
| Entry register                 | GET `/entries?preset=...&status=...&search=...&limit=500` | `{entries:[],summary:{subjects,visits,authorised,unauthorised,on_camera_now}}`.                                                                                                     |
| Excel export                   | GET `/entries/export?preset=...&status=...&search=...`    | Authenticated binary `.xlsx` response, 60-second timeout. Same filters as the table, without the UI's 500-row limit.                                                                |
| Live events                    | WS `/ws/live?token=...`                                   | Existing `sighting`/`alert` message types invalidate entry data after an 800 ms coalescing window. Data or payload envelopes are supported for optional session activity rendering. |

## Identity semantics

A detection with `decided:false` is not placed in either identity list. An explicit enrolled/auto/blacklisted status takes precedence over a legacy `matched` flag. Only `recognition_confidence` is displayed as face similarity. The generic detector `confidence` is never substituted. `external_reference`, subject code, roll number, and the PyQt detection's `person_id` can serve as references; do not confuse monitored subjects with login accounts.

## Entry register fields

The table preserves: external reference, name, branch, auth status, visit_count, first_entry, last_entry, last_camera, total_seconds, has_profile_flag. It also marks on_camera_now. Period values are exactly `today`, `yesterday`, `week`, `month`, `all`. Status filter values are exactly `authorised`, `unauthorised`, `blacklisted`; they differ intentionally from subject auth_status values `enrolled`, `auto`, `blacklisted`.

## Real-time behavior

- Current detections: every 3 seconds; health/status: every 5 seconds; camera and member directory lists: every 30 seconds.
- Entry register: every 10 seconds and after relevant WebSocket messages. Requests within a single resource are not allowed to overlap; route/filter changes abort obsolete work.
- Polling is suspended while the tab is hidden and resumes on visibility. Camera streams are also disconnected while hidden. WebSocket remains open to receive alerts.
- WebSocket reconnects with capped exponential backoff and jitter. An explicit policy/auth close disables reconnect attempts for that session while REST remains available to validate access.
- Closing a dialog/page or signing out releases its requests, timers, stream readers, blob URLs, and socket. A user-initiated mutation may already have reached the server; closing its view does not promise to undo it.

## Unavailable contracts

The PyQt helpers `get_all_users`, `log_activity`, `get_recent_activity`, `get_recent_events`, `add_event`, and seed helpers contain no operational backend implementation. `/persons` and `/alerts/recent` are explicitly described as not implemented in the upload and are not needed by the active migrated workflows. Historical routes from the React references can be enabled via environment variables only when the server supports them. Reference 1's temporary/local permission grants are not a substitute for backend authorization.

The frontend cannot resolve a server that lacks a route, an unreachable database, camera/model startup failures, or an unavailable Redis publisher. It reports those conditions instead of inventing data.
