import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Button,
  Empty,
  ErrorBox,
  Field,
  Loading,
  Modal,
  Badge,
} from "../../components/ui";
import { useAuth } from "../../state";
import { messageOf, type Row } from "../../lib/api";
import { useResource } from "../../lib/hooks";
import { formValues, hostelApi, label, type Page } from "./api";
import { useHostelLive } from "./state";
export function useHostelResource<T = Row>(
  h: string,
  route: string,
  poll = 30000,
) {
  const { revision } = useHostelLive(),
    r = useResource<T>(
      (s) => hostelApi.get<T>(h, route, s),
      `${h}:${route}`,
      poll,
    ),
    previous = useRef(revision);
  useEffect(() => {
    if (previous.current !== revision) {
      previous.current = revision;
      r.refresh();
    }
  }, [revision, r.refresh]);
  return r;
}
export function DataBoundary({
  resource: r,
  children,
}: {
  resource: {
    loading: boolean;
    error: string;
    data: unknown;
    refresh: () => void;
  };
  children: ReactNode;
}) {
  if (r.error) return <ErrorBox message={r.error} retry={r.refresh} />;
  if (r.loading && r.data === null) return <Loading />;
  return <>{children}</>;
}
export function Status({ value }: { value: unknown }) {
  const v = String(value ?? "unknown");
  return (
    <Badge
      tone={
        [
          "inside",
          "active",
          "approved",
          "resident",
          "authorized",
          "returned",
          "available",
        ].includes(v)
          ? "green"
          : [
                "critical",
                "unauthorized",
                "wrong_hostel",
                "overdue",
                "suspended",
                "disabled",
              ].includes(v)
            ? "red"
            : ["unknown", "pending", "maintenance", "late_entry"].includes(v)
              ? "amber"
              : "neutral"
      }
    >
      {label(v)}
    </Badge>
  );
}
export type Column = { title: string; cell: (r: Row) => ReactNode };
export function Grid({
  rows,
  columns,
  id = "id",
  empty = "No records yet",
}: {
  rows: Row[];
  columns: Column[];
  id?: string;
  empty?: string;
}) {
  if (!rows.length) return <Empty title={empty} />;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.title}>{c.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={String(r[id] ?? i)}>
              {columns.map((c) => (
                <td key={c.title}>{c.cell(r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Pager({
  page,
  offset,
  setOffset,
}: {
  page?: Page | null;
  offset: number;
  setOffset: (v: number) => void;
}) {
  return (
    <div className="hostel-pager">
      <span>
        {page?.total ?? 0} records · page {Math.floor(offset / 50) + 1}
      </span>
      <Button
        disabled={!offset}
        onClick={() => setOffset(Math.max(0, offset - 50))}
      >
        Previous
      </Button>
      <Button
        disabled={!page || offset + 50 >= page.total}
        onClick={() => setOffset(offset + 50)}
      >
        Next
      </Button>
    </div>
  );
}
export function FormDialog({
  title,
  children,
  onClose,
  onSave,
  onSaved,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onSave: (v: Row) => Promise<unknown>;
  onSaved: () => void;
  wide?: boolean;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    pending = useRef(false),
    { notice } = useAuth();
  return (
    <Modal
      title={title}
      onClose={() => {
        if (!pending.current) onClose();
      }}
      wide={wide}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (pending.current) return;
          const v = formValues(e.currentTarget);
          pending.current = true;
          setBusy(true);
          setError("");
          try {
            await onSave(v);
            notice(`${title} saved.`, "success");
            onSaved();
            onClose();
          } catch (e) {
            setError(messageOf(e));
          } finally {
            pending.current = false;
            setBusy(false);
          }
        }}
      >
        <ErrorBox message={error} />
        <fieldset disabled={busy}>
          <div className="form-grid">{children}</div>
          <div className="modal-actions">
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
export function NoteField() {
  return (
    <Field label="Reason / verification note">
      <textarea name="note" required minLength={3} maxLength={500} />
    </Field>
  );
}
export function SelectField({
  label: title,
  name,
  options,
  value,
  required = false,
  onChange,
  placeholder = "Select…",
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  value?: string;
  required?: boolean;
  onChange?: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <Field label={title}>
      <select
        name={name}
        required={required}
        {...(onChange
          ? { value: value ?? "", onChange: (e) => onChange(e.target.value) }
          : { defaultValue: value ?? "" })}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function ResidentSelect({
  hostel,
  name = "resident_id",
  person = false,
  optional = false,
}: {
  hostel: string;
  name?: string;
  person?: boolean;
  optional?: boolean;
}) {
  const [search, setSearch] = useState(""),
    r = useHostelResource<Page>(
      hostel,
      `/residents?limit=100&q=${encodeURIComponent(search)}`,
      0,
    );
  return (
    <div>
      <Field label="Find resident">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name or roll number"
        />
      </Field>
      <ErrorBox message={r.error} />
      <SelectField
        label="Resident"
        name={name}
        required={!optional}
        placeholder={
          optional ? "Unidentified / not linked" : "Select a resident"
        }
        options={(r.data?.items ?? []).map((x) => ({
          value: String(x[person ? "person_id" : "resident_id"]),
          label: `${x.name} · ${x.person_ref}${x.room_number ? " · " + x.room_number : ""}`,
        }))}
      />
    </div>
  );
}
