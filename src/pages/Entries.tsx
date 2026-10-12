import { useEffect, useState } from "react";
import {
  ArrowRight,
  Download,
  ImageOff,
  Radio,
  Search as SearchIcon,
  ShieldCheck,
  UserCheck,
  Users,
  Video,
} from "lucide-react";
import { api, type Row, messageOf } from "../lib/api";
import { useDebounce, useResource } from "../lib/hooks";
import {
  dateTime,
  download,
  duration,
  reference,
  userName,
} from "../lib/domain";
import { useAuth, useLive } from "../state";
import {
  Avatar,
  Badge,
  Button,
  Empty,
  ErrorBox,
  Loading,
  Metric,
  PageTitle,
  Panel,
  Refresh,
  SearchBox,
  Status,
} from "../components/ui";
import { SubjectModal } from "../components/SubjectModal";
function EntryDetail({ entry, onOpen }: { entry: Row; onOpen: () => void }) {
  const ref = reference(entry);
  const profile = useResource<Row>(
    (s) =>
      entry.reference_image_key ? api.subject(ref, s) : Promise.resolve({}),
    `entry-image-${ref}`,
  );
  const [imageError, setImageError] = useState(false);
  useEffect(() => setImageError(false), [ref, profile.data?.image_url]);
  return (
    <Panel title="Selected person">
      <div className="entry-detail">
        <div className="entry-photo">
          {profile.data?.image_url && !imageError ? (
            <img
              alt="Subject reference"
              src={profile.data.image_url}
              onError={() => setImageError(true)}
              referrerPolicy="no-referrer"
            />
          ) : profile.loading ? (
            <Loading />
          ) : (
            <Empty
              icon={ImageOff}
              title={
                imageError || profile.error
                  ? "Image unavailable"
                  : "No reference image"
              }
            />
          )}
        </div>
        <h3>{userName(entry)}</h3>
        <p className="muted small">
          {ref} · {entry.branch || "Branch not recorded"}
        </p>
        <Status value={entry.auth_status || "auto"} />
        <dl className="details-list">
          <dt>Visits</dt>
          <dd>{entry.visit_count ?? 0}</dd>
          <dt>First entry</dt>
          <dd>{dateTime(entry.first_entry)}</dd>
          <dt>Last entry</dt>
          <dd>{dateTime(entry.last_entry)}</dd>
          <dt>Last camera</dt>
          <dd>{entry.last_camera || "—"}</dd>
          <dt>Time on camera</dt>
          <dd>{duration(entry.total_seconds)}</dd>
          <dt>Profile recorded</dt>
          <dd>{entry.has_profile_flag ? "Yes" : "No"}</dd>
        </dl>
        <Button variant="primary full" onClick={onOpen}>
          Open profile
          <ArrowRight size={16} />
        </Button>
      </div>
    </Panel>
  );
}
export function Entries() {
  const { isAdmin, notice } = useAuth();
  const { eventVersion, socketState } = useLive();
  const [preset, setPreset] = useState("today"),
    [status, setStatus] = useState(""),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState(""),
    [profile, setProfile] = useState(""),
    [exporting, setExporting] = useState(false),
    [exportError, setExportError] = useState("");
  const debounced = useDebounce(search);
  const filters = { preset, status, search: debounced };
  const data = useResource<Row>(
    (s) => api.entries(filters, s),
    JSON.stringify(filters),
    10000,
  );
  useEffect(() => {
    if (eventVersion) data.refresh();
  }, [eventVersion]);
  const entries: Row[] = data.data?.entries || [],
    summary = data.data?.summary;
  const current = entries.find((row) => reference(row) === selected);
  async function exportFile() {
    if (exporting) return;
    setExporting(true);
    setExportError("");
    try {
      const blob = await api.exportEntries(filters);
      download(
        blob,
        `sentinel-entries-${preset}-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
      notice("Entry log downloaded.", "success");
    } catch (err) {
      setExportError(messageOf(err));
    } finally {
      setExporting(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="RECORDS / ENTRY LOG"
        title="Every entry, accounted for."
        description="One record per person, with visit counts and their latest camera activity."
      >
        <Refresh onClick={data.refresh} loading={data.loading} />
        {isAdmin && (
          <Button variant="primary" onClick={exportFile} disabled={exporting}>
            <Download size={16} />
            {exporting ? "Preparing Excel…" : "Export Excel"}
          </Button>
        )}
      </PageTitle>
      <div className="entry-metrics metrics">
        <Metric
          label="People seen"
          value={summary?.subjects ?? "—"}
          detail="In the selected period"
          icon={Users}
        />
        <Metric
          label="Total visits"
          value={summary?.visits ?? "—"}
          detail="All recorded visits"
          icon={UserCheck}
          tone="purple"
        />
        <Metric
          label="Authorized"
          value={summary?.authorised ?? "—"}
          detail="Enrolled identities"
          icon={ShieldCheck}
          tone="green"
        />
        <Metric
          label="Unauthorized"
          value={summary?.unauthorised ?? "—"}
          detail="Unknown or blacklisted"
          icon={SearchIcon}
          tone="amber"
        />
        <Metric
          label="On camera now"
          value={summary?.on_camera_now ?? "—"}
          detail="Currently in view"
          icon={Video}
        />
      </div>
      <ErrorBox message={exportError} />
      <div className={`entries-layout ${current ? "with-detail" : ""}`}>
        <Panel
          title="Entry register"
          action={
            <Badge tone={socketState === "Live" ? "green" : "amber"}>
              {socketState}
            </Badge>
          }
        >
          <div className="filters">
            <SearchBox
              value={search}
              onChange={setSearch}
              placeholder="Search name, roll number, or branch…"
            />
            <select
              aria-label="Entry period"
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
            >
              {[
                ["today", "Today"],
                ["yesterday", "Yesterday"],
                ["week", "Last 7 days"],
                ["month", "Last 30 days"],
                ["all", "All time"],
              ].map(([v, l]) => (
                <option value={v} key={v}>
                  {l}
                </option>
              ))}
            </select>
            <select
              aria-label="Entry status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All people</option>
              <option value="authorised">Authorized only</option>
              <option value="unauthorised">Unauthorized only</option>
              <option value="blacklisted">Blacklisted only</option>
            </select>
          </div>
          <ErrorBox message={data.error} retry={data.refresh} />
          {data.loading && !data.data ? (
            <Loading />
          ) : (
            <div className="table-wrap">
              <table className="entries-table">
                <thead>
                  <tr>
                    {[
                      "Person / reference",
                      "Branch",
                      "Status",
                      "Visits",
                      "First entry",
                      "Last entry",
                      "Last camera",
                      "Time on camera",
                      "Profile",
                    ].map((t) => (
                      <th key={t}>{t}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((row, i) => (
                    <tr
                      key={reference(row) || i}
                      className={selected === reference(row) ? "selected" : ""}
                      onDoubleClick={() => setProfile(reference(row))}
                    >
                      <td>
                        <button
                          className="table-person"
                          onClick={() => setSelected(reference(row))}
                        >
                          <Avatar name={userName(row)} />
                          <span>
                            <strong>{userName(row)}</strong>
                            <small>
                              {row.on_camera_now && <i className="live-dot" />}
                              {reference(row)}
                            </small>
                          </span>
                        </button>
                      </td>
                      <td>{row.branch || "—"}</td>
                      <td>
                        <Status value={row.auth_status || "auto"} />
                      </td>
                      <td>{row.visit_count ?? 0}</td>
                      <td>{dateTime(row.first_entry)}</td>
                      <td>{dateTime(row.last_entry)}</td>
                      <td>{row.last_camera || "—"}</td>
                      <td>{duration(row.total_seconds)}</td>
                      <td>
                        <button
                          className="text-link"
                          onClick={() => setProfile(reference(row))}
                        >
                          {row.has_profile_flag ? "View" : "Add details"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!entries.length && (
                <Empty
                  title={
                    data.error ? "Entry log unavailable" : "No entries found"
                  }
                  detail="Try another period or clear the filters."
                />
              )}
            </div>
          )}
          <footer className="table-footer">
            <span>
              {entries.length} people
              {entries.length === 500
                ? " · showing the first 500; narrow your search or export the full period"
                : ""}
            </span>
            <span>
              <Radio size={13} /> Updates automatically ·{" "}
              {data.updated?.toLocaleTimeString() || "Waiting"}
            </span>
          </footer>
        </Panel>
        {current && (
          <EntryDetail
            entry={current}
            onOpen={() => setProfile(reference(current))}
          />
        )}
      </div>
      {profile && (
        <SubjectModal
          reference={profile}
          onClose={() => setProfile("")}
          onSaved={data.refresh}
        />
      )}
    </>
  );
}
export function Subjects() {
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [selected, setSelected] = useState("");
  const debounced = useDebounce(search);
  const data = useResource(
    (s) => api.subjects({ search: debounced, auth_status: status }, s),
    `subjects-${debounced}-${status}`,
  );
  return (
    <>
      <PageTitle
        eyebrow="RECORDS / SUBJECTS"
        title="People directory"
        description="Monitored subjects and their recorded details, separate from system accounts."
      >
        <Refresh onClick={data.refresh} loading={data.loading} />
      </PageTitle>
      <Panel title="Subject records">
        <div className="filters">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search subjects…"
          />
          <select
            aria-label="Subject status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="enrolled">Authorized</option>
            <option value="auto">Unauthorized</option>
            <option value="blacklisted">Blacklisted</option>
          </select>
        </div>
        <ErrorBox message={data.error} retry={data.refresh} />
        {data.loading && !data.data ? (
          <Loading />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Reference</th>
                  <th>Branch</th>
                  <th>Status</th>
                  <th>Last seen</th>
                  <th>Visits</th>
                </tr>
              </thead>
              <tbody>
                {(data.data || []).map((row) => (
                  <tr key={row.person_id || reference(row)}>
                    <td>
                      <button
                        className="table-person"
                        onClick={() => setSelected(reference(row))}
                      >
                        <Avatar name={userName(row)} />
                        <strong>{userName(row)}</strong>
                      </button>
                    </td>
                    <td className="mono">{reference(row)}</td>
                    <td>{row.branch || "—"}</td>
                    <td>
                      <Status value={row.auth_status || "auto"} />
                    </td>
                    <td>{dateTime(row.last_seen_at)}</td>
                    <td>{row.sighting_count ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.data?.length && (
              <Empty
                title={
                  data.error
                    ? "Subject records unavailable"
                    : "No subjects found"
                }
              />
            )}
          </div>
        )}
      </Panel>
      {selected && (
        <SubjectModal
          reference={selected}
          onClose={() => setSelected("")}
          onSaved={data.refresh}
        />
      )}
    </>
  );
}
