# Nayantra React console

Complete React + TypeScript + Vite frontend for the supplied Nayantra backend. The original Sentinel console branding, components, light/dark themes and responsive shell are retained. This update includes Admin/Member surveillance, Faculty/Classroom attendance and the new Hostel Management module.

Start with the package's [../START_HERE.md](../START_HERE.md). Install with `npm ci`; run with `npm run dev`; build with `npm run build`. `dist/` contains the verified production build. Node.js 22 was used for verification.

## Server configuration

Create `.env` from `.env.example` only for a new setup. Preserve an existing configuration:

```dotenv
SENTINEL_BACKEND_URL=http://127.0.0.1:8000
VITE_API_URL=/api
VITE_AUTO_START_AI=true
```

The Vite proxy strips `/api` and forwards HTTP, WebSocket and MJPEG requests to FastAPI. Restart Vite after changes. A saved Settings API override takes priority over `VITE_API_URL`; use `/api` for the same-origin proxy. Never put backend credentials in Vite variables.

Choose the sign-in portal matching the account: Administrator, Member, Faculty, Hostel Warden or Hostel Guard. Public registration remains member-only. Real backend authorization determines every action; role-based navigation is not the security boundary.

## Hostel workflows

`src/pages/Hostels.tsx` supplies the registry and per-hostel workspace. `src/features/hostel/` contains API utilities, live-event state, reusable tables/forms, residents/rooms, daily operations, staff/gates/policies and scoped styles.

- Admin registry shows visible hostels, resident/bed counts and staff assignments.
- Wardens manage assigned hostels, residents, rooms, allocations, guards, gates, policies, visitors, leave, alerts, evidence and reports.
- Guards land on gate monitoring with assigned cameras, last confirmed movement, manual verification and security reporting. They can acknowledge alerts; they cannot resolve them, configure rooms or approve visitor/leave requests.
- Zone drawing captures a real frame, supports separate normalized outside/inside polygons, undo/clear and keyboard coordinate entry. The server checks geometry and scope.
- Resident tables combine shared identity data, membership, allocation history and confirmed presence. Admin cross-hostel transfer is a separate action.
- Shared CameraTile renders authenticated MJPEG. Missing/offline streams display errors and never substitute prerecorded production data.
- Unauthorized alerts display a prominent popup. Late/overdue/security messages may be silent; audio runs only on the backend flag after **Enable alert sound**. Acknowledgement/resolution closes the matching popup, and logout clears the previous account's event state.
- Live events refresh records with deduplication and coalescing. Periodic refresh remains a recovery fallback. Revoked access hides stale resource content.
- Evidence uses authorized download requests and explicit signed links. Signed URLs are opened without sending API bearer tokens to object storage.

Existing classroom adapters/pages, surveillance views and settings remain in place. Historical API/feature documents in `docs/` describe the earlier console and Faculty modules; current package validation is [../VALIDATION.md](../VALIDATION.md).

## Run tests

```bash
npm test
npx playwright install chromium
npm run test:e2e
```

Browser tests start isolated fixtures on ports 8765 and 5173. Stop a running dev server on those ports first. Test accounts, images, events and API mocks are only fixtures in `tests/`; the production frontend never seeds or falls back to them.

For production hosting, serve `dist/` with SPA fallback to `index.html`, then proxy `/api/` to FastAPI. Support WebSocket upgrade and long-lived MJPEG. `docs/nginx-frontend.conf` is the existing configuration example. HTTPS pages require reachable HTTPS API and storage URLs. `npm run preview` only checks the local build; it does not deploy the system.

## Troubleshooting

- No hostel: verify an active staff assignment, not just the account role.
- 403: verify current hostel/gate/camera scope with an administrator.
- Offline camera/frame: check backend AI readiness and stream credentials.
- No sound: use Enable alert sound and check browser/site audio settings.
- Recognition label wrong: follow `../IDENTITY_FIX.md`; do not edit UI labels to conceal a database mismatch.
- Evidence pending: inspect object storage and backend Hostel evidence-worker logs.
- Socket disconnected: records refresh periodically, but instant popup delivery needs a live socket.
