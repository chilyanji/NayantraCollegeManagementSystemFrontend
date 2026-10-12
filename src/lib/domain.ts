import type { Row } from "./api";
export function userName(row: Row) {
  return (
    row.full_name ||
    row.name ||
    row.display_name ||
    row.username ||
    "Details not recorded"
  );
}
export function reference(row: Row) {
  return String(
    row.external_reference ||
      row.subject_code ||
      row.roll_num ||
      row.roll ||
      row.person_id ||
      "",
  );
}
export function detectionState(row: Row) {
  if (row.decided === false) return "pending";
  const status = row.status || row.auth_status;
  if (status === "enrolled") return "enrolled";
  if (status === "blacklisted") return "blacklisted";
  if (row.matched === true && !status) return "enrolled";
  if (row.decided === true || status === "auto") return "auto";
  return "pending";
}
export function people(rows: Row[], authorized: boolean) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const status = detectionState(row);
    if (status === "pending" || (status === "enrolled") !== authorized)
      return false;
    const key = reference(row) || String(row.tracking_id || "unidentified");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export function similarity(value: any) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1
    ? `${(n * 100).toFixed(1)}%`
    : "—";
}
export function dateTime(value: any) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.valueOf())
    ? String(value)
    : d.toLocaleString(undefined, {
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
}
export function duration(value: any) {
  if (value === null || value === undefined) return "—";
  const n = Math.max(0, Math.floor(Number(value) || 0));
  return n < 60
    ? `${n}s`
    : n < 3600
      ? `${Math.floor(n / 60)}m ${n % 60}s`
      : `${Math.floor(n / 3600)}h ${Math.floor((n % 3600) / 60)}m`;
}
export const profileFields = [
  ["full_name", "Full name", "text"],
  ["branch", "Branch", "text"],
  ["course", "Course", "text"],
  ["year_of_study", "Year of study", "number"],
  ["age", "Age", "number"],
  ["gender", "Gender", "text"],
  ["email", "Email", "email"],
  ["phone", "Phone", "tel"],
  ["guardian_name", "Guardian name", "text"],
  ["guardian_phone", "Guardian phone", "tel"],
  ["hostel_block", "Hostel block", "text"],
  ["room_number", "Room number", "text"],
  ["address", "Address", "textarea"],
  ["city", "City", "text"],
  ["state", "State", "text"],
  ["pincode", "Pincode", "text"],
  ["notes", "Notes", "textarea"],
] as const;
export function profileChanges(original: Row, form: Row) {
  const result: Row = {};
  for (const [key, , type] of profileFields) {
    let value: any = String(form[key] ?? "").trim();
    if (!value) value = null;
    else if (type === "number") value = Number(value);
    else if (type === "tel") value = value.replace(/[\s-]/g, "");
    if (value !== (original[key] ?? null)) result[key] = value;
  }
  return result;
}
export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function displayText(value: any, fallback = "—") {
  if (value === null || value === undefined || value === "") return fallback;
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
