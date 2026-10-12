import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBase, setSession } from "../src/lib/api";
import {
  createBackendAdapter,
  parseClassroomEvent,
  safeSnapshotUrl,
  sessionPayload,
} from "../src/features/classroom/api";
import {
  EventMemory,
  notificationKey,
  shouldSound,
} from "../src/features/classroom/events";
import { polygonError } from "../src/features/classroom/geometry";
import type { ClassroomEvent } from "../src/features/classroom/types";
const event: ClassroomEvent = {
  id: "a",
  kind: "early_exit",
  alertId: "a",
  alertType: "EARLY_EXIT",
  message: "Exited early",
  soundRequired: true,
};
beforeEach(() => {
  vi.stubGlobal("localStorage", { getItem: () => null });
  vi.stubGlobal("sessionStorage", { setItem: () => {}, removeItem: () => {} });
  vi.stubGlobal("window", {
    location: { origin: "http://localhost:5173" },
    dispatchEvent: vi.fn(),
  });
  setSession({
    token: "test-token",
    base: getBase(),
    user: { username: "faculty", role: "faculty" },
  });
});
describe("Classroom event safety", () => {
  it("never sounds an early exit, and requires an explicit boolean true for other alerts", () => {
    expect(shouldSound(event)).toBe(false);
    expect(shouldSound({ ...event, kind: "alert_created" })).toBe(false);
    expect(
      shouldSound({
        ...event,
        kind: "unauthorized_entry",
        alertType: "UNAUTHORIZED_ENTRY",
      }),
    ).toBe(true);
    expect(
      shouldSound({
        ...event,
        kind: "unauthorized_entry",
        alertType: "UNAUTHORIZED_ENTRY",
        soundRequired: false,
      }),
    ).toBe(false);
  });
  it("deduplicates paired alert notifications but permits later escalation and resolution", () => {
    expect(notificationKey(event)).toBe(
      notificationKey({ ...event, kind: "alert_created" }),
    );
    expect(
      notificationKey({
        ...event,
        alertType: "UNAUTHORIZED_ENTRY",
        revision: "escalated",
      }),
    ).not.toBe(notificationKey(event));
    const memory = new EventMemory();
    expect(memory.accept("create:a")).toBe(true);
    expect(memory.accept("create:a")).toBe(false);
    expect(memory.accept("resolve:a")).toBe(true);
  });
  it("parses the actual broadcaster envelope and rejects malformed messages", () => {
    const parsed = parseClassroomEvent({
      type: "attendance.out",
      data: {
        session_id: "s",
        camera_id: "c",
        attendance_event_id: 42,
        sound_required: false,
      },
    });
    expect(parsed?.id).toBe("42");
    expect(parsed?.kind).toBe("out");
    expect(
      parseClassroomEvent({ type: "attendance.in", data: { session_id: "s" } }),
    ).toBeNull();
    expect(
      parseClassroomEvent({
        type: "alert.created",
        data: {
          session_id: "s",
          camera_id: "c",
          alert_id: "a",
          sound_required: "true",
        },
      })?.soundRequired,
    ).toBe(false);
  });
});
describe("Verified backend contracts", () => {
  it("sends weekly session fields and inherits the classroom camera", () => {
    expect(
      sessionPayload({
        facultyId: "7",
        classroomId: "r",
        courseId: "c",
        weekday: 2,
        startTime: "10:00",
        endTime: "11:00",
        termStart: "2026-10-01",
        termEnd: "2026-12-30",
        timeZone: "Asia/Kolkata",
        minimumMinutes: 30,
        active: true,
      }),
    ).toEqual({
      faculty_user_id: 7,
      classroom_id: "r",
      course_id: "c",
      weekday: 2,
      start_time: "10:00",
      end_time: "11:00",
      term_start: "2026-10-01",
      term_end: "2026-12-30",
      time_zone: "Asia/Kolkata",
      min_presence_minutes: 30,
      is_active: true,
    });
  });
  it("uses PATCH without inventing a resolve body and preserves server errors", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response('{"detail":"Not yours"}', { status: 404 }),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(
      createBackendAdapter().resolveEvidence!(
        "a/b",
        new AbortController().signal,
      ),
    ).rejects.toThrow("Not yours");
    expect(fetch.mock.calls[0][0]).toBe("/api/faculty/evidence/a%2Fb/resolve");
    expect(fetch.mock.calls[0][1]).toMatchObject({
      method: "PATCH",
      headers: { Authorization: "Bearer test-token" },
    });
    expect(fetch.mock.calls[0][1].body).toBeUndefined();
  });
  it("sends enrollment references and exposes the backend's partial-assignment result", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            session_id: "s",
            assigned: 1,
            not_found: ["CS/2"],
            students: [],
          }),
        ),
      );
    vi.stubGlobal("fetch", fetch);
    const result = await createBackendAdapter().saveStudentAssignment!(
      "s",
      ["CS/1", "CS/2"],
      new AbortController().signal,
    );
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      references: ["CS/1", "CS/2"],
    });
    expect(result.warning).toContain("CS/2");
  });
  it("sends only normalized point arrays to the classroom-zone endpoint", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await createBackendAdapter().saveZone!(
      null,
      {
        name: "Attendance",
        classroomId: "room",
        cameraId: "camera",
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.8, y: 0.1 },
          { x: 0.8, y: 0.8 },
        ],
      },
      new AbortController().signal,
    );
    expect(fetch.mock.calls[0][0]).toBe(
      "/api/admin/classrooms/room/attendance-zone",
    );
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      points: [
        [0.1, 0.1],
        [0.8, 0.1],
        [0.8, 0.8],
      ],
    });
  });
  it("allows signed HTTP(S) links but rejects filesystem, script and embedded credentials", () => {
    expect(
      safeSnapshotUrl("https://storage.example/snapshot?signature=x"),
    ).toContain("signature=x");
    for (const bad of [
      "C:\\images\\a.jpg",
      "/private/a.jpg",
      "file:///tmp/a.jpg",
      "javascript:alert(1)",
      "https://user:pass@host/a.jpg",
    ])
      expect(() => safeSnapshotUrl(bad)).toThrow();
  });
});
describe("Zone geometry", () => {
  it("rejects out-of-frame, collinear, duplicate and self-intersecting polygons", () => {
    expect(
      polygonError([
        { x: 0.1, y: 0.1 },
        { x: 0.9, y: 0.1 },
        { x: 0.9, y: 0.9 },
      ]),
    ).toBe("");
    expect(
      polygonError([
        { x: -1, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ]),
    ).not.toBe("");
    expect(
      polygonError([
        { x: 0, y: 0 },
        { x: 0.5, y: 0.5 },
        { x: 1, y: 1 },
      ]),
    ).not.toBe("");
    expect(
      polygonError([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
        { x: 1, y: 0 },
      ]),
    ).not.toBe("");
  });
});
