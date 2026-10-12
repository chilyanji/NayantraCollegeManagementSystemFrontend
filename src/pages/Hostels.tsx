import { useState, type ReactNode } from "react";
import { Link, NavLink, useParams } from "react-router-dom";
import {
  BedDouble,
  Building2,
  DoorOpen,
  ShieldAlert,
  Users,
  Volume2,
  RefreshCw,
} from "lucide-react";
import { useAuth, useLive } from "../state";
import { useResource } from "../lib/hooks";
import { request, type Row } from "../lib/api";
import {
  Button,
  Empty,
  Field,
  Metric,
  PageTitle,
  Panel,
  SearchBox,
} from "../components/ui";
import { hostelApi, type Scope } from "../features/hostel/api";
import {
  DataBoundary,
  FormDialog,
  Status,
  useHostelResource,
} from "../features/hostel/common";
import { useHostelLive } from "../features/hostel/state";
import { Residents, Rooms } from "../features/hostel/residents";
import {
  Alerts,
  Entries,
  Evidence,
  GateMonitor,
  Leave,
  Reports,
  Visitors,
} from "../features/hostel/operations";
import { GateSetup, Policies, Staff } from "../features/hostel/setup";
export type HostelContext = { hostel: string; scope: Scope };
function HostelForm({
  item,
  onClose,
  onSaved,
}: {
  item: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <FormDialog
      title={item.hostel_id ? "Edit hostel" : "Create hostel"}
      onClose={onClose}
      onSaved={onSaved}
      onSave={(v) =>
        request(item.hostel_id ? `/hostels/${item.hostel_id}` : "/hostels", {
          method: item.hostel_id ? "PUT" : "POST",
          body: {
            ...v,
            is_active: v.is_active === "true",
            location: v.location || null,
          },
        })
      }
    >
      <Field label="Hostel code">
        <input
          name="code"
          required
          pattern="[A-Za-z0-9_-]+"
          minLength={2}
          maxLength={30}
          defaultValue={item.code}
        />
      </Field>
      <Field label="Hostel name">
        <input name="name" required maxLength={120} defaultValue={item.name} />
      </Field>
      <Field label="Type">
        <select name="hostel_type" defaultValue={item.hostel_type || "other"}>
          {["boys", "girls", "staff", "guest", "other"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </Field>
      <Field label="Location">
        <input name="location" maxLength={200} defaultValue={item.location} />
      </Field>
      <Field label="Status">
        <select name="is_active" defaultValue={String(item.is_active ?? true)}>
          <option value="true">Active</option>
          <option value="false">Disabled</option>
        </select>
      </Field>
    </FormDialog>
  );
}
export function Hostels() {
  const { isAdmin } = useAuth(),
    [edit, setEdit] = useState<Row | null>(null),
    [q, setQ] = useState(""),
    list = useResource((s) => hostelApi.list(s), "hostel-registry", 30000);
  return (
    <>
      <PageTitle
        eyebrow="NAYANTRA / HOSTEL MANAGEMENT"
        title="Hostels"
        description={
          isAdmin
            ? "Manage hostel capacity, residents, gate access and staff assignments."
            : "Open your assigned hostel to monitor gates and daily activity."
        }
      >
        {isAdmin && (
          <Button variant="primary" onClick={() => setEdit({})}>
            Create hostel
          </Button>
        )}
        <Button onClick={list.refresh}>
          <RefreshCw size={16} />
          Refresh
        </Button>
      </PageTitle>
      <DataBoundary resource={list}>
        {list.data && (
          <div className="metrics">
            <Metric
              label="Hostels"
              value={list.data.length}
              detail="Visible to your account"
              icon={Building2}
            />
            <Metric
              label="Residents"
              value={list.data.reduce(
                (n, h) => n + Number(h.residents || 0),
                0,
              )}
              detail="Current hostel memberships"
              icon={Users}
            />
            <Metric
              label="Available beds"
              value={list.data.reduce(
                (n, h) =>
                  n +
                  Math.max(
                    0,
                    Number(h.capacity || 0) - Number(h.occupied_beds || 0),
                  ),
                0,
              )}
              detail="Across active rooms"
              icon={BedDouble}
            />
            <Metric
              label="Staff assignments"
              value={list.data.reduce(
                (n, h) => n + Number(h.wardens || 0) + Number(h.guards || 0),
                0,
              )}
              detail="Active wardens and guards"
              icon={ShieldAlert}
            />
          </div>
        )}
        <div className="hostel-toolbar">
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder="Find hostel by name, code or location"
          />
        </div>
        <div className="hostel-cards">
          {list.data
            ?.filter((h) =>
              `${h.name} ${h.code} ${h.location || ""}`
                .toLowerCase()
                .includes(q.toLowerCase()),
            )
            .map((h) => (
              <Panel key={h.hostel_id}>
                <div className="hostel-card">
                  <Building2 size={28} />
                  <div>
                    <Status value={h.is_active ? "active" : "disabled"} />
                    <h2>
                      <Link to={`/hostels/${h.hostel_id}`}>{h.name}</Link>
                    </h2>
                    <p>
                      {h.code} · {h.hostel_type} ·{" "}
                      {h.location || "Location not set"}
                    </p>
                    <p>
                      {h.residents} residents · {h.capacity || 0} beds ·{" "}
                      {h.wardens || 0} wardens · {h.guards || 0} guards
                    </p>
                  </div>
                  <div className="actions">
                    <Link
                      className="button primary"
                      to={`/hostels/${h.hostel_id}`}
                    >
                      Open hostel
                    </Link>
                    {isAdmin && (
                      <Button onClick={() => setEdit(h)}>Edit</Button>
                    )}
                  </div>
                </div>
              </Panel>
            ))}
        </div>
        {!list.data?.length && (
          <Empty
            title={isAdmin ? "Create your first hostel" : "No hostel assigned"}
            detail={
              isAdmin
                ? "Add rooms, assign staff and configure gate zones."
                : "Ask your administrator to assign your account to a hostel or gate."
            }
          />
        )}
      </DataBoundary>
      {edit && (
        <HostelForm
          item={edit}
          onClose={() => setEdit(null)}
          onSaved={list.refresh}
        />
      )}
    </>
  );
}
export function HostelWorkspace() {
  const { hostelId = "", section } = useParams();
  return <Workspace key={hostelId} hostel={hostelId} section={section} />;
}
function Workspace({ hostel, section }: { hostel: string; section?: string }) {
  const info = useHostelResource<Scope>(hostel, "", 15000),
    { socketState } = useLive(),
    { audioEnabled, enableAudio } = useHostelLive(),
    scope = info.data,
    current = section || (scope?.guard ? "monitor" : "overview");
  const links = [
    ["overview", "Overview"],
    ["monitor", "Gate monitor"],
    ["residents", "Residents"],
    ["rooms", "Rooms & beds"],
    ["entries", "Entry / exit log"],
    ["alerts", "Alerts"],
    ["evidence", "Evidence"],
    ["visitors", "Visitors"],
    ["leave", "Leave"],
    ...(scope?.manage
      ? [
          ["staff", "Staff"],
          ["gates", "Gates & cameras"],
          ["policies", "Policies"],
          ["reports", "Reports"],
        ]
      : []),
  ];
  let content: ReactNode = null;
  if (scope) {
    const p = { hostel, scope };
    switch (current) {
      case "overview":
        content = <Overview {...p} />;
        break;
      case "monitor":
        content = <GateMonitor {...p} />;
        break;
      case "residents":
        content = <Residents {...p} />;
        break;
      case "rooms":
        content = <Rooms {...p} />;
        break;
      case "entries":
        content = <Entries {...p} />;
        break;
      case "alerts":
        content = <Alerts {...p} />;
        break;
      case "evidence":
        content = <Evidence {...p} />;
        break;
      case "visitors":
        content = <Visitors {...p} />;
        break;
      case "leave":
        content = <Leave {...p} />;
        break;
      case "staff":
        content = scope.manage ? <Staff {...p} /> : null;
        break;
      case "gates":
        content = scope.manage ? <GateSetup {...p} /> : null;
        break;
      case "policies":
        content = scope.manage ? <Policies {...p} /> : null;
        break;
      case "reports":
        content = scope.manage ? <Reports {...p} /> : null;
        break;
    }
  }
  return (
    <div className="hostel-workspace">
      <Link to="/hostels" className="muted">
        ← All assigned hostels
      </Link>
      <PageTitle
        eyebrow="NAYANTRA / HOSTEL MANAGEMENT"
        title={scope?.hostel.name || "Hostel workspace"}
        description={
          scope?.guard
            ? "Gate operations · limited to your assigned hostel and gates."
            : "Residents, occupancy and gate security in one workspace."
        }
      >
        <span
          className={`hostel-connection ${socketState === "Live" ? "online" : ""}`}
          role="status"
        >
          {socketState === "Live"
            ? "Live updates"
            : "Live updates disconnected · polling records"}
        </span>
        <Button disabled={audioEnabled} onClick={enableAudio}>
          <Volume2 size={16} />
          {audioEnabled ? "Alert sound enabled" : "Enable alert sound"}
        </Button>
      </PageTitle>
      <DataBoundary resource={info}>
        {scope && (
          <>
            <nav className="hostel-tabs" aria-label="Hostel sections">
              {links.map(([route, title]) => (
                <NavLink
                  key={route}
                  to={`/hostels/${hostel}/${route}`}
                  className={current === route ? "active" : ""}
                >
                  {title}
                </NavLink>
              ))}
            </nav>
            <div key={current}>
              {content || (
                <Empty
                  title="Page unavailable"
                  detail="Choose an available section for your role."
                />
              )}
            </div>
          </>
        )}
      </DataBoundary>
    </div>
  );
}
function Overview({ hostel }: HostelContext) {
  const data = useHostelResource(hostel, "/summary", 15000),
    s = data.data;
  return (
    <DataBoundary resource={data}>
      {s && (
        <>
          <div className="metrics">
            <Metric
              label="Residents inside"
              value={s.inside}
              detail={`${s.outside} outside · ${s.unknown} unknown`}
              icon={Users}
              tone="green"
            />
            <Metric
              label="Occupied beds"
              value={`${s.occupied_beds} / ${s.capacity}`}
              detail={`${s.available_beds} available beds`}
              icon={BedDouble}
            />
            <Metric
              label="Active alerts"
              value={s.active_alerts}
              detail="Open, acknowledged or investigating"
              icon={ShieldAlert}
              tone="red"
            />
            <Metric
              label="Visitors inside"
              value={s.visitors_inside}
              detail="Approved visits checked in"
              icon={DoorOpen}
            />
          </div>
          <div className="hostel-two-column">
            <Panel
              title="Room occupancy"
              subtitle={`${s.total_rooms} active rooms · ${s.rooms_full} full · ${s.rooms_available} with available beds`}
            >
              <div className="hostel-padding">
                {s.floors.length ? (
                  s.floors.map((f: Row) => (
                    <div className="hostel-floor" key={f.number}>
                      <span>Floor {f.number}</span>
                      <progress value={f.occupied} max={f.capacity || 1} />
                      <strong>
                        {f.occupied} / {f.capacity}
                      </strong>
                    </div>
                  ))
                ) : (
                  <Empty title="No rooms configured" />
                )}
              </div>
            </Panel>
            <Panel title="Presence comes from confirmed gate crossings">
              <div className="hostel-padding">
                <p>
                  Outside → inside records IN. The reverse movement records OUT.
                </p>
                <p>
                  Unknown means no confirmed movement has been recorded.
                  Disappearing from a camera does not mark a person outside.
                </p>
                <Link className="button" to={`/hostels/${hostel}/entries`}>
                  View movement history
                </Link>
              </div>
            </Panel>
          </div>
        </>
      )}
    </DataBoundary>
  );
}
