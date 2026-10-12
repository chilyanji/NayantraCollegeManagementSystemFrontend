/**
 * Nayantra frontend API client.
 *
 * Vercel: set VITE_API_URL to the HTTPS ngrok backend URL.
 * Local Vite: /api is used unless an override is saved in Settings.
 *
 * Keep this file at frontend/src/lib/api.ts.
 */

export type Row = Record<string, any>;
export type Session = { token: string; user: Row; base: string };

const SESSION_KEY = "sentinel.session.v1";
const API_KEY = "sentinel.api";

export function readStorage(key: string, fallback = ""): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The app can continue when browser storage is unavailable.
  }
}

/** Accept an HTTP(S) URL or a same-origin absolute path, e.g. /api. */
export function normalizeBase(input: string): string {
  const value = input.trim();

  if (!value) {
    throw new Error("Enter an HTTP(S) server URL or an absolute path such as /api.");
  }

  if (value.startsWith("/") && !value.startsWith("//")) {
    if (/[?#\\]/.test(value)) {
      throw new Error("The API base path must not contain a query, hash, or backslash.");
    }
    return value === "/" ? "/" : value.replace(/\/+$/, "");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Use an HTTP(S) server URL or an absolute path such as /api.");
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("Use an HTTP(S) server URL without credentials, query, or hash.");
  }

  return url.toString().replace(/\/+$/, "");
}

/**
 * An explicit Server Connection setting overrides the Vite build-time value.
 * On Vercel, set VITE_API_URL and clear any old localStorage override if needed.
 */
export function getBase(): string {
  const configured = import.meta.env.VITE_API_URL || "/api";
  const saved = readStorage(API_KEY, configured);

  try {
    return normalizeBase(saved);
  } catch {
    return normalizeBase(configured);
  }
}

let current: Session | null = null;

try {
  const parsed: unknown = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const candidate = parsed as Partial<Session>;
    if (
      typeof candidate.token === "string" &&
      candidate.token.length > 0 &&
      typeof candidate.user?.username === "string" &&
      candidate.base === getBase()
    ) {
      current = candidate as Session;
    }
  }
} catch {
  // Ignore invalid or inaccessible sessionStorage.
}

export function getSession(): Session | null {
  return current;
}

export function setSession(session: Session | null): void {
  current = session;
  try {
    if (session) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } else {
      sessionStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // Keep the session in memory if sessionStorage is unavailable.
  }
}

/** Combine an API base with a path without producing //health for base '/'. */
export function apiUrl(path: string, base = getBase()): string {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("API paths must begin with a single '/'.");
  }

  const normalized = normalizeBase(base);
  const prefix = normalized === "/" ? "" : normalized;
  return `${prefix}${path}`;
}

/** Maintain the existing /ws/live?token=... server contract. */
export function socketUrl(token: string, base = getBase()): string {
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

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

function detailMessage(value: unknown, status: number): string {
  if (Array.isArray(value)) {
    return value
      .map((item: any) => {
        const location = Array.isArray(item?.loc)
          ? item.loc.filter((part: unknown) => part !== "body").join(".")
          : "";
        const message = typeof item?.msg === "string" ? item.msg : "Invalid value";
        return location ? `${location}: ${message}` : message;
      })
      .join("; ");
  }

  return typeof value === "string" && value
    ? value
    : `Request failed (${status}).`;
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

function isAuthRoute(path: string): boolean {
  const route = path.split("?")[0];
  return ["/login", "/register", "/logout"].includes(route) || route.startsWith("/auth/");
}

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

  const requestBase = normalizeBase(base);
  const authRequest = isAuthRoute(path);
  const configuredBase = normalizeBase(import.meta.env.VITE_API_URL || "/api");
  const specialAuthBase = import.meta.env.VITE_AUTH_API_URL;

  // Preserve the optional dedicated auth origin, but only for the configured
  // default API base (not an explicit Server Connection override).
  const transportBase =
    authRequest && requestBase === configuredBase && specialAuthBase
      ? normalizeBase(specialAuthBase)
      : requestBase;

  const captured = getSession();
  const token = auth && captured?.base === requestBase ? captured.token : null;

  // Free ngrok endpoints can show a browser interstitial instead of API JSON.
  // This header requires the backend's CORS policy to allow custom headers.
  const hostname = new URL(apiUrl(path, transportBase), window.location.origin).hostname;
  const isNgrok = hostname.endsWith(".ngrok-free.dev") || hostname.endsWith(".ngrok-free.app");

  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();

  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(apiUrl(path, transportBase), {
      method,
      headers: {
        ...(isNgrok ? { "ngrok-skip-browser-warning": "true" } : {}),
        ...(authRequest ? { "X-Nayantra-Auth": "1" } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      credentials: authRequest ? "include" : "omit",
    });

    if (!response.ok) {
      let detail: unknown;
      try {
        const errorBody: unknown = await response.json();
        if (errorBody && typeof errorBody === "object" && "detail" in errorBody) {
          detail = (errorBody as { detail: unknown }).detail;
        }
      } catch {
        // Do not render an HTML error or ngrok interstitial as an API error.
      }

      if (
        response.status === 401 &&
        token &&
        getSession()?.token === token &&
        getSession()?.base === requestBase
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
      if (contentType.includes("json") || contentType.includes("text/html")) {
        throw new ApiError("The server did not return the requested file.");
      }
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
    if (controller.signal.aborted) {
      throw new ApiError("The server took too long to respond. Please retry.");
    }
    throw new ApiError("Cannot reach the server. Check the connection and server address.");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export function asRow(value: any): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError("Unexpected server response. Expected an object.");
  }
  return value;
}

export function asList(value: any, key: string): Row[] {
  const list = Array.isArray(value) ? value : value?.[key];
  if (!Array.isArray(list)) {
    throw new ApiError(`Unexpected server response. Expected ${key}.`);
  }
  return list.filter((item) => item && typeof item === "object" && !Array.isArray(item));
}

export function query(values: Record<string, string | number | null | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  return params.size ? `?${params}` : "";
}

/** The backend returns one of: email challenge, MFA challenge, or an access token. */
export function parseAuthResponse(value: unknown): Row {
  const data = asRow(value);
  const needsEmailVerification = data.verification_required === true;
  const needsMfa = data.mfa_required === true;
  const hasAccessToken = data.access_token !== undefined;

  if ((needsEmailVerification && needsMfa) || ((needsEmailVerification || needsMfa) && hasAccessToken)) {
    throw new ApiError("Conflicting login response.");
  }

  if (
    needsEmailVerification &&
    typeof data.verification_token === "string" &&
    data.verification_token.length > 0 &&
    data.masked_email
  ) {
    return data;
  }

  if (
    needsMfa &&
    typeof data.mfa_token === "string" &&
    data.mfa_token.length > 0 &&
    ["totp", "email", "enroll"].includes(data.method)
  ) {
    return data;
  }

  if (
    !needsEmailVerification &&
    !needsMfa &&
    typeof data.access_token === "string" &&
    data.access_token.length > 0 &&
    data.user?.username &&
    data.user?.role
  ) {
    return data;
  }

  throw new ApiError("Incomplete login response.");
}

const ref = encodeURIComponent;

// All existing API names and paths are intentionally preserved.
export const api = {
  health: (signal?: AbortSignal) => request("/health", { signal, auth: false }),

  login: async (username: string, password: string) =>
    parseAuthResponse(
      await request("/login", {
        method: "POST",
        body: { username, password },
        timeout: 45000,
        auth: false,
      }),
    ),

  verifyEmail: async (verification_token: string, code: string) =>
    parseAuthResponse(
      await request("/auth/email/verify", {
        method: "POST",
        body: { verification_token, code },
        auth: false,
        timeout: 45000,
      }),
    ),

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
    asList(await request(admin ? "/admin/cameras" : "/me/cameras", { signal }), "cameras"),

  access: async (id: string, signal?: AbortSignal) => {
    const result = await request<any>(`/admin/members/${ref(id)}/cameras`, { signal });
    const ids = Array.isArray(result) ? result : result?.camera_ids;
    if (!Array.isArray(ids)) {
      throw new ApiError("Invalid camera access response.");
    }
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

  /** Runtime state for every visible camera — one request for all cameras. */
  aiCameras: async (signal?: AbortSignal) =>
    asList(await request("/ai/cameras", { signal }), "cameras"),

  detections: async (signal?: AbortSignal) =>
    asList(await request("/ai/detections", { signal }), "detections"),

  start: () => request("/ai/start", { method: "POST", body: {}, timeout: 120000 }),

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
