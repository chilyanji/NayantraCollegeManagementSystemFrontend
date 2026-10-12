export type Row = Record<string, any>;
export type Session = { token: string; user: Row; base: string };
const SESSION_KEY = "sentinel.session.v1";
export function readStorage(key: string, fallback = "") {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
export function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Session remains in memory when storage is unavailable. */
  }
}
export function normalizeBase(input: string) {
  const value = input.trim() === "/" ? "/" : input.trim().replace(/\/+$/, "");
  if (value.startsWith("/") && !value.startsWith("//") && !/[?#]/.test(value))
    return value;
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Use an HTTP(S) server URL or an absolute path such as /api.",
    );
  return url.toString().replace(/\/+$/, "");
}
export function getBase() {
  return readStorage("sentinel.api", import.meta.env.VITE_API_URL || "/api");
}
let current: Session | null = null;
try {
  const parsed = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
  if (parsed?.token && parsed?.user?.username && parsed.base === getBase())
    current = parsed;
} catch {
  /* Invalid saved session is ignored. */
}
export function getSession() {
  return current;
}
export function setSession(session: Session | null) {
  current = session;
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* in-memory fallback */
  }
}
export function apiUrl(path: string, base = getBase()) {
  return `${base.replace(/\/+$/, "")}${path}`;
}
export function socketUrl(token: string, base = getBase()) {
  const url = new URL(apiUrl("/ws/live", base), window.location.origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("token", token);
  return url.toString();
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
    public retryAfter = 0,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export function messageOf(error: unknown) {
  return error instanceof Error
    ? error.message
    : "An unexpected error occurred.";
}
function detailMessage(value: any, status: number) {
  if (Array.isArray(value))
    return value
      .map(
        (x) =>
          `${(x.loc || []).filter((v: string) => v !== "body").join(".")}: ${x.msg || "Invalid value"}`,
      )
      .join("; ");
  return typeof value === "string" ? value : `Request failed (${status}).`;
}
type Options = {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  timeout?: number;
  auth?: boolean;
  binary?: boolean;
  base?: string;
};
export async function request<T = Row>(
  path: string,
  options: Options = {},
): Promise<T> {
  const {
    method = "GET",
    body,
    signal,
    timeout = 12000,
    auth = true,
    binary = false,
    base = getBase(),
  } = options;
  const authRequest = ["/login", "/register", "/logout"].includes(path) || path.startsWith("/auth/");
  const transportBase = authRequest && base === (import.meta.env.VITE_API_URL || "/api") && import.meta.env.VITE_AUTH_API_URL
    ? normalizeBase(import.meta.env.VITE_AUTH_API_URL) : base;
  const captured = getSession();
  const token = auth && captured?.base === base ? captured.token : null;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(apiUrl(path, transportBase), {
      method,
      headers: {
        ...(authRequest ? { "X-Nayantra-Auth": "1" } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      credentials: authRequest ? "include" : "omit",
    });
    if (!response.ok) {
      let detail;
      try {
        detail = (await response.json()).detail;
      } catch {
        /* never render an HTML error page */
      }
      if (
        response.status === 401 &&
        token &&
        getSession()?.token === token &&
        getSession()?.base === base
      ) {
        setSession(null);
        window.dispatchEvent(new CustomEvent("sentinel:expired"));
      }
      throw new ApiError(
        detailMessage(detail, response.status),
        response.status,
        Number(response.headers.get("Retry-After")) || 0,
      );
    }
    if (response.status === 204) return {} as T;
    if (binary) {
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("json") || contentType.includes("text/html"))
        throw new ApiError("The server did not return the requested file.");
      return (await response.blob()) as T;
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw new ApiError("The server returned an invalid JSON response.");
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    if (controller.signal.aborted)
      throw new ApiError("The server took too long to respond. Please retry.");
    throw new ApiError(
      "Cannot reach the server. Check the connection and server address.",
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
export function asRow(value: any): Row {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ApiError("Unexpected server response. Expected an object.");
  return value;
}
export function asList(value: any, key: string): Row[] {
  const list = Array.isArray(value) ? value : value?.[key];
  if (!Array.isArray(list))
    throw new ApiError(`Unexpected server response. Expected ${key}.`);
  return list.filter((x) => x && typeof x === "object" && !Array.isArray(x));
}
export function query(
  values: Record<string, string | number | null | undefined>,
) {
  const q = new URLSearchParams();
  Object.entries(values).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  });
  return q.size ? `?${q}` : "";
}
export function parseAuthResponse(value: unknown): Row {
  const data = asRow(value);
  const email = data.verification_required === true;
  const mfa = data.mfa_required === true;
  if ((email || mfa) && (data.access_token !== undefined || (email && mfa)))
    throw new ApiError("Conflicting login response.");
  if (email && typeof data.verification_token === "string" && data.verification_token && data.masked_email)
    return data;
  if (mfa && typeof data.mfa_token === "string" && data.mfa_token && ["totp", "email", "enroll"].includes(data.method))
    return data;
  if (!email && !mfa && typeof data.access_token === "string" && data.access_token && data.user?.username && data.user?.role)
    return data;
  throw new ApiError("Incomplete login response.");
}
const ref = encodeURIComponent;
export const api = {
  health: (signal?: AbortSignal) => request("/health", { signal, auth: false }),
  login: async (username: string, password: string) => {
    const data = asRow(
      await request("/login", {
        method: "POST",
        body: { username, password },
        timeout: 45000,
        auth: false,
      }),
    );
    return parseAuthResponse(data);
  },
  verifyEmail: async (verification_token: string, code: string) =>
    parseAuthResponse(await request("/auth/email/verify", {
      method: "POST", body: { verification_token, code }, auth: false, timeout: 45000,
    })),
  resendEmail: (verification_token: string) =>
    request("/auth/email/resend", {
      method: "POST",
      body: { verification_token },
      auth: false,
      timeout: 45000,
    }),
  logout: () => request("/logout", { method: "POST" }),
  register: (body: Row) =>
    request("/register", {
      method: "POST",
      body: {
        ...body,
        phone: String(body.phone).replace(/[\s-]/g, ""),
        age: Number(body.age),
      },
      auth: false,
    }),
  available: (username: string, signal?: AbortSignal) =>
    request(`/username-available/${ref(username)}`, { signal, auth: false }),
  profile: (username: string, signal?: AbortSignal) =>
    request(`/users/${ref(username)}`, { signal }),
  members: async (signal?: AbortSignal) =>
    asList(await request("/admin/members", { signal }), "members"),
  users: async (signal?: AbortSignal) =>
    asList(await request("/admin/users", { signal }), "users"),
  cameras: async (admin: boolean, signal?: AbortSignal) =>
    asList(
      await request(admin ? "/admin/cameras" : "/me/cameras", { signal }),
      "cameras",
    ),
  access: async (id: string, signal?: AbortSignal) => {
    const result = await request<any>(`/admin/members/${ref(id)}/cameras`, {
      signal,
    });
    const ids = Array.isArray(result) ? result : result?.camera_ids;
    if (!Array.isArray(ids))
      throw new ApiError("Invalid camera access response.");
    return ids.map(String);
  },
  saveAccess: (id: string, ids: string[]) =>
    request(`/admin/members/${ref(id)}/cameras`, {
      method: "PUT",
      body: { camera_ids: ids },
    }),
  updateUser: (id: string, body: Row) =>
    request(`/admin/users/${ref(id)}`, { method: "PUT", body }),
  deleteUser: (id: string) =>
    request(`/admin/users/${ref(id)}`, { method: "DELETE" }),
  aiHealth: (signal?: AbortSignal) => request("/ai/health", { signal }),
  cameraStatus: (cameraId: string, signal?: AbortSignal) =>
    request(`/ai/camera/${ref(cameraId)}/status`, { signal }),

  /** Runtime state for every visible camera — one call, not one per camera. */
  aiCameras: async (signal?: AbortSignal) =>
    asList(await request("/ai/cameras", { signal }), "cameras"),
  detections: async (signal?: AbortSignal) =>
    asList(await request("/ai/detections", { signal }), "detections"),
  start: () =>
    request("/ai/start", { method: "POST", body: {}, timeout: 120000 }),
  stop: () => request("/ai/stop", { method: "POST", body: {}, timeout: 30000 }),
  subject: (reference: string, signal?: AbortSignal) =>
    request(`/subjects/${ref(reference)}`, { signal }),
  publicPerson: (reference: string, signal?: AbortSignal) =>
    request(`/persons/${ref(reference)}`, { signal }),
  updateSubject: (reference: string, body: Row) =>
    request(`/admin/subjects/${ref(reference)}`, { method: "PUT", body }),
  subjects: async (filters: Row, signal?: AbortSignal) =>
    asList(await request(`/subjects${query(filters)}`, { signal }), "subjects"),
  entries: async (filters: Row, signal?: AbortSignal) => {
    const result = asRow(
      await request(`/entries${query({ ...filters, limit: 500 })}`, { signal }),
    );
    return { ...result, entries: asList(result, "entries") };
  },
  exportEntries: (filters: Row) =>
    request<Blob>(`/entries/export${query(filters)}`, {
      binary: true,
      timeout: 60000,
    }),
};
