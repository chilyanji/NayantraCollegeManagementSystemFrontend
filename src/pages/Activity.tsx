import { useState } from "react";
import { Activity as ActivityIcon, Radio } from "lucide-react";
import { asList, request, type Row } from "../lib/api";
import { useResource } from "../lib/hooks";
import { dateTime, displayText } from "../lib/domain";
import { useLive, useAuth } from "../state";
import {
  Badge,
  Button,
  Empty,
  ErrorBox,
  Loading,
  PageTitle,
  Panel,
  Refresh,
  SearchBox,
} from "../components/ui";
export function ActivityPage() {
  const { events, socketState, clearEvents } = useLive();
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState("live"),
    [search, setSearch] = useState(""),
    [severity, setSeverity] = useState("");
  const endpoint =
    tab === "audit"
      ? import.meta.env.VITE_ACTIVITY_PATH
      : tab === "history"
        ? import.meta.env.VITE_EVENTS_PATH
        : "";
  const history = useResource(
    async (s) =>
      endpoint
        ? asList(
            await request(endpoint, { signal: s }),
            tab === "audit" ? "activity" : "events",
          )
        : [],
    `history-${tab}-${endpoint}`,
    endpoint ? 30000 : 0,
  );
  const rows = (tab === "live" ? events : history.data || []).filter(
    (row: Row) =>
      (!severity || row.severity === severity) &&
      JSON.stringify(row).toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <PageTitle
        eyebrow="MONITORING / ACTIVITY"
        title="Stay close to every event."
        description="Review incoming sightings and alerts from your connected workspace."
      >
        <Badge tone={socketState === "Live" ? "green" : "amber"}>
          {socketState}
        </Badge>
      </PageTitle>
      <Panel title="Activity feed">
        <div className="filters">
          <div className="segmented compact">
            <button
              className={tab === "live" ? "active" : ""}
              onClick={() => setTab("live")}
            >
              Live events
            </button>
            {isAdmin && (
              <>
                <button
                  className={tab === "history" ? "active" : ""}
                  onClick={() => setTab("history")}
                >
                  Surveillance events
                </button>
                <button
                  className={tab === "audit" ? "active" : ""}
                  onClick={() => setTab("audit")}
                >
                  Activity log
                </button>
              </>
            )}
          </div>
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search events…"
          />
          <select
            aria-label="Event severity"
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
          >
            <option value="">All severities</option>
            {["critical", "high", "medium", "low", "warning", "info"].map(
              (s) => (
                <option key={s}>{s}</option>
              ),
            )}
          </select>
        </div>
        {tab === "live" ? (
          <div className="feed-note">
            <Radio size={15} />
            <span>
              Latest 200 events received in this session. Historical entries are
              available in the entry log.
            </span>
            {events.length > 0 && (
              <button onClick={clearEvents}>Clear view</button>
            )}
          </div>
        ) : !endpoint ? (
          <Empty
            title="Historical feed is not connected"
            detail="The supplied desktop frontend has no working history integration for this view. Live events and the entry log remain available; your administrator can configure a supported history endpoint."
          />
        ) : (
          <ErrorBox message={history.error} retry={history.refresh} />
        )}
        {(tab === "live" || endpoint) &&
          (history.loading && tab !== "live" && !history.data ? (
            <Loading />
          ) : rows.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Severity</th>
                    <th>Camera / account</th>
                    <th>Description</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row: Row, i: number) => (
                    <tr key={row._key || row.event_id || i}>
                      <td>
                        <span className="event-type">
                          <ActivityIcon size={16} />
                          {row.event_type || row.action || row.type || "Event"}
                        </span>
                      </td>
                      <td>
                        <Badge
                          tone={
                            ["high", "critical"].includes(row.severity)
                              ? "red"
                              : row.severity === "warning"
                                ? "amber"
                                : "neutral"
                          }
                        >
                          {row.severity || "Info"}
                        </Badge>
                      </td>
                      <td>
                        {row.camera_name ||
                          row.camera_id ||
                          row.username ||
                          "—"}
                      </td>
                      <td>
                        {displayText(
                          row.description || row.message || row.details,
                        )}
                      </td>
                      <td>
                        {dateTime(
                          row.timestamp || row.started_at || row.received_at,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title={
                tab === "live" ? "Waiting for new events" : "No events found"
              }
              detail="Events appear when your server publishes activity."
            />
          ))}
        {endpoint && (
          <div className="form-actions">
            <Refresh onClick={history.refresh} loading={history.loading} />
          </div>
        )}
      </Panel>
    </>
  );
}
