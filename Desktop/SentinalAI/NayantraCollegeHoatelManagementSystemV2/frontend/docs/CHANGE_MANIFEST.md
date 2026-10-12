# Change manifest

Compared byte-for-byte with the supplied `NayantraFrontend.zip` on 4 October 2026. No git history was used as the baseline.

## Modified existing files

- `README.md`
- `docs/API_CONTRACT.md`
- `docs/FEATURE_PARITY.md`
- `docs/VALIDATION.md`
- `src/App.tsx`
- `src/pages/Auth.tsx`
- `src/pages/Users.tsx`
- `src/state.tsx`

## Added files

- `START_HERE.md`
- `docs/CHANGE_MANIFEST.md`
- `docs/CLASSROOM_INTEGRATION.md`
- `docs/previews/faculty-dark-desktop.png`
- `docs/previews/faculty-light-desktop.png`
- `docs/previews/faculty-tablet.png`
- `src/features/classroom/AdminForm.tsx`
- `src/features/classroom/ZoneEditor.tsx`
- `src/features/classroom/api.ts`
- `src/features/classroom/backend.ts`
- `src/features/classroom/components.tsx`
- `src/features/classroom/contracts.ts`
- `src/features/classroom/events.ts`
- `src/features/classroom/geometry.ts`
- `src/features/classroom/state.tsx`
- `src/features/classroom/styles.css`
- `src/features/classroom/types.ts`
- `src/pages/ClassroomAdmin.tsx`
- `src/pages/Faculty.tsx`
- `tests/classroom.spec.ts`
- `tests/classroom.test.ts`

## Preserved and packaged

All other original source/configuration/tests are retained. In particular, shared CSS, CameraTile, Overview, Entries, the shared API wrapper and package manifests are unchanged. New classroom styling is isolated in `src/features/classroom/styles.css`.

`dist/` was rebuilt from the delivered source. Source, tests, setup/API/validation documentation and labelled fixture previews are included. Generated dependency directories, git internals, machine-specific environment settings and transient test reports are omitted; use `npm ci` and configure `.env` as described in START_HERE.md.

Backend source is not included. All 183 extracted backend source/support files matched their archive bytes after this work.

## Input fingerprints

| Supplied archive | SHA-256 |
| --- | --- |
| `NayantraFrontend.zip` | `72af64d63d6b7c827f8b60f4e2cb901d054d3d9979fa033ce3a3df56cd88a1d2` |
| `backend.zip` | `5c7a5c8ddeff9d452cb365c7720b8fd01a6fc69db0abe0ce4a03b28d99f61533` |
