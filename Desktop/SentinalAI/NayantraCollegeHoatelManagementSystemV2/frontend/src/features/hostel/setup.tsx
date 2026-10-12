import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, messageOf, request, type Row } from "../../lib/api";
import { useResource } from "../../lib/hooks";
import { useAuth } from "../../state";
import { Button, ErrorBox, Field, Modal, Panel } from "../../components/ui";
import type { HostelContext } from "../../pages/Hostels";
import { dateTime, formValues, hostelApi, path } from "./api";
import {
  DataBoundary,
  FormDialog,
  Grid,
  SelectField,
  Status,
  useHostelResource,
} from "./common";
import { PersonSelect } from "./residents";
export function Staff({ hostel, scope }: HostelContext) {
  const [action, setAction] = useState<{ type: string; row: Row } | null>(null),
    [history, setHistory] = useState(false),
    staff = useHostelResource<Row[]>(hostel, `/staff?history=${history}`),
    candidates = useHostelResource<Row[]>(hostel, "/staff-candidates"),
    gates = useHostelResource<Row[]>(hostel, "/gates");
  return (
    <Panel
      title="Staff assignments"
      subtitle="Accounts need an active hostel assignment before they can access this workspace."
      action={
        <div className="actions">
          <Button onClick={() => setAction({ type: "account", row: {} })}>
            Create staff account
          </Button>
          <Button
            variant="primary"
            onClick={() => setAction({ type: "assign", row: {} })}
          >
            Assign staff
          </Button>
        </div>
      }
    >
      <div className="hostel-toolbar">
        <label>
          <input
            type="checkbox"
            checked={history}
            onChange={(e) => setHistory(e.target.checked)}
          />
          Include previous assignments
        </label>
      </div>
      <DataBoundary resource={staff}>
        <Grid
          rows={staff.data || []}
          id="assignment_id"
          columns={[
            {
              title: "Staff",
              cell: (r) => (
                <>
                  <strong>{r.full_name}</strong>
                  <small>
                    {r.username} · {r.staff_role}
                    {r.is_primary ? " · Primary warden" : ""}
                  </small>
                </>
              ),
            },
            {
              title: "Scope",
              cell: (r) => (
                <>
                  {r.gate_name || "All hostel gates"}
                  <small>
                    {r.shift_start && r.shift_end
                      ? `${r.shift_start} – ${r.shift_end}`
                      : "No shift label"}{" "}
                    ·{" "}
                    {r.person_id
                      ? "Face identity linked"
                      : "No physical-access identity"}
                  </small>
                </>
              ),
            },
            {
              title: "Status",
              cell: (r) => (
                <>
                  <Status
                    value={
                      r.released_at
                        ? "released"
                        : r.account_active
                          ? r.email_verified
                            ? "active"
                            : "email pending"
                          : "disabled"
                    }
                  />
                  <small>Since {dateTime(r.assigned_at)}</small>
                </>
              ),
            },
            {
              title: "Actions",
              cell: (r) =>
                !r.released_at &&
                (scope.admin || r.staff_role === "guard") && (
                  <Button
                    onClick={() => setAction({ type: "release", row: r })}
                  >
                    Remove assignment
                  </Button>
                ),
            },
          ]}
        />
      </DataBoundary>
      {action?.type === "assign" && (
        <FormDialog
          title="Assign hostel staff"
          onClose={() => setAction(null)}
          onSaved={staff.refresh}
          wide
          onSave={(v) => {
            const u = candidates.data?.find(
              (u) => String(u.user_id) === v.user_id,
            );
            if (!u) throw new Error("Select a valid staff account");
            return hostelApi.save(hostel, "/staff", {
              ...v,
              user_id: Number(v.user_id),
              staff_role: u.role === "hostel_warden" ? "warden" : "guard",
              is_primary: v.is_primary === "true",
              person_id: v.person_id || null,
              gate_id: v.gate_id || null,
              shift_start: v.shift_start || null,
              shift_end: v.shift_end || null,
            });
          }}
        >
          <DataBoundary resource={candidates}>
            <SelectField
              label="Account"
              name="user_id"
              required
              options={(candidates.data || [])
                .filter((u) => u.is_active)
                .map((u) => ({
                  value: String(u.user_id),
                  label: `${u.full_name} · ${u.role.replace("hostel_", "")}`,
                }))}
            />
          </DataBoundary>
          <SelectField
            label="Gate (guards only)"
            name="gate_id"
            placeholder="All hostel gates"
            options={(gates.data || []).map((g) => ({
              value: g.gate_id,
              label: g.name,
            }))}
          />
          {scope.admin && (
            <Field label="Primary warden">
              <select name="is_primary">
                <option value="false">No</option>
                <option value="true">Yes (warden account only)</option>
              </select>
            </Field>
          )}
          <PersonSelect hostel={hostel} required={false} />
          <Field label="Shift start">
            <input type="time" name="shift_start" />
          </Field>
          <Field label="Shift end">
            <input type="time" name="shift_end" />
          </Field>
        </FormDialog>
      )}
      {action?.type === "release" && (
        <FormDialog
          title="Remove staff assignment"
          onClose={() => setAction(null)}
          onSaved={staff.refresh}
          onSave={() =>
            hostelApi.save(hostel, `/staff/${action.row.assignment_id}/release`)
          }
        >
          <p>
            {action.row.full_name} will lose this assignment. Historical records
            stay available.
          </p>
        </FormDialog>
      )}
      {action?.type === "account" && (
        <FormDialog
          title="Create hostel staff account"
          onClose={() => setAction(null)}
          onSaved={() => {
            staff.refresh();
            candidates.refresh();
          }}
          wide
          onSave={(v) =>
            request(
              scope.admin ? "/admin/users" : path(hostel, "/guard-accounts"),
              {
                method: "POST",
                body: {
                  ...v,
                  age: Number(v.age),
                  role: v.role || "hostel_guard",
                },
              },
            )
          }
        >
          <Field label="Full name">
            <input name="full_name" required minLength={3} maxLength={50} />
          </Field>
          <Field label="Username">
            <input
              name="username"
              required
              minLength={3}
              maxLength={32}
              pattern="[A-Za-z0-9_]+"
              autoComplete="off"
            />
          </Field>
          <Field label="Staff ID / roll number">
            <input
              name="roll_num"
              required
              minLength={2}
              maxLength={20}
              pattern="[A-Za-z0-9/-]+"
            />
          </Field>
          <Field label="Department">
            <input name="branch" required minLength={2} maxLength={100} />
          </Field>
          <Field label="Age">
            <input name="age" type="number" required min={13} max={120} />
          </Field>
          <Field label="Email">
            <input name="email" type="email" required />
          </Field>
          <Field label="Phone with country code">
            <input
              name="phone"
              type="tel"
              required
              pattern="\+?[1-9][0-9]{7,14}"
            />
          </Field>
          <Field label="Initial password">
            <input
              name="password"
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
            />
          </Field>
          {scope.admin && (
            <Field label="Role">
              <select name="role">
                <option value="hostel_guard">Hostel Guard</option>
                <option value="hostel_warden">Hostel Warden</option>
              </select>
            </Field>
          )}
          <p>
            The staff member must sign in and verify their email to activate
            access. Use Assign staff to grant hostel or gate access.
          </p>
        </FormDialog>
      )}
    </Panel>
  );
}
function CameraAssignment({
  hostel,
  onClose,
  onSaved,
}: {
  hostel: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const data = useResource(
    (s) => api.cameras(true, s),
    "hostel-camera-candidates",
    0,
  );
  return (
    <FormDialog
      title="Assign hostel camera"
      onClose={onClose}
      onSaved={onSaved}
      onSave={(v) => hostelApi.save(hostel, "/cameras", v)}
    >
      <DataBoundary resource={data}>
        <SelectField
          label="Camera"
          name="camera_id"
          required
          options={(data.data || []).map((c) => ({
            value: c.camera_id,
            label: c.camera_name,
          }))}
        />
      </DataBoundary>
      <p>
        A camera can belong to one hostel. Add new devices in the Camera
        console.
      </p>
    </FormDialog>
  );
}
export function GateSetup({ hostel, scope }: HostelContext) {
  const gates = useHostelResource<Row[]>(hostel, "/gates"),
    cameras = useHostelResource<Row[]>(hostel, "/cameras"),
    [action, setAction] = useState<{ type: string; row: Row } | null>(null),
    refresh = () => {
      gates.refresh();
      cameras.refresh();
    };
  return (
    <>
      <Panel
        title="Gates & zones"
        subtitle="Assign a camera, then draw separate outside and inside zones on a captured frame."
        action={
          <Button
            variant="primary"
            onClick={() => setAction({ type: "gate", row: {} })}
          >
            Add gate
          </Button>
        }
      >
        <DataBoundary resource={gates}>
          <Grid
            rows={gates.data || []}
            id="gate_id"
            columns={[
              {
                title: "Gate",
                cell: (g) => (
                  <>
                    <strong>{g.name}</strong>
                    <small>{g.code}</small>
                  </>
                ),
              },
              { title: "Camera", cell: (g) => g.camera_name || "Unassigned" },
              {
                title: "Configuration",
                cell: (g) => (
                  <>
                    <Status value={g.is_active ? "active" : "disabled"} />
                    <small>
                      {g.outside_zone_id && g.inside_zone_id
                        ? "Both zones saved"
                        : "Zones required"}
                    </small>
                  </>
                ),
              },
              {
                title: "Actions",
                cell: (g) => (
                  <div className="actions">
                    <Button onClick={() => setAction({ type: "gate", row: g })}>
                      Edit gate
                    </Button>
                    <Button
                      disabled={!g.camera_id}
                      onClick={() => setAction({ type: "zones", row: g })}
                    >
                      Draw zones
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        </DataBoundary>
      </Panel>
      <Panel
        title="Assigned cameras"
        action={
          scope.admin && (
            <Button onClick={() => setAction({ type: "camera", row: {} })}>
              Assign camera
            </Button>
          )
        }
      >
        <DataBoundary resource={cameras}>
          <Grid
            rows={cameras.data || []}
            id="camera_id"
            columns={[
              { title: "Camera", cell: (c) => c.camera_name },
              {
                title: "Status",
                cell: (c) => (
                  <Status value={c.is_active ? "active" : "disabled"} />
                ),
              },
              ...(scope.admin
                ? [
                    {
                      title: "Actions",
                      cell: (c: Row) => (
                        <Button
                          onClick={() => setAction({ type: "detach", row: c })}
                        >
                          Remove from hostel
                        </Button>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </DataBoundary>
        {scope.admin && (
          <div className="hostel-padding">
            <Link className="button" to="/cameras">
              Open camera console
            </Link>
          </div>
        )}
      </Panel>
      {action?.type === "gate" && (
        <FormDialog
          title={action.row.gate_id ? "Edit gate" : "Add gate"}
          onClose={() => setAction(null)}
          onSaved={refresh}
          onSave={(v) =>
            hostelApi.save(
              hostel,
              action.row.gate_id ? `/gates/${action.row.gate_id}` : "/gates",
              {
                ...v,
                camera_id: v.camera_id || null,
                is_active: v.is_active === "true",
              },
              action.row.gate_id ? "PUT" : "POST",
            )
          }
        >
          <Field label="Gate code">
            <input
              name="code"
              minLength={2}
              maxLength={30}
              pattern="[A-Za-z0-9_-]+"
              required
              defaultValue={action.row.code}
            />
          </Field>
          <Field label="Gate name">
            <input
              name="name"
              maxLength={100}
              required
              defaultValue={action.row.name}
            />
          </Field>
          <SelectField
            label="Assigned camera"
            name="camera_id"
            value={action.row.camera_id}
            options={(cameras.data || []).map((c) => ({
              value: c.camera_id,
              label: c.camera_name,
            }))}
            placeholder="No camera (manual gate)"
          />
          <Field label="Gate status">
            <select
              name="is_active"
              defaultValue={String(action.row.is_active ?? true)}
            >
              <option value="true">Active</option>
              <option value="false">Disabled</option>
            </select>
          </Field>
          <p>Changing the camera clears its saved zones.</p>
        </FormDialog>
      )}
      {action?.type === "camera" && (
        <CameraAssignment
          hostel={hostel}
          onClose={() => setAction(null)}
          onSaved={refresh}
        />
      )}
      {action?.type === "detach" && (
        <FormDialog
          title="Remove hostel camera"
          onClose={() => setAction(null)}
          onSaved={refresh}
          onSave={() =>
            hostelApi.save(
              hostel,
              `/cameras/${action.row.camera_id}`,
              undefined,
              "DELETE",
            )
          }
        >
          <p>First detach {action.row.camera_name} from any configured gate.</p>
        </FormDialog>
      )}
      {action?.type === "zones" && (
        <ZoneEditor
          hostel={hostel}
          gate={action.row}
          onClose={() => setAction(null)}
          onSaved={refresh}
        />
      )}
    </>
  );
}
type Point = [number, number];
function ZoneEditor({
  hostel,
  gate,
  onClose,
  onSaved,
}: {
  hostel: string;
  gate: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [zones, setZones] = useState<{ outside: Point[]; inside: Point[] }>({
      outside: gate.outside_points || [],
      inside: gate.inside_points || [],
    }),
    [side, setSide] = useState<"outside" | "inside">("outside"),
    [src, setSrc] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0),
    { notice } = useAuth();
  useEffect(() => {
    const c = new AbortController();
    let url = "";
    setError("");
    setSrc("");
    request<Blob>(path(hostel, `/cameras/${gate.camera_id}/frame`), {
      binary: true,
      signal: c.signal,
    })
      .then((b) => {
        if (c.signal.aborted) return;
        url = URL.createObjectURL(b);
        setSrc(url);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(messageOf(e));
      });
    return () => {
      c.abort();
      URL.revokeObjectURL(url);
    };
  }, [hostel, gate.camera_id, refresh]);
  const add = (p: Point) =>
    setZones((z) => ({
      ...z,
      [side]: z[side].length < 50 ? [...z[side], p] : z[side],
    }));
  return (
    <Modal
      title={`Draw gate zones · ${gate.name}`}
      wide
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <ErrorBox message={error} />
      <p>
        Choose a zone and click its corners. Each polygon needs at least three
        corners. Keep the polygons separate. The foot of a person’s box is used
        for crossings.
      </p>
      <div className="hostel-toolbar">
        <Button
          variant={side === "outside" ? "primary" : ""}
          onClick={() => setSide("outside")}
        >
          Outside · {zones.outside.length} points
        </Button>
        <Button
          variant={side === "inside" ? "primary" : ""}
          onClick={() => setSide("inside")}
        >
          Inside · {zones.inside.length} points
        </Button>
        <Button
          onClick={() =>
            setZones((z) => ({ ...z, [side]: z[side].slice(0, -1) }))
          }
        >
          Undo corner
        </Button>
        <Button onClick={() => setZones((z) => ({ ...z, [side]: [] }))}>
          Clear {side}
        </Button>
        <Button onClick={() => setRefresh((v) => v + 1)}>Refresh frame</Button>
      </div>
      {src && (
        <div className="hostel-zone-frame">
          <img src={src} alt="Current gate camera frame" />
          <svg
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
            aria-label="Gate zone drawing canvas"
            onPointerDown={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              add([
                Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
                Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
              ]);
            }}
          >
            {(["outside", "inside"] as const).map((s) => (
              <g key={s} className={s}>
                <polygon
                  points={zones[s]
                    .map((p) => `${p[0] * 1000},${p[1] * 1000}`)
                    .join(" ")}
                />
                {zones[s].map((p, i) => (
                  <circle key={i} cx={p[0] * 1000} cy={p[1] * 1000} r={6} />
                ))}
              </g>
            ))}
          </svg>
        </div>
      )}
      <details>
        <summary>Enter normalized coordinates with a keyboard</summary>
        <form
          className="hostel-toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            const v = formValues(e.currentTarget);
            add([Number(v.x), Number(v.y)]);
          }}
        >
          <Field label="X (0–1)">
            <input name="x" type="number" min={0} max={1} step="any" required />
          </Field>
          <Field label="Y (0–1)">
            <input name="y" type="number" min={0} max={1} step="any" required />
          </Field>
          <Button>Add corner</Button>
        </form>
      </details>
      <div className="modal-actions">
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={busy || zones.inside.length < 3 || zones.outside.length < 3}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await hostelApi.save(
                hostel,
                `/gates/${gate.gate_id}/zones`,
                zones,
                "PUT",
              );
              notice("Gate zones saved.", "success");
              onSaved();
              onClose();
            } catch (e) {
              setError(messageOf(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Saving…" : "Save both zones"}
        </Button>
      </div>
    </Modal>
  );
}
export function Policies({ hostel, scope }: HostelContext) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    { notice } = useAuth(),
    p = scope.policies,
    numbers: [string, string, number, number][] = [
      ["late_grace_minutes", "Late-entry grace (minutes)", 0, 180],
      ["overdue_grace_minutes", "Overdue-return grace (minutes)", 0, 1440],
      ["evidence_retention_days", "Evidence retention (days)", 1, 365],
      ["debounce_seconds", "Movement debounce (seconds)", 0, 60],
      [
        "transition_confirm_frames",
        "Consecutive frames to confirm zone",
        1,
        15,
      ],
      ["transition_timeout_seconds", "Maximum crossing gap (seconds)", 2, 120],
      ["identity_wait_seconds", "Identity confirmation wait (seconds)", 0, 30],
    ];
  return (
    <Panel
      title="Hostel policies"
      subtitle="Policy changes are audited. Late entry is separate from unauthorized entry."
    >
      <form
        className="hostel-padding"
        onSubmit={async (e) => {
          e.preventDefault();
          const v = formValues(e.currentTarget);
          for (const [k] of numbers) v[k] = Number(v[k]);
          for (const k of [
            "late_entry_enabled",
            "late_sound_required",
            "overdue_enabled",
          ])
            v[k] = v[k] === "true";
          for (const k of [
            "entry_start",
            "entry_close",
            "visitor_start",
            "visitor_close",
          ])
            v[k] = v[k] || null;
          setBusy(true);
          setError("");
          try {
            await hostelApi.save(hostel, "/policies", v, "PUT");
            notice("Hostel policies saved.", "success");
          } catch (e) {
            setError(messageOf(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <ErrorBox message={error} />
        <fieldset disabled={busy}>
          <div className="form-grid">
            <Field label="Policy time zone">
              <input name="time_zone" required defaultValue={p.time_zone} />
            </Field>
            {[
              ["entry_start", "Entry hours start (optional)"],
              ["entry_close", "Entry closing time"],
              ["visitor_start", "Visitor hours start"],
              ["visitor_close", "Visitor hours close"],
            ].map(([k, t]) => (
              <Field key={k} label={t}>
                <input
                  type="time"
                  name={k}
                  defaultValue={p[k]?.slice(0, 5) || ""}
                />
              </Field>
            ))}
            {[
              ["late_entry_enabled", "Enable late-entry monitoring"],
              ["late_sound_required", "Sound for late-entry alerts"],
              ["overdue_enabled", "Enable overdue-return alerts"],
            ].map(([k, t]) => (
              <Field key={k} label={t}>
                <select name={k} defaultValue={String(p[k])}>
                  <option value="false">No</option>
                  <option value="true">Yes</option>
                </select>
              </Field>
            ))}
            {numbers.map(([k, t, min, max]) => (
              <Field key={k} label={t}>
                <input
                  name={k}
                  type="number"
                  min={min}
                  max={max}
                  required
                  step={k === "debounce_seconds" ? ".1" : "1"}
                  defaultValue={p[k]}
                />
              </Field>
            ))}
            <Field label="Unauthorized entry severity">
              <select
                name="unauthorized_severity"
                defaultValue={p.unauthorized_severity}
              >
                <option value="critical">Critical</option>
                <option value="high">High</option>
              </select>
            </Field>
          </div>
          <p className="muted">
            Unauthorized-entry sound is required. Click Enable alert sound once
            to allow browser audio.
          </p>
          <Button variant="primary" disabled={busy}>
            {busy ? "Saving…" : "Save policies"}
          </Button>
        </fieldset>
      </form>
    </Panel>
  );
}
