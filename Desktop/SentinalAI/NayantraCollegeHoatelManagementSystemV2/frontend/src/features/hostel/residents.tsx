import { useState } from "react";
import {
  Button,
  Empty,
  Field,
  Modal,
  Panel,
  SearchBox,
} from "../../components/ui";
import { useResource } from "../../lib/hooks";
import type { Row } from "../../lib/api";
import type { HostelContext } from "../../pages/Hostels";
import { dateTime, hostelApi, query, type Page } from "./api";
import {
  DataBoundary,
  FormDialog,
  Grid,
  NoteField,
  Pager,
  SelectField,
  Status,
  useHostelResource,
} from "./common";
export function PersonSelect({
  hostel,
  availableOnly = false,
  required = true,
}: {
  hostel: string;
  availableOnly?: boolean;
  required?: boolean;
}) {
  const [q, setQ] = useState(""),
    r = useHostelResource<Row[]>(
      hostel,
      `/resident-candidates${query({ q })}`,
      0,
    );
  return (
    <div>
      <Field label="Find enrolled person">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name or roll number"
        />
      </Field>
      <DataBoundary resource={r}>
        <SelectField
          label="Shared identity"
          name="person_id"
          required={required}
          placeholder={
            required ? "Select enrolled person" : "No linked face identity"
          }
          options={(r.data || [])
            .filter((x) => !availableOnly || !x.assigned_hostel_id)
            .map((x) => ({
              value: x.person_id,
              label: `${x.name || x.external_reference} · ${x.external_reference}`,
            }))}
        />
      </DataBoundary>
    </div>
  );
}
function AllocationForm({
  hostel,
  scope,
  row,
  transfer,
  onClose,
  onSaved,
}: HostelContext & {
  row: Row;
  transfer: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [destination, setDestination] = useState(hostel),
    hostels = useResource((s) => hostelApi.list(s), "transfer-hostels", 0),
    rooms = useHostelResource<Row[]>(destination, "/rooms", 0);
  return (
    <FormDialog
      title={transfer ? "Transfer resident" : "Allocate / change bed"}
      onClose={onClose}
      onSaved={onSaved}
      onSave={(v) =>
        hostelApi.save(
          hostel,
          `/residents/${row.resident_id}/${transfer ? "transfer" : "allocation"}`,
          {
            bed_id: v.bed_id,
            reason: v.note,
            ...(transfer ? { destination_hostel_id: destination } : {}),
          },
        )
      }
    >
      {transfer && scope.admin && (
        <SelectField
          name="destination"
          label="Destination hostel"
          value={destination}
          onChange={setDestination}
          required
          options={(hostels.data || [])
            .filter((h) => h.is_active)
            .map((h) => ({ value: h.hostel_id, label: h.name }))}
        />
      )}
      <DataBoundary resource={rooms}>
        <SelectField
          name="bed_id"
          label="Available bed"
          required
          options={(rooms.data || [])
            .filter((r) => r.status === "active")
            .flatMap((r) =>
              r.beds
                .filter((b: Row) => b.is_active && !b.resident_id)
                .map((b: Row) => ({
                  value: b.bed_id,
                  label: `Floor ${r.floor_number} · Room ${r.room_number} · ${b.label}`,
                })),
            )}
        />
      </DataBoundary>
      <NoteField />
    </FormDialog>
  );
}
function History({
  hostel,
  row,
  onClose,
}: {
  hostel: string;
  row: Row;
  onClose: () => void;
}) {
  const data = useHostelResource<Row[]>(
    hostel,
    `/residents/${row.resident_id}/allocations`,
    0,
  );
  return (
    <Modal title={`${row.name} · allocation history`} onClose={onClose} wide>
      <DataBoundary resource={data}>
        <Grid
          rows={data.data || []}
          id="allocation_id"
          columns={[
            {
              title: "Room / bed",
              cell: (r) => `${r.room_number} · ${r.bed_label}`,
            },
            { title: "Assigned", cell: (r) => dateTime(r.assigned_at) },
            {
              title: "Released",
              cell: (r) =>
                r.released_at ? dateTime(r.released_at) : "Current",
            },
            { title: "Reason", cell: (r) => r.release_reason || r.reason },
          ]}
        />
      </DataBoundary>
    </Modal>
  );
}
export function Residents({ hostel, scope }: HostelContext) {
  const [q, setQ] = useState(""),
    [presence, setPresence] = useState(""),
    [room, setRoom] = useState(""),
    [floor, setFloor] = useState(""),
    [history, setHistory] = useState(false),
    [offset, setOffset] = useState(0),
    [action, setAction] = useState<{ type: string; row: Row } | null>(null);
  const data = useHostelResource<Page>(
      hostel,
      `/residents${query({ q, state: presence, room, floor, history, offset })}`,
    ),
    reset = (f: () => void) => {
      f();
      setOffset(0);
    };
  return (
    <Panel
      title="Resident directory"
      subtitle="Shared student profiles, bed allocation and confirmed presence."
      action={
        scope.manage && (
          <Button
            variant="primary"
            onClick={() => setAction({ type: "add", row: {} })}
          >
            Add resident
          </Button>
        )
      }
    >
      <div className="hostel-toolbar">
        <SearchBox
          value={q}
          onChange={(v) => reset(() => setQ(v))}
          placeholder="Search name, roll or room"
        />
        <SelectField
          name="presence"
          label="Presence"
          value={presence}
          onChange={(v) => reset(() => setPresence(v))}
          placeholder="All states"
          options={["inside", "outside", "unknown"].map((value) => ({
            value,
            label: value,
          }))}
        />
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
        <label>
          <input
            type="checkbox"
            checked={history}
            onChange={(e) => reset(() => setHistory(e.target.checked))}
          />
          Include released residents
        </label>
      </div>
      <DataBoundary resource={data}>
        <Grid
          rows={data.data?.items || []}
          id="resident_id"
          columns={[
            {
              title: "Resident",
              cell: (r) => (
                <>
                  <strong>{r.name}</strong>
                  <small>
                    {r.person_ref} · {r.branch || "—"}
                  </small>
                  <small>
                    {r.course || "Course not set"} · Year{" "}
                    {r.year_of_study || "—"} {r.section || ""}
                  </small>
                </>
              ),
            },
            {
              title: "Room / bed",
              cell: (r) =>
                r.bed_id ? `${r.room_number} · ${r.bed_label}` : "Unallocated",
            },
            {
              title: "Presence",
              cell: (r) => (
                <>
                  <Status value={r.presence} />
                  <small>Last IN {dateTime(r.last_in_at)}</small>
                  <small>Last OUT {dateTime(r.last_out_at)}</small>
                </>
              ),
            },
            {
              title: "Membership",
              cell: (r) => (
                <>
                  <Status value={r.status} />
                  <small>
                    {r.is_authorized ? "Access permitted" : "Access suspended"}
                  </small>
                </>
              ),
            },
            ...(scope.manage
              ? [
                  {
                    title: "Contact",
                    cell: (r: Row) => (
                      <>
                        {r.phone || "—"}
                        <small>
                          {r.guardian_name} {r.guardian_phone}
                        </small>
                        <small>{r.emergency_contact}</small>
                      </>
                    ),
                  },
                ]
              : []),
            {
              title: "Actions",
              cell: (r) => (
                <div className="actions">
                  <Button
                    onClick={() => setAction({ type: "history", row: r })}
                  >
                    History
                  </Button>
                  {scope.manage && !r.released_at && (
                    <>
                      <Button
                        onClick={() => setAction({ type: "edit", row: r })}
                      >
                        Edit
                      </Button>
                      <Button
                        onClick={() => setAction({ type: "allocate", row: r })}
                      >
                        Allocate bed
                      </Button>
                      {scope.admin && (
                        <Button
                          onClick={() =>
                            setAction({ type: "transfer", row: r })
                          }
                        >
                          Transfer hostel
                        </Button>
                      )}
                      <Button
                        onClick={() => setAction({ type: "release", row: r })}
                      >
                        Release
                      </Button>
                    </>
                  )}
                </div>
              ),
            },
          ]}
        />
        <Pager page={data.data} offset={offset} setOffset={setOffset} />
      </DataBoundary>
      {action && ["add", "edit"].includes(action.type) && (
        <FormDialog
          title={
            action.type === "add" ? "Add resident" : "Edit resident membership"
          }
          onClose={() => setAction(null)}
          onSaved={data.refresh}
          onSave={(v) =>
            hostelApi.save(
              hostel,
              action.type === "add"
                ? "/residents"
                : `/residents/${action.row.resident_id}`,
              {
                ...v,
                is_authorized: v.is_authorized === "true",
                emergency_contact: v.emergency_contact || null,
                section: v.section || null,
              },
              action.type === "add" ? "POST" : "PATCH",
            )
          }
        >
          {action.type === "add" && (
            <PersonSelect hostel={hostel} availableOnly />
          )}
          <Field label="Section">
            <input
              name="section"
              maxLength={30}
              defaultValue={action.row.section}
            />
          </Field>
          <Field label="Emergency contact">
            <input
              name="emergency_contact"
              maxLength={100}
              defaultValue={action.row.emergency_contact}
            />
          </Field>
          <Field label="Hostel authorization">
            <select
              name="is_authorized"
              defaultValue={String(action.row.is_authorized ?? true)}
            >
              <option value="true">Authorized</option>
              <option value="false">Suspended access</option>
            </select>
          </Field>
          {action.type === "edit" && (
            <Field label="Membership status">
              <select name="status" defaultValue={action.row.status}>
                <option>active</option>
                <option>suspended</option>
              </select>
            </Field>
          )}
        </FormDialog>
      )}
      {action && ["allocate", "transfer"].includes(action.type) && (
        <AllocationForm
          hostel={hostel}
          scope={scope}
          row={action.row}
          transfer={action.type === "transfer"}
          onClose={() => setAction(null)}
          onSaved={data.refresh}
        />
      )}
      {action?.type === "release" && (
        <FormDialog
          title={`Release ${action.row.name}`}
          onClose={() => setAction(null)}
          onSaved={data.refresh}
          onSave={(v) =>
            hostelApi.save(
              hostel,
              `/residents/${action.row.resident_id}/release`,
              v,
            )
          }
        >
          <p>
            Releases the current bed and membership. Existing records remain in
            history.
          </p>
          <NoteField />
        </FormDialog>
      )}
      {action?.type === "history" && (
        <History
          hostel={hostel}
          row={action.row}
          onClose={() => setAction(null)}
        />
      )}
    </Panel>
  );
}
export function Rooms({ hostel, scope }: HostelContext) {
  const data = useHostelResource<Row[]>(hostel, "/rooms"),
    [edit, setEdit] = useState<Row | null>(null),
    [floor, setFloor] = useState(""),
    [status, setStatus] = useState(""),
    rows = (data.data || []).filter(
      (r) =>
        (floor === "" || String(r.floor_number) === floor) &&
        (!status || r.occupancy_status === status),
    );
  return (
    <>
      <Panel
        title="Rooms & beds"
        subtitle="Capacity limits and active allocations are enforced by the server."
        action={
          scope.manage && (
            <Button variant="primary" onClick={() => setEdit({})}>
              Add room
            </Button>
          )
        }
      >
        <div className="hostel-toolbar">
          <Field label="Floor">
            <input
              type="number"
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
            />
          </Field>
          <SelectField
            name="status"
            label="Occupancy"
            value={status}
            onChange={setStatus}
            placeholder="All rooms"
            options={[
              "available",
              "partially_occupied",
              "full",
              "maintenance",
              "disabled",
            ].map((value) => ({ value, label: value.replaceAll("_", " ") }))}
          />
        </div>
        <DataBoundary resource={data}>
          <div className="hostel-cards hostel-padding">
            {rows.map((r) => (
              <article key={r.room_id} className="hostel-room">
                <header>
                  <h3>Room {r.room_number}</h3>
                  <Status value={r.occupancy_status} />
                </header>
                <p>
                  Floor {r.floor_number} · {r.room_type} · {r.occupied}/
                  {r.capacity} occupied
                </p>
                <div className="hostel-beds">
                  {r.beds
                    .filter((b: Row) => b.is_active)
                    .map((b: Row) => (
                      <div
                        key={b.bed_id}
                        className={b.resident_id ? "occupied" : ""}
                      >
                        <strong>{b.label}</strong>
                        <span>{b.resident_name || "Available"}</span>
                        {b.resident_id && <Status value={b.presence} />}
                      </div>
                    ))}
                </div>
                {scope.manage && (
                  <Button onClick={() => setEdit(r)}>Edit room</Button>
                )}
              </article>
            ))}
          </div>
          {!rows.length && <Empty title="No matching rooms" />}
        </DataBoundary>
      </Panel>
      {edit && (
        <FormDialog
          title={edit.room_id ? "Edit room" : "Add room"}
          onClose={() => setEdit(null)}
          onSaved={data.refresh}
          onSave={(v) =>
            hostelApi.save(
              hostel,
              edit.room_id ? `/rooms/${edit.room_id}` : "/rooms",
              {
                ...v,
                capacity: Number(v.capacity),
                floor_number: Number(v.floor_number),
              },
              edit.room_id ? "PUT" : "POST",
            )
          }
        >
          <Field label="Room number">
            <input
              name="room_number"
              required
              maxLength={30}
              defaultValue={edit.room_number}
            />
          </Field>
          <Field label="Floor number">
            <input
              name="floor_number"
              type="number"
              required
              min={-5}
              max={100}
              defaultValue={edit.floor_number ?? 0}
            />
          </Field>
          <Field label="Bed capacity">
            <input
              name="capacity"
              type="number"
              required
              min={1}
              max={100}
              defaultValue={edit.capacity ?? 2}
            />
          </Field>
          <Field label="Room type">
            <input
              name="room_type"
              required
              maxLength={60}
              defaultValue={edit.room_type || "standard"}
            />
          </Field>
          <Field label="Room status">
            <select name="status" defaultValue={edit.status || "active"}>
              <option>active</option>
              <option>maintenance</option>
              <option>disabled</option>
            </select>
          </Field>
        </FormDialog>
      )}
    </>
  );
}
