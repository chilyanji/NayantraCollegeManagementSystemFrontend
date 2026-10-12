import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  detectionState,
  people,
  profileChanges,
  similarity,
  reference,
} from "../src/lib/domain";
import {
  api,
  asList,
  getBase,
  getSession,
  normalizeBase,
  query,
  request,
  setSession,
  socketUrl,
} from "../src/lib/api";
import { JpegParser } from "../src/lib/mjpeg";
beforeEach(() => {
  const memory = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => memory.set(k, v),
  });
  vi.stubGlobal("sessionStorage", {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  });
  vi.stubGlobal("window", {
    location: { origin: "http://localhost:5173" },
    dispatchEvent: vi.fn(),
  });
  setSession(null);
});
describe("Detection identity contract", () => {
  it("excludes undecided identities and respects explicit authorization status", () => {
    expect(detectionState({ decided: false, matched: true })).toBe("pending");
    expect(
      detectionState({ decided: true, matched: true, status: "auto" }),
    ).toBe("auto");
    expect(detectionState({ decided: true, status: "blacklisted" })).toBe(
      "blacklisted",
    );
    expect(detectionState({ matched: true })).toBe("enrolled");
  });
  it("deduplicates people and never uses detector confidence as identity confidence", () => {
    const rows = [
      { person_id: "A", matched: true },
      { person_id: "A", matched: true },
      { person_id: "B", decided: true, matched: false },
      { person_id: "C", decided: false },
    ];
    expect(people(rows, true)).toHaveLength(1);
    expect(people(rows, false)).toHaveLength(1);
    expect(similarity(undefined)).toBe("—");
    expect(similarity(1.4)).toBe("—");
    expect(similarity(0.937)).toBe("93.7%");
  });
  it("prefers human reference over internal subject id", () =>
    expect(reference({ person_id: "uuid", external_reference: "CS/01" })).toBe(
      "CS/01",
    ));
});
describe("Profile updates", () => {
  it("sends null for cleared fields and preserves zero-change fields", () => {
    const original = {
      full_name: "Alice",
      email: "alice@example.com",
      age: 20,
    };
    expect(profileChanges(original, { ...original, email: "" })).toEqual({
      email: null,
    });
  });
  it("normalizes numbers and phones", () =>
    expect(
      profileChanges({ age: 20 }, { age: "20", phone: "+91 98765-43210" }),
    ).toEqual({ phone: "+919876543210" }));
});
describe("HTTP contract and session isolation", () => {
  it("normalizes bare lists and envelopes", () => {
    expect(asList([{ user_id: 1 }], "users")).toHaveLength(1);
    expect(asList({ users: [{ user_id: 1 }] }, "users")).toHaveLength(1);
    expect(() => asList({}, "users")).toThrow();
  });
  it("encodes filters and WebSocket tokens", () => {
    expect(query({ search: "CS/1 & A", preset: "week" })).toBe(
      "?search=CS%2F1+%26+A&preset=week",
    );
    expect(socketUrl("a+b/c", "https://server.example/api")).toBe(
      "wss://server.example/api/ws/live?token=a%2Bb%2Fc",
    );
  });
  it("rejects unsafe or credential-bearing connection URLs", () => {
    expect(normalizeBase("/api/")).toBe("/api");
    expect(() => normalizeBase("javascript:alert(1)")).toThrow();
    expect(() => normalizeBase("https://user:pass@example.com")).toThrow();
  });
  it("sends authorization only to the session server", async () => {
    setSession({ token: "secret", user: { username: "a" }, base: "/api" });
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await request("/health", { base: "https://other.example" });
    expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });
  it("does not clear a new session for a stale unauthorized response", async () => {
    const base = getBase();
    setSession({ token: "old", user: { username: "a" }, base });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        setSession({ token: "new", user: { username: "b" }, base });
        return new Response('{"detail":"expired"}', { status: 401 });
      }),
    );
    await expect(request("/protected")).rejects.toThrow("expired");
    expect(getSession()?.token).toBe("new");
  });
  it("handles invalid JSON and FastAPI validation errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("<html>oops</html>"))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              detail: [{ loc: ["body", "age"], msg: "Must be 13 or older" }],
            }),
            { status: 422 },
          ),
        ),
    );
    await expect(request("/x")).rejects.toThrow("invalid JSON");
    await expect(request("/x")).rejects.toThrow("age: Must be 13 or older");
  });
  it("keeps slash-containing subject references encoded in paths", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await api.subject("CS/001 & A");
    expect(fetch.mock.calls[0][0]).toContain("/subjects/CS%2F001%20%26%20A");
  });
  it("validates login response before creating a session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response('{"access_token":"x"}')),
    );
    await expect(api.login("a", "b")).rejects.toThrow("Incomplete login");
    expect(getSession()).toBeNull();
  });
  it("treats HTTP 204 as a successful empty response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );
    expect(await request("/x", { method: "DELETE" })).toEqual({});
  });
});
describe("Multipart camera stream parser", () => {
  it("handles split markers and multiple JPEG frames per chunk", () => {
    const parser = new JpegParser();
    expect(parser.push(new Uint8Array([0, 255]))).toEqual([]);
    expect(parser.push(new Uint8Array([216, 1, 2, 255]))).toEqual([]);
    const frames = parser.push(new Uint8Array([217, 0, 255, 216, 8, 255, 217]));
    expect(frames.map((x) => Array.from(x))).toEqual([
      [255, 216, 1, 2, 255, 217],
      [255, 216, 8, 255, 217],
    ]);
  });
  it("bounds memory on an incomplete camera frame", () => {
    const parser = new JpegParser();
    parser.push(new Uint8Array([255, 216]));
    expect(() => parser.push(new Uint8Array(8 * 1024 * 1024))).toThrow(
      "oversized",
    );
  });
});
