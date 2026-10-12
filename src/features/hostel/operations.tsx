import { useRef, useState } from "react";
import { CameraTile } from "../../components/CameraTile";
import {
  Badge,
  Button,
  Empty,
  ErrorBox,
  Field,
  Modal,
  Panel,
  SearchBox,
} from "../../components/ui";
import { messageOf, request, type Row } from "../../lib/api";
import { download } from "../../lib/domain";
import type { HostelContext } from "../../pages/Hostels";
import { dateTime, hostelApi, iso, label, path, query, type Page } from "./api";
import {
  DataBoundary,
  FormDialog,
  Grid,
  NoteField,
  Pager,
  ResidentSelect,
  SelectField,
  Status,
  useHostelResource,
} from "./common";
import { PersonSelect } from "./residents";
import { useHostelLive } from "./state";
function GateSelect({ hostel }: { hostel: string }) {
  const gates = useHostelResource<Row[]>(hostel, "/gates", 0);
  return (
    <DataBoundary resource={gates}>
      <SelectField
        label="Gate"
        name="gate_id"
        required
        options={(gates.data || [])
          .filter((g) => g.is_active)
          .map((g) => ({ value: g.gate_id, label: g.name }))}
      />
    </DataBoundary>
  );
}
export function Entries({ hostel }: HostelContext) {
  const [q, setQ] = useState(""),
    [direction, setDirection] = useState(""),
    [auth, setAuth] = useState(""),
    [since, setSince] = useState(""),
    [until, setUntil] = useState(""),
    [room, setRoom] = useState(""),
    [floor, setFloor] = useState(""),
    [gate, setGate] = useState(""),
    [offset, setOffset] = useState(0),
    gates = useHostelResource<Row[]>(hostel, "/gates");
  const data = useHostelResource<Page>(
      hostel,
      `/entries${query({ q, direction, authorized: auth, since: since ? iso(since) : "", until: until ? iso(until) : "", room, floor, gate_id: gate, offset })}`,
      15000,
    ),
    reset = (f: () => void) => {
      f();
      setOffset(0);
    };
  return (
    <Panel
      title="Entry / exit history"
      subtitle="Confirmed movements, identity and authorization at the gate. Times use this device’s local time zone."
    >
      <div className="hostel-toolbar">
        <SearchBox
          value={q}
          onChange={(v) => reset(() => setQ(v))}
          placeholder="Name, roll or room"
        />
        <SelectField
          label="Gate"
          name="gate_filter"
          value={gate}
          onChange={(v) => reset(() => setGate(v))}
          placeholder="All assigned gates"
          options={(gates.data || []).map((g) => ({
            value: g.gate_id,
            label: g.name,
          }))}
        />
        <SelectField
          name="direction"
          label="Direction"
          value={direction}
          onChange={(v) => reset(() => setDirection(v))}
          placeholder="Both directions"
          options={[
            { value: "in", label: "IN" },
            { value: "out", label: "OUT" },
          ]}
        />
        <SelectField
          name="auth"
          label="Authorization"
          value={auth}
          onChange={(v) => reset(() => setAuth(v))}
          placeholder="All people"
          options={[
            { value: "true", label: "Authorized" },
            { value: "false", label: "Unauthorized" },
          ]}
        />
        <Field label="From">
          <input
            type="datetime-local"
            value={since}
            onChange={(e) => reset(() => setSince(e.target.value))}
          />
        </Field>
        <Field label="Until (exclusive)">
          <input
            type="datetime-local"
            value={until}
            onChange={(e) => reset(() => setUntil(e.target.value))}
          />
        </Field>
        <Field label="Room">
          <input
            value={room}
            onChange={(e) => reset(() => setRoom(e.target.value))}
          />
        </Field>
        <Field label="Floor">
          <input
            type="number"
            value={floor}
            onChange={(e) => reset(() => setFloor(e.target.value))}
          />
        </Field>
      </div>
      <DataBoundary resource={data}>
        <Grid
          rows={data.data?.items || []}
          id="entry_id"
          columns={[
            {
              title: "Time / direction",
              cell: (r) => (
                <>
                  <strong>{String(r.direction).toUpperCase()}</strong>
                  <small>{dateTime(r.occurred_at)}</small>
                </>
              ),
            },
            {
              title: "Person",
              cell: (r) => (
                <>
                  <strong>{r.display_name || "Unidentified person"}</strong>
                  <small>{r.person_ref || "No identity confirmed"}</small>
                </>
              ),
            },
            {
              title: "Authorization",
              cell: (r) => (
                <>
                  <Status
                    value={r.is_authorized ? "authorized" : "unauthorized"}
                  />
                  <small>{label(r.auth_result)}</small>
                </>
              ),
            },
            {
              title: "Location",
              cell: (r) => (
                <>
                  {r.gate_name}
                  <small>
                    {r.camera_name || "Manual gate"} · Room{" "}
                    {r.room_number || "—"} · Floor {r.floor_number ?? "—"}
                  </small>
                </>
              ),
            },
            {
              title: "Verification",
              cell: (r) => (
                <>
                  <Badge>{r.source}</Badge>
                  <small>{r.verification_note}</small>
                </>
              ),
            },
          ]}
        />
        <Pager page={data.data} offset={offset} setOffset={setOffset} />
      </DataBoundary>
    </Panel>
  );
}
function ManualForm({
  hostel,
  security,
  onClose,
  onSaved,
}: {
  hostel: string;
  security: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const key = useRef(crypto.randomUUID());
  return (
    <FormDialog
      title={security ? "Report security event" : "Record verified movement"}
      onClose={onClose}
      onSaved={onSaved}
      onSave={(v) =>
        hostelApi.save(
          hostel,
          security ? "/security-events" : "/entries/manual",
          {
            ...v,
            person_id: v.person_id || null,
            ...(!security ? { idempotency_key: key.current } : {}),
          },
        )
      }
    >
      <GateSelect hostel={hostel} />
      <ResidentSelect hostel={hostel} name="person_id" person optional />
      {!security && (
        <Field label="Verified direction">
          <select name="direction">
            <option value="in">IN · entered hostel</option>
            <option value="out">OUT · left hostel</option>
          </select>
        </Field>
      )}
      <NoteField />
      <p>
        Verify the person and physical movement before recording. Authorization
        is checked by the server; this action is audited.
      </p>
    </FormDialog>
  );
}
export function GateMonitor({ hostel, scope }: HostelContext) {
  const gates = useHostelResource<Row[]>(hostel, "/gates"),
    cameras = useHostelResource<Row[]>(hostel, "/cameras"),
    [gate, setGate] = useState(""),
    [manual, setManual] = useState<"movement" | "security" | null>(null),
    { events } = useHostelLive(),
    selected =
      (gates.data || []).find((g) => g.gate_id === gate) ||
      (gates.data || [])[0],
    camera = (cameras.data || []).find(
      (c) => c.camera_id === selected?.camera_id,
    ),
    recent = useHostelResource<Page>(
      hostel,
      `/entries${query({ gate_id: selected?.gate_id, limit: 10 })}`,
      10000,
    ),
    latest =
      events.filter(
        (e) =>
          e.data.hostel_id === hostel &&
          e.data.gate_id === selected?.gate_id &&
          ["hostel.person_in", "hostel.person_out"].includes(e.type),
      )[0]?.data || recent.data?.items[0];
  return (
    <>
      <div className="hostel-toolbar">
        <SelectField
          label="Assigned gate"
          name="gate"
          value={selected?.gate_id || ""}
          onChange={setGate}
          options={(gates.data || []).map((g) => ({
            value: g.gate_id,
            label: g.name,
          }))}
        />
        <Button onClick={() => setManual("movement")}>
          Manual verification
        </Button>
        <Button onClick={() => setManual("security")}>
          Report security event
        </Button>
      </div>
      <DataBoundary resource={gates}>
        <DataBoundary resource={cameras}>
          <div className="hostel-two-column">
            <div>
              {camera ? (
                <CameraTile key={camera.camera_id} camera={camera} expanded />
              ) : (
                <Panel>
                  <Empty
                    title="No gate camera available"
                    detail={
                      scope.manage
                        ? "Assign a camera under Gates & cameras."
                        : "Ask your warden to configure the assigned gate camera."
                    }
                  />
                </Panel>
              )}
            </div>
            <Panel
              title="Last confirmed movement"
              subtitle="Pending identities are not treated as confirmed names."
            >
              {latest ? (
                <div className="hostel-padding">
                  <Status
                    value={latest.is_authorized ? "authorized" : "unauthorized"}
                  />
                  <h2>{latest.display_name || "Unidentified person"}</h2>
                  <p>{latest.person_ref || "No confirmed identity"}</p>
                  <p>
                    <strong>{String(latest.direction).toUpperCase()}</strong> ·{" "}
                    {dateTime(latest.occurred_at)}
                  </p>
                  <p>
                    {label(latest.auth_result)} · Room{" "}
                    {latest.room_number || "—"}
                  </p>
                </div>
              ) : (
                <Empty title="Waiting for a confirmed crossing" />
              )}
              {selected &&
                (!selected.outside_zone_id || !selected.inside_zone_id) && (
                  <div className="hostel-padding">
                    <Badge tone="amber">Gate zones are not configured</Badge>
                    <p>
                      Draw both zones before automatic entry / exit detection
                      can start.
                    </p>
                  </div>
                )}
            </Panel>
          </div>
        </DataBoundary>
      </DataBoundary>
      {manual && (
        <ManualForm
          hostel={hostel}
          security={manual === "security"}
          onClose={() => setManual(null)}
          onSaved={recent.refresh}
        />
      )}
    </>
  );
}
export function Alerts({ hostel, scope }: HostelContext) {
  const [status, setStatus] = useState(""),
    [offset, setOffset] = useState(0),
    [action, setAction] = useState<{ row: Row; action: string } | null>(null),
    data = useHostelResource<Page>(
      hostel,
      `/alerts${query({ status, offset })}`,
      10000,
    );
  return (
    <Panel
      title="Hostel alerts"
      subtitle="Unauthorized entry, late return and security events use the shared alert system."
    >
      <div className="hostel-toolbar">
        <SelectField
          name="status"
          label="Status"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setOffset(0);
          }}
          placeholder="All statuses"
          options={[
            "open",
            "acknowledged",
            "investigating",
            "resolved",
            "dismissed",
          ].map((value) => ({ value, label: value }))}
        />
      </div>
      <DataBoundary resource={data}>
        <Grid
          rows={data.data?.items || []}
          id="alert_id"
          columns={[
            {
              title: "Alert",
              cell: (r) => (
                <>
                  <strong>{r.title}</strong>
                  <small>{r.description}</small>
                  <small>
                    {r.gate_name || "Hostel-wide"} · {dateTime(r.triggered_at)}
                  </small>
                </>
              ),
            },
            { title: "Severity", cell: (r) => <Status value={r.severity} /> },
            { title: "Status", cell: (r) => <Status value={r.status} /> },
            {
              title: "Actions",
              cell: (r) =>
                !["resolved", "dismissed"].includes(r.status) && (
                  <div className="actions">
                    {r.status === "open" && (
                      <Button
                        onClick={() =>
                          setAction({ row: r, action: "acknowledge" })
                        }
                      >
                        Acknowledge
                      </Button>
                    )}
                    {scope.manage && (
                      <Button
                        onClick={() => setAction({ row: r, action: "resolve" })}
                      >
                        Resolve
                      </Button>
                    )}
                  </div>
                ),
            },
          ]}
        />
        <Pager page={data.data} offset={offset} setOffset={setOffset} />
      </DataBoundary>
      {action && (
        <FormDialog
          title={`${label(action.action)} alert`}
          onClose={() => setAction(null)}
          onSaved={data.refresh}
          onSave={(v) =>
            hostelApi.save(hostel, `/alerts/${action.row.alert_id}/actions`, {
              ...v,
              action: action.action,
            })
          }
        >
          <p>{action.row.title}</p>
          <NoteField />
        </FormDialog>
      )}
    </Panel>
  );
}
export function Evidence({ hostel }: HostelContext) {
  const [offset, setOffset] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [link, setLink] = useState<{ url: string; name: string } | null>(null),
    data = useHostelResource<Page>(hostel, `/evidence${query({ offset })}`);
  async function open(r: Row) {
    setError("");
    setBusy(r.evidence_id);
    try {
      const result = await hostelApi.get(
          hostel,
          `/evidence/${r.evidence_id}/download`,
        ),
        url = new URL(result.url);
      if (!["http:", "https:"].includes(url.protocol))
        throw new Error("Invalid evidence URL");
      setLink({ url: url.href, name: result.file_name || r.file_name });
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy("");
    }
  }
  return (
    <Panel
      title="Evidence"
      subtitle="Gate snapshots use the existing evidence store, integrity checksum, custody log and retention policy."
    >
      <ErrorBox message={error} />
      {link && (
        <div className="hostel-padding">
          <a
            className="button primary"
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Download {link.name}
          </a>
        </div>
      )}
      <DataBoundary resource={data}>
        <Grid
          rows={data.data?.items || []}
          id="evidence_id"
          columns={[
            {
              title: "Evidence",
              cell: (r) => (
                <>
                  <strong>{r.file_name}</strong>
                  <small>{r.title}</small>
                  <small>{dateTime(r.captured_at)}</small>
                </>
              ),
            },
            {
              title: "Integrity",
              cell: (r) => <code className="hostel-hash">{r.sha256}</code>,
            },
            {
              title: "Retention",
              cell: (r) =>
                r.purged_at ? (
                  <>
                    <Status value="purged" />
                    <small>{r.purge_reason}</small>
                  </>
                ) : (
                  <>Expires {dateTime(r.expires_at)}</>
                ),
            },
            {
              title: "Download",
              cell: (r) => (
                <Button
                  disabled={!!r.purged_at || busy === r.evidence_id}
                  onClick={() => open(r)}
                >
                  {busy === r.evidence_id ? "Preparing…" : "Open evidence"}
                </Button>
              ),
            },
          ]}
        />
        <Pager page={data.data} offset={offset} setOffset={setOffset} />
      </DataBoundary>
    </Panel>
  );
}
function VisitorHistory({
  hostel,
  row,
  onClose,
}: {
  hostel: string;
  row: Row;
  onClose: () => void;
}) {
  const r = useHostelResource<Row[]>(
    hostel,
    `/visitors/${row.visitor_id}/history`,
    0,
  );
  return (
    <Modal title={`${row.name} · visit history`} onClose={onClose} wide>
      <DataBoundary resource={r}>
        <Grid
          rows={r.data || []}
          columns={[
            { title: "Action", cell: (x) => label(x.action) },
            { title: "Time", cell: (x) => dateTime(x.occurred_at) },
            { title: "Note", cell: (x) => x.note || "—" },
          ]}
        />
      </DataBoundary>
    </Modal>
  );
}
export function Visitors({ hostel, scope }: HostelContext) {
  const [q, setQ] = useState(""),
    [offset, setOffset] = useState(0),
    [status, setStatus] = useState(""),
    [action, setAction] = useState<{ type: string; row: Row } | null>(null),
    data = useHostelResource<Page>(
      hostel,
      `/visitors${query({ q, offset, status })}`,
    );
  return (
    <Panel
      title="Visitor management"
      subtitle="Register a visit, obtain approval, then check the visitor in and out."
      action={
        <Button
          variant="primary"
          onClick={() => setAction({ type: "create", row: {} })}
        >
          Register visitor
        </Button>
      }
    >
      <div className="hostel-toolbar">
        <SearchBox
          value={q}
          onChange={(v) => {
            setQ(v);
            setOffset(0);
          }}
          placeholder="Visitor name, phone or gate"
        />
        <SelectField
          label="Visit status"
          name="status"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setOffset(0);
          }}
          placeholder="All visits"
          options={["pending", "approved", "inside", "exited", "rejected"].map(
            (value) => ({ value, label: value }),
          )}
        />
      </div>
      <DataBoundary resource={data}>
        <Grid
          rows={data.data?.items || []}
          id="visitor_id"
          columns={[
            {
              title: "Visitor",
              cell: (r) => (
                <>
                  <strong>{r.name}</strong>
                  <small>{r.phone}</small>
                  <small>{r.purpose}</small>
                </>
              ),
            },
            {
              title: "Visit",
              cell: (r) => (
                <>
                  {r.resident_name || "Hostel visit"}
                  <small>{r.gate_name}</small>
                  <small>Valid until {dateTime(r.expected_until)}</small>
                </>
              ),
            },
            {
              title: "Movement",
              cell: (r) => (
                <>
                  <Status value={r.status} />
                  <small>IN {dateTime(r.entry_at)}</small>
                  <small>OUT {dateTime(r.exit_at)}</small>
                </>
              ),
            },
            {
              title: "Actions",
              cell: (r) => (
                <div className="actions">
                  <Button
                    onClick={() => setAction({ type: "history", row: r })}
                  >
                    History
                  </Button>
                  {scope.manage && r.status === "pending" && (
                    <Button
                      onClick={() => setAction({ type: "approve", row: r })}
                    >
                      Approve
                    </Button>
                  )}
                  {scope.manage &&
                    ["pending", "approved"].includes(r.status) && (
                      <Button
                        onClick={() => setAction({ type: "reject", row: r })}
                      >
                        Reject
                      </Button>
                    )}
                  {r.status === "approved" && (
                    <Button
                      onClick={() => setAction({ type: "check_in", row: r })}
                    >
                      Check in
                    </Button>
                  )}
                  {r.status === "inside" && (
                    <Button
                      onClick={() => setAction({ type: "check_out", row: r })}
                    >
                      Check out
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
        />
        <Pager page={data.data} offset={offset} setOffset={setOffset} />
      </DataBoundary>
      {action?.type === "create" && (
        <FormDialog
          title="Register visitor"
          onClose={() => setAction(null)}
          onSaved={data.refresh}
          wide
          onSave={(v) =>
            hostelApi.save(hostel, "/visitors", {
              ...v,
              expected_until: iso(v.expected_until),
              resident_id: v.resident_id || null,
              person_id: v.person_id || null,
              phone: v.phone || null,
              id_type: v.id_type || null,
              id_last_four: v.id_last_four || null,
            })
          }
        >
          <Field label="Visitor name">
            <input name="name" required minLength={2} maxLength={120} />
          </Field>
          <Field label="Phone">
            <input name="phone" type="tel" maxLength={25} />
          </Field>
          <Field label="ID type">
            <input name="id_type" maxLength={30} />
          </Field>
          <Field label="ID last four characters">
            <input name="id_last_four" maxLength={4} />
          </Field>
          <GateSelect hostel={hostel} />
          <ResidentSelect hostel={hostel} optional />
          <Field label="Visit purpose">
            <textarea name="purpose" required minLength={3} maxLength={500} />
          </Field>
          <Field label="Valid until (local time)">
            <input name="expected_until" type="datetime-local" required />
          </Field>
          {scope.manage && <PersonSelect hostel={hostel} required={false} />}
        </FormDialog>
      )}
      {action && !["create", "history"].includes(action.type) && (
        <FormDialog
          title={`${label(action.type)} visitor`}
          onClose={() => setAction(null)}
          onSaved={data.refresh}
          onSave={(v) =>
            hostelApi.save(
              hostel,
              `/visitors/${action.row.visitor_id}/actions`,
              { ...v, action: action.type },
            )
          }
        >
          <p>
            {action.row.name} · {action.row.purpose}
          </p>
          <NoteField />
        </FormDialog>
      )}
      {action?.type === "history" && (
        <VisitorHistory
          hostel={hostel}
          row={action.row}
          onClose={() => setAction(null)}
        />
      )}
    </Panel>
  );
}
export function Leave({ hostel, scope }: HostelContext) {
  const [offset, setOffset] = useState(0),
    [action, setAction] = useState<{ type: string; row: Row } | null>(null),
    data = useHostelResource<Page>(hostel, `/leave${query({ offset })}`);
  return (
    <Panel
      title="Leave & return tracking"
      subtitle="Approved leave becomes active after a recorded OUT; the next IN records the actual return."
      action={
        scope.manage && (
          <Button
            variant="primary"
            onClick={() => setAction({ type: "create", row: {} })}
          >
            New leave request
          </Button>
        )
      }
    >
      <DataBoundary resource={data}>
        <Grid
          rows={data.data?.items || []}
          id="leave_id"
          columns={[
            {
              title: "Resident",
              cell: (r) => (
                <>
                  <strong>{r.name}</strong>
                  <small>{r.person_ref}</small>
                  <small>
                    {r.leave_type} · {r.reason}
                  </small>
                </>
              ),
            },
            {
              title: "Expected",
              cell: (r) => (
                <>
                  OUT {dateTime(r.expected_exit)}
                  <small>Return {dateTime(r.expected_return)}</small>
                </>
              ),
            },
            {
              title: "Actual",
              cell: (r) => (
                <>
                  OUT {dateTime(r.actual_exit)}
                  <small>Return {dateTime(r.actual_return)}</small>
                </>
              ),
            },
            { title: "Status", cell: (r) => <Status value={r.status} /> },
            {
              title: "Actions",
              cell: (r) =>
                scope.manage &&
                r.status === "pending" && (
                  <div className="actions">
                    <Button
                      onClick={() => setAction({ type: "approve", row: r })}
                    >
                      Approve
                    </Button>
                    <Button
                      onClick={() => setAction({ type: "reject", row: r })}
                    >
                      Reject
                    </Button>
                  </div>
                ),
            },
          ]}
        />
        <Pager page={data.data} offset={offset} setOffset={setOffset} />
      </DataBoundary>
      {action?.type === "create" && (
        <FormDialog
          title="New leave request"
          onClose={() => setAction(null)}
          onSaved={data.refresh}
          onSave={(v) =>
            hostelApi.save(hostel, "/leave", {
              ...v,
              expected_exit: iso(v.expected_exit),
              expected_return: iso(v.expected_return),
            })
          }
        >
          <ResidentSelect hostel={hostel} />
          <Field label="Leave type">
            <input name="leave_type" required minLength={2} maxLength={50} />
          </Field>
          <Field label="Reason">
            <textarea name="reason" required minLength={3} maxLength={500} />
          </Field>
          <Field label="Expected exit (local time)">
            <input name="expected_exit" type="datetime-local" required />
          </Field>
          <Field label="Expected return (local time)">
            <input name="expected_return" type="datetime-local" required />
          </Field>
        </FormDialog>
      )}
      {action && action.type !== "create" && (
        <FormDialog
          title={`${label(action.type)} leave`}
          onClose={() => setAction(null)}
          onSaved={data.refresh}
          onSave={(v) =>
            hostelApi.save(hostel, `/leave/${action.row.leave_id}/decision`, {
              ...v,
              action: action.type,
            })
          }
        >
          <p>
            {action.row.name} · {dateTime(action.row.expected_exit)} to{" "}
            {dateTime(action.row.expected_return)}
          </p>
          <NoteField />
        </FormDialog>
      )}
    </Panel>
  );
}
export function Reports({ hostel }: HostelContext) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Panel
      title="Movement report"
      subtitle="Export up to 10,000 gate records per date range as CSV."
    >
      <form
        className="hostel-padding"
        onSubmit={async (e) => {
          e.preventDefault();
          const v = Object.fromEntries(new FormData(e.currentTarget));
          setError("");
          setBusy(true);
          try {
            const blob = await request<Blob>(
              path(
                hostel,
                `/reports/entries.csv${query({ since: iso(v.since), until: iso(v.until) })}`,
              ),
              { binary: true },
            );
            download(
              blob,
              `hostel-movements-${String(v.since).slice(0, 10)}.csv`,
            );
          } catch (e) {
            setError(messageOf(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <ErrorBox message={error} />
        <div className="form-grid">
          <Field label="From (local time)">
            <input name="since" type="datetime-local" required />
          </Field>
          <Field label="Until, exclusive (local time)">
            <input name="until" type="datetime-local" required />
          </Field>
        </div>
        <Button disabled={busy} variant="primary">
          {busy ? "Exporting…" : "Download CSV"}
        </Button>
      </form>
    </Panel>
  );
}
