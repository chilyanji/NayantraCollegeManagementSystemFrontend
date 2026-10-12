import { request, type Row } from "../../lib/api";
export type Page<T = Row> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};
export type Scope = {
  hostel: Row;
  manage: boolean;
  admin: boolean;
  guard: boolean;
  gate_ids: string[] | null;
  policies: Row;
};
export type HostelEvent = {
  type: string;
  data: Row & { message_id: string; hostel_id: string };
};
export const path = (h: string, r = "") =>
  `/hostels/${encodeURIComponent(h)}${r}`;
export function query(values: Record<string, unknown>) {
  const q = new URLSearchParams();
  Object.entries(values).forEach(([k, v]) => {
    if (v !== "" && v !== null && v !== undefined) q.set(k, String(v));
  });
  return q.size ? `?${q}` : "";
}
export const hostelApi = {
  list: (signal?: AbortSignal) => request<Row[]>("/hostels", { signal }),
  get: <T = Row>(h: string, r: string, signal?: AbortSignal) =>
    request<T>(path(h, r), { signal }),
  save: <T = Row>(h: string, r: string, body?: unknown, method = "POST") =>
    request<T>(path(h, r), { method, body }),
};
export function parseHostelEvent(raw: unknown): HostelEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Row,
    d = e.data;
  if (
    typeof e.type !== "string" ||
    !e.type.startsWith("hostel.") ||
    !d ||
    typeof d !== "object" ||
    typeof d.hostel_id !== "string" ||
    typeof d.message_id !== "string"
  )
    return null;
  return { type: e.type, data: d } as HostelEvent;
}
export function dateTime(v: unknown) {
  if (!v) return "—";
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}
export const label = (v: unknown) => String(v ?? "—").replaceAll("_", " ");
export const iso = (v: unknown) => new Date(String(v)).toISOString();
export const formValues = (f: HTMLFormElement): Row =>
  Object.fromEntries(new FormData(f));
