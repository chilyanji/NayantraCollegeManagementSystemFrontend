import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import {
  Badge,
  Button,
  Empty,
  ErrorBox,
  Field,
  Loading,
  Modal,
  Panel,
} from "../../components/ui";
import { dateTime } from "../../lib/domain";
import { messageOf } from "../../lib/api";
import { useResource } from "../../lib/hooks";
import { useClassroom } from "./state";
import type { Page, SessionView, Filters } from "./types";
import { safeSnapshotUrl } from "./api";

export function sessionTime(s: SessionView) {
  return `${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][s.weekday - 1]} ${s.startTime.slice(0, 5)}–${s.endTime.slice(0, 5)} · ${s.timeZone}`;
}

export function ClassroomStatus({ value }: { value: string }) {
  const normalized = value.toUpperCase();
  return (
    <Badge
      tone={
        ["INSIDE", "ACTIVE", "RESOLVED", "IN", "PRESENT"].includes(normalized)
          ? "green"
          : [
                "UNAUTHORIZED",
                "UNAUTHORIZED_ENTRY",
                "BLACKLISTED",
                "NOT_IN_SESSION",
                "CRITICAL",
                "HIGH",
              ].includes(normalized)
            ? "red"
            : ["EARLY_EXIT", "EARLY EXIT", "MEDIUM", "UPCOMING"].includes(
                  normalized,
                )
              ? "amber"
              : "neutral"
      }
    >
      {value.replaceAll("_", " ") || "—"}
    </Badge>
  );
}
export function duration(seconds?: number | null) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
  return `${Math.floor(seconds / 60)} min ${Math.floor(seconds % 60)} sec`;
}
export function ResourceState({
  resource,
  empty,
  children,
}: {
  resource: {
    loading: boolean;
    error: string;
    data: unknown;
    refresh: () => void;
  };
  empty?: boolean;
  children: ReactNode;
}) {
  if (resource.error)
    return <ErrorBox message={resource.error} retry={resource.refresh} />;
  if (resource.loading && !resource.data) return <Loading />;
  if (empty)
    return (
      <Empty
        title="No records found"
        detail="Try a different session or filter."
      />
    );
  return (
    <>
      {resource.loading && (
        <span className="classroom-updating" role="status">
          Updating…
        </span>
      )}
      {children}
    </>
  );
}
export function SessionCards({ sessions }: { sessions: SessionView[] }) {
  return sessions.length ? (
    <div className="classroom-card-grid">
      {sessions.map((s) => (
        <Panel key={s.id}>
          <div className="classroom-card-body">
            <div className="classroom-row">
              <h3>{s.course}</h3>
              <ClassroomStatus value={s.status} />
            </div>
            <p>
              {s.classroom} · {s.cameraName}
            </p>
            <p>{sessionTime(s)}</p>
            <p>
              {s.studentCount} authorized students · {s.faculty}
            </p>
            <Link
              className="button"
              to={`/faculty/sessions/${encodeURIComponent(s.id)}`}
            >
              Open session <ArrowRight size={15} />
            </Link>
          </div>
        </Panel>
      ))}
    </div>
  ) : (
    <Empty
      title="No sessions assigned"
      detail="Your assigned class sessions will appear here."
    />
  );
}
export function useCursor(resetKey: string) {
  const [state, setState] = useState<{ key: string; stack: string[] }>({
    key: resetKey,
    stack: [""],
  });
  const stack = state.key === resetKey ? state.stack : [""];
  return {
    cursor: stack[stack.length - 1],
    index: stack.length,
    hasPrevious: stack.length > 1,
    next: (cursor: string) =>
      setState({ key: resetKey, stack: [...stack, cursor] }),
    previous: () => setState({ key: resetKey, stack: stack.slice(0, -1) }),
  };
}
export function Pagination({
  data,
  pager,
  loading,
}: {
  data: Page<unknown> | null;
  pager: ReturnType<typeof useCursor>;
  loading: boolean;
}) {
  return (
    <div className="classroom-pagination">
      {data?.notice && <p className="classroom-page-notice">{data.notice}</p>}
      <span>
        {data?.total != null ? `${data.total} records · ` : ""}Page{" "}
        {pager.index}
      </span>
      <Button disabled={loading || !pager.hasPrevious} onClick={pager.previous}>
        Previous
      </Button>
      <Button
        disabled={loading || !data?.nextCursor}
        onClick={() => data?.nextCursor && pager.next(data.nextCursor)}
      >
        Next
      </Button>
    </div>
  );
}
export function FilterBar({
  enabled,
  value,
  onChange,
}: {
  enabled: (keyof Filters)[];
  value: Filters;
  onChange: (f: Filters) => void;
}) {
  return (
    <div className="classroom-filters">
      {enabled.includes("search") && (
        <Field label="Search">
          <input
            type="search"
            value={value.search || ""}
            onChange={(e) => onChange({ ...value, search: e.target.value })}
            placeholder="Name or roll number"
          />
        </Field>
      )}
      {enabled.includes("date") && (
        <Field label="Date">
          <input
            type="date"
            value={value.date || ""}
            onChange={(e) => onChange({ ...value, date: e.target.value })}
          />
        </Field>
      )}
      {enabled.includes("event") && (
        <Field label="Movement">
          <select
            value={value.event || ""}
            onChange={(e) =>
              onChange({
                ...value,
                event: (e.target.value || undefined) as Filters["event"],
              })
            }
          >
            <option value="">All movements</option>
            <option>IN</option>
            <option>OUT</option>
          </select>
        </Field>
      )}
      {enabled.includes("status") && (
        <Field label="Status">
          <select
            value={value.status || "open"}
            onChange={(e) => onChange({ ...value, status: e.target.value })}
          >
            {[
              "open",
              "acknowledged",
              "investigating",
              "resolved",
              "dismissed",
            ].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      )}
      {enabled.includes("kind") && (
        <Field label="Alert type">
          <select
            value={value.kind || ""}
            onChange={(e) => onChange({ ...value, kind: e.target.value })}
          >
            <option value="">All types</option>
            <option value="early_exit">Early exit</option>
            <option value="unauthorized_entry">Unauthorized entry</option>
            <option value="unidentified_person">Unidentified person</option>
          </select>
        </Field>
      )}
      {enabled.includes("includeClosed") && (
        <Field label="Evidence status">
          <select
            value={value.includeClosed ? "all" : "active"}
            onChange={(e) =>
              onChange({ ...value, includeClosed: e.target.value === "all" })
            }
          >
            <option value="active">Active evidence</option>
            <option value="all">Include closed evidence</option>
          </select>
        </Field>
      )}
    </div>
  );
}
export function SessionPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const { adapter, revision } = useClassroom();
  const [search, setSearch] = useState("");
  const pager = useCursor(search);
  const sessions = useResource(
    (s) =>
      adapter!.sessions(
        {
          search: adapter!.filters.sessions?.includes("search")
            ? search
            : undefined,
          cursor: pager.cursor,
        },
        s,
      ),
    `picker-${revision}-${pager.cursor}-${search}`,
  );
  return (
    <Panel title="Choose a session">
      <ResourceState resource={sessions}>
        <div className="classroom-filters">
          {adapter!.filters.sessions?.includes("search") && (
            <Field label="Find session">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </Field>
          )}
          <Field label="Session">
            <select value={value} onChange={(e) => onChange(e.target.value)}>
              <option value="">Select an assigned session</option>
              {value && !sessions.data?.items.some((s) => s.id === value) && (
                <option value={value}>Selected session</option>
              )}
              {sessions.data?.items.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.course} · {s.classroom} · {sessionTime(s)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Pagination
          data={sessions.data}
          pager={pager}
          loading={sessions.loading}
        />
      </ResourceState>
    </Panel>
  );
}
export function ConfirmAction({
  title,
  detail,
  action,
  onClose,
  onSuccess,
}: {
  title: string;
  detail: string;
  action: (signal: AbortSignal) => Promise<void>;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function confirm() {
    if (controller.current) return;
    const c = new AbortController();
    controller.current = c;
    setBusy(true);
    setError("");
    try {
      await action(c.signal);
      if (!c.signal.aborted) {
        onSuccess();
        onClose();
      }
    } catch (e) {
      if (!c.signal.aborted) setError(messageOf(e));
    } finally {
      if (!c.signal.aborted) {
        controller.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <Modal
      title={title}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="modal-body">
        <p>{detail}</p>
        <ErrorBox message={error} />
        <div className="form-actions">
          <Button disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy} onClick={confirm}>
            {busy ? "Saving…" : "Confirm resolve"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
export function AuthenticatedImage({
  load,
  resourceKey,
  alt,
}: {
  load: (signal: AbortSignal) => Promise<Blob | string>;
  resourceKey: string;
  alt: string;
}) {
  const result = useResource(load, resourceKey);
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setUrl("");
    setFailed(false);
    if (typeof result.data === "string") {
      try {
        setUrl(safeSnapshotUrl(result.data));
      } catch {
        setFailed(true);
      }
      return;
    }
    if (!result.data || !/^image\/(jpeg|png|webp)$/.test(result.data.type))
      return;
    const next = URL.createObjectURL(result.data);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [result.data]);
  return (
    <ResourceState resource={result}>
      {failed ? (
        <ErrorBox
          message="Snapshot could not be loaded. Retry to request a fresh link."
          retry={result.refresh}
        />
      ) : url ? (
        <img
          src={url}
          alt={alt}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        !result.loading && (
          <Empty
            title="Snapshot unavailable"
            detail="The image may have been removed or expired."
          />
        )
      )}
    </ResourceState>
  );
}
