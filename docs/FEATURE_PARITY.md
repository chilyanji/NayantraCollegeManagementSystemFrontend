# Migration and reference analysis

Historical record from the original frontend package. The current faculty/classroom extension uses the supplied `NayantraFrontend.zip` and `backend.zip`; see [CLASSROOM_INTEGRATION.md](CLASSROOM_INTEGRATION.md) and [CHANGE_MANIFEST.md](CHANGE_MANIFEST.md). References below to the earlier upload's two roles describe that original migration. The current update adds faculty using the inspected backend contracts.

The source of truth is the newly provided `FrontendCopy.zip`, not an older repaired project archive. The unavailable `SentinelSurvillanceSystem - Copy03.zip` was not read or used.

## Existing PyQt workflows

| Source window/control                    | React replacement                | Preserved behavior                                                                                                                                                               |
| ---------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.py` splash/initialization          | Loading and connection states    | Readiness is real request state instead of simulated splash progress; no demo seed calls.                                                                                        |
| `login.py` admin/member portals          | Login page                       | Portal selection, exact password submission, wrong-role errors, full returned profile, sign-out.                                                                                 |
| `register.py`                            | Registration page                | Username, name, branch, roll, age, email, phone, password confirmation; validation and server errors.                                                                            |
| `AdminDashboard` overview                | Overview                         | Assigned cameras, members, detection panels, clock, AI state/models, manual refresh, account/entry navigation.                                                                   |
| Admin camera tiles and fullscreen dialog | Camera workspace                 | Real camera IDs, grid/focus selection, expanded dialog with Escape, status, live image, cleanup. Added functional pause and frame download.                                      |
| `ControlRoomDashboard`                   | Member overview/cameras/profile  | Assigned-camera endpoint, selector, current detections, own account data, sign-out.                                                                                              |
| Member recognized-person popup           | Public profile dialog            | Existing `/persons/{reference}` call; only name, roll, branch shown. No full subject/contact records fetched.                                                                    |
| Admin authorized/unknown lists           | Overview identity panels         | One shared detection request, pending exclusion, explicit authorization distinction, recognition similarity, profile opening.                                                    |
| Members directory/detail                 | Accounts & access → Members      | Name/roll/branch/email searching, full details, camera permissions.                                                                                                              |
| `UserManagementDialog`                   | Accounts & access → All accounts | Raw account list, edit form, delete/deactivate request, refresh/search, protected admin rows.                                                                                    |
| Edit account dialog                      | Edit account modal               | Full name, branch, roll, age, email, phone, role, active status.                                                                                                                 |
| Camera-access checkboxes                 | Camera permissions modal         | Load camera catalog and assignments; replace complete assignment list; allow deliberate revoke-all; errors block unsafe save.                                                    |
| `SubjectProfileDialog`                   | Subject profile modal            | All 17 fields, signed image, visits/face sample stats, first/last seen, sighting history, changed-field saves.                                                                   |
| `EntryLogWindow`                         | Entry log                        | All period/status/search filters, five summary cards, ten table columns, current-camera marker, stable selection, detail image, double-click/profile button, export and refresh. |
| `LiveEventWorker`                        | Shared live socket               | Same `/ws/live?token=...`, sighting/alert refresh, coalescing, fallback polling; adds reconnect and accurate connection status.                                                  |
| Entry Excel save dialog                  | Browser `.xlsx` download         | Existing authenticated export request, identical filters; browser manages the save location.                                                                                     |
| Activity/events text areas               | Activity tabs                    | Live session messages work. Historical views explicitly disclose the original helpers' lack of wiring; optional reference routes are configurable.                               |

## What is taken from each React reference

**New Frontend (1):** persistent sidebar/workspace grouping, clearer separation of role-specific navigation, account directory and permission dialog organization, reusable status cards and section headers. Its localStorage permission simulations and extra security-role assumptions were not promoted to backend capabilities.

**New Frontend 2:** camera-first workspace, grid/focus controls, quick member/profile access, a quieter status bar, notification navigation, and connection testing/settings. Its offline-generated people, fabricated camera counts, fake historical events, misleading always-live badges, and decorative mute controls were removed.

**Unified design:** bundled Inter font; navy navigation, light neutral content and blue primary actions; green/amber/red only for meaningful states; consistent spacing, borders, inputs, tables and dialogs. Dark theme, mobile navigation, keyboard focus, labelled inputs, native focus-trapped dialogs, skip navigation, reduced-motion support, and explicit loading/error/empty states are shared across pages.

## Scope boundaries

Only React/frontend source, frontend configuration, a production build, tests, and setup documentation are delivered. The backend is untouched. Database/cloud/Redis operations continue through existing services; this project includes no database client or backend business logic.

The upload exposes two roles: admin and member. The React reference's additional security-personnel role and temporary-permission administration lack a matching contract in this main frontend. Implementing them as real authorization would require backend confirmation; browser-local permissions would not preserve security.

The current desktop source's activity/events helpers are placeholders, not functioning history integrations. No functionality is claimed for those unimplemented server capabilities. Existing live events and entry history remain implemented.
