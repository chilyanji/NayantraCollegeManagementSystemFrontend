import { test, expect, type Page, type WebSocketRoute } from "@playwright/test";
import path from "node:path";
const hid = "11111111-1111-4111-8111-111111111111",
  gid = "22222222-2222-4222-8222-222222222222",
  rid = "33333333-3333-4333-8333-333333333333";
const pid = "44444444-4444-4444-8444-444444444444",
  bid = "55555555-5555-4555-8555-555555555555",
  aid = "66666666-6666-4666-8666-666666666666";
const hostel = {
  hostel_id: hid,
  code: "BH-1",
  name: "North Hostel",
  hostel_type: "boys",
  location: "North Campus",
  is_active: true,
  residents: 1,
  capacity: 4,
  occupied_beds: 1,
  wardens: 1,
  guards: 1,
};
const camera = {
  camera_id: "camera-one",
  camera_name: "North Gate Camera",
  is_active: true,
};
const gate = {
  gate_id: gid,
  code: "MAIN",
  name: "North Gate",
  camera_id: camera.camera_id,
  camera_name: camera.camera_name,
  is_active: true,
};
const resident = {
  resident_id: rid,
  person_id: pid,
  name: "Test Resident",
  person_ref: "CS/101",
  branch: "CSE",
  course: "B.Tech",
  year_of_study: 2,
  status: "active",
  is_authorized: true,
  presence: "inside",
  phone: "+919876543210",
};
const alert = {
  alert_id: aid,
  title: "Unauthorized hostel entry",
  description: "Person is not authorized for North Hostel",
  gate_name: gate.name,
  status: "open",
  severity: "critical",
  triggered_at: "2026-10-05T08:00:00Z",
};
const policies = {
  time_zone: "Asia/Kolkata",
  late_entry_enabled: false,
  late_grace_minutes: 10,
  late_sound_required: false,
  overdue_enabled: true,
  overdue_grace_minutes: 0,
  evidence_retention_days: 7,
  unauthorized_severity: "critical",
  debounce_seconds: 3,
  transition_confirm_frames: 2,
  transition_timeout_seconds: 15,
  identity_wait_seconds: 5,
};
async function setup(page: Page, role = "hostel_warden") {
  const user = {
    user_id: 7,
    username: role,
    full_name: "Test Hostel Staff",
    role,
    is_active: true,
  };
  const calls: { method: string; path: string; body: any }[] = [];
  let ws: WebSocketRoute | undefined,
    revoked = false;
  await page.addInitScript(
    (u) =>
      sessionStorage.setItem(
        "sentinel.session.v1",
        JSON.stringify({ token: "test-token", user: u, base: "/api" }),
      ),
    user,
  );
  await page.routeWebSocket(/\/ws\/live/, (socket) => {
    ws = socket;
  });
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      p = url.pathname.replace(/^\/api/, "");
    calls.push({ method: req.method(), path: p, body: req.postDataJSON() });
    if (p.endsWith("/stream")) return route.continue();
    const reply = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    const list = (items: unknown[]) =>
      reply({ items, total: items.length, limit: 50, offset: 0 });
    if (p.startsWith("/users/")) return reply(user);
    if (p === "/health") return reply({ database: "connected" });
    if (p === "/hostels") return reply([hostel]);
    if (p.startsWith(`/hostels/${hid}`)) {
      if (revoked)
        return reply({ detail: "Your hostel assignment was revoked" }, 403);
      const sub = p.slice(`/hostels/${hid}`.length);
      if (sub.endsWith("/frame"))
        return route.fulfill({
          contentType: "image/jpeg",
          path: path.resolve("tests/camera-fixture.jpg"),
        });
      if (req.method() !== "GET")
        return reply({ ...req.postDataJSON(), status: "saved" });
      if (!sub)
        return reply({
          hostel,
          manage: role !== "hostel_guard",
          guard: role === "hostel_guard",
          admin: role === "admin",
          gate_ids: role === "hostel_guard" ? [gid] : null,
          policies,
        });
      if (sub === "/summary")
        return reply({
          inside: 1,
          outside: 0,
          unknown: 0,
          occupied_beds: 1,
          capacity: 4,
          available_beds: 3,
          active_alerts: 1,
          visitors_inside: 0,
          total_rooms: 2,
          rooms_full: 0,
          rooms_available: 2,
          floors: [{ number: 0, occupied: 1, capacity: 4 }],
        });
      if (sub === "/gates") return reply([gate]);
      if (sub === "/cameras") return reply([camera]);
      if (sub === "/residents") return list([resident]);
      if (sub === "/resident-candidates")
        return reply([
          { ...resident, external_reference: resident.person_ref },
        ]);
      if (sub === "/rooms")
        return reply([
          {
            room_id: "room-1",
            room_number: "101",
            floor_number: 0,
            capacity: 2,
            status: "active",
            occupied: 0,
            beds: [{ bed_id: bid, label: "B1", is_active: true }],
          },
        ]);
      if (sub === "/alerts") return list([alert]);
      if (sub === "/entries")
        return list([
          {
            entry_id: "entry-1",
            display_name: resident.name,
            person_ref: resident.person_ref,
            direction: "in",
            is_authorized: true,
            auth_result: "authorized_resident",
            occurred_at: "2026-10-05T08:00:00Z",
            gate_name: gate.name,
            source: "camera",
          },
        ]);
      if (["/visitors", "/leave", "/evidence"].includes(sub)) return list([]);
      return reply([]);
    }
    if (p === "/ai/health") return reply({ status: "running" });
    if (p === "/ai/cameras")
      return reply({
        cameras: [{ ...camera, running: true, connected: true }],
      });
    if (p === "/ai/detections") return reply({ detections: [] });
    if (p === "/admin/cameras") return reply([camera]);
    if (p.startsWith("/admin/") || p.startsWith("/faculty/")) return reply([]);
    return reply({ detail: "Test route not configured" }, 404);
  });
  return {
    calls,
    revoke: () => {
      revoked = true;
    },
    emit: async (data: unknown) => {
      await expect.poll(() => Boolean(ws)).toBe(true);
      ws!.send(JSON.stringify(data));
    },
  };
}
const visit = (page: Page, section = "overview") =>
  page.goto(`/hostels/${hid}/${section}`);
async function saveNote(page: Page, note = "Verified at the gate") {
  const d = page.getByRole("dialog");
  await d.getByLabel("Reason / verification note").fill(note);
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expect(d).toHaveCount(0);
}
test("warden allocates a bed and registers a visitor through typed API payloads", async ({
  page,
}) => {
  const f = await setup(page);
  await visit(page, "residents");
  await page.getByRole("button", { name: "Allocate bed", exact: true }).click();
  await page.getByLabel("Available bed").selectOption(bid);
  await saveNote(page, "Initial room allocation");
  expect(
    f.calls.find((c) => c.path.endsWith("/allocation") && c.method === "POST")
      ?.body,
  ).toEqual({ bed_id: bid, reason: "Initial room allocation" });
  await page.getByRole("link", { name: "Visitors", exact: true }).click();
  await page
    .getByRole("button", { name: "Register visitor", exact: true })
    .click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Visitor name").fill("Test Parent");
  await d.getByLabel("Gate", { exact: true }).selectOption(gid);
  await d.getByLabel("Visit purpose").fill("Meet resident");
  await d.getByLabel("Valid until (local time)").fill("2026-12-31T18:00");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expect(d).toHaveCount(0);
  const body = f.calls.find(
    (c) => c.path.endsWith("/visitors") && c.method === "POST",
  )?.body;
  expect(body).toMatchObject({
    name: "Test Parent",
    gate_id: gid,
    purpose: "Meet resident",
    person_id: null,
    resident_id: null,
  });
  expect(new Date(body.expected_until).toISOString()).toBe(body.expected_until);
});
test("guard sees assigned stream, records a verified movement and can only acknowledge alerts", async ({
  page,
}) => {
  const f = await setup(page, "hostel_guard");
  await visit(page, "monitor");
  await expect(
    page.getByRole("heading", { name: "North Hostel", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => f.calls.some((c) => c.path === "/ai/camera/camera-one/stream"))
    .toBe(true);
  await expect(
    page.getByRole("link", { name: "Gates & cameras", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Staff", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Manual verification" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Gate", { exact: true })
    .selectOption(gid);
  await saveNote(page);
  expect(
    f.calls.find((c) => c.path.endsWith("/entries/manual"))?.body,
  ).toMatchObject({
    gate_id: gid,
    person_id: null,
    direction: "in",
    idempotency_key: expect.stringMatching(/^[0-9a-f-]{36}$/),
  });
  await page.getByRole("link", { name: "Alerts", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Resolve", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Acknowledge", exact: true }).click();
  await saveNote(page);
  expect(
    f.calls.find((c) => c.path.endsWith(`/alerts/${aid}/actions`))?.body.action,
  ).toBe("acknowledge");
  expect(
    f.calls.filter((c) =>
      [
        "/ai/health",
        "/ai/cameras",
        "/ai/detections",
        "/admin/users",
        "/admin/members",
      ].includes(c.path),
    ),
  ).toEqual([]);
});
test("live critical popup deduplicates delivery and closes on resolution", async ({
  page,
}) => {
  const f = await setup(page);
  await visit(page);
  await expect(
    page.getByRole("heading", { name: "North Hostel", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Enable alert sound", exact: true })
    .click();
  const event = {
    type: "hostel.unauthorized_entry",
    data: {
      hostel_id: hid,
      gate_id: gid,
      message_id: "critical-message-1",
      alert_id: aid,
      title: alert.title,
      description: alert.description,
      sound_required: true,
    },
  };
  await f.emit(event);
  await expect(page.locator(".hostel-alarm")).toHaveCount(1);
  await f.emit(event);
  await expect(page.locator(".hostel-alarm")).toHaveCount(1);
  await f.emit({
    type: "hostel.alert_resolved",
    data: { hostel_id: hid, message_id: "resolved-1", alert_id: aid },
  });
  await expect(page.locator(".hostel-alarm")).toHaveCount(0);
  await f.emit({
    type: "hostel.late_entry",
    data: {
      ...event.data,
      message_id: "late-1",
      title: "Late entry",
      sound_required: false,
    },
  });
  await expect(page.locator(".hostel-alarm")).toContainText("Late entry");
  await page.getByRole("button", { name: "Dismiss alert popup" }).click();
  await f.emit({ ...event, data: { ...event.data, message_id: "next-alert" } });
  await expect(page.locator(".hostel-alarm")).toHaveCount(1);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/login/);
  await expect(page.locator(".hostel-alarm")).toHaveCount(0);
});
test("zone editor saves independent normalized inside and outside polygons", async ({
  page,
}) => {
  const f = await setup(page);
  await visit(page, "gates");
  await page.getByRole("button", { name: "Draw zones" }).click();
  await expect(page.getByAltText("Current gate camera frame")).toBeVisible();
  const canvas = page.getByLabel("Gate zone drawing canvas"),
    box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  for (const [x, y] of [
    [0.1, 0.2],
    [0.35, 0.2],
    [0.35, 0.8],
    [0.1, 0.8],
  ])
    await canvas.click({ position: { x: x * box!.width, y: y * box!.height } });
  await page.getByRole("button", { name: "Inside · 0 points" }).click();
  for (const [x, y] of [
    [0.65, 0.2],
    [0.9, 0.2],
    [0.9, 0.8],
    [0.65, 0.8],
  ])
    await canvas.click({ position: { x: x * box!.width, y: y * box!.height } });
  await page.getByRole("button", { name: "Save both zones" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const payload = f.calls.find(
    (c) => c.path.endsWith("/zones") && c.method === "PUT",
  )?.body;
  expect(payload.inside).toHaveLength(4);
  expect(payload.outside).toHaveLength(4);
  for (const pts of Object.values(payload) as number[][][])
    for (const p of pts)
      for (const v of p) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
  expect(payload.outside[0][0]).toBeCloseTo(0.1, 2);
  expect(payload.inside[0][0]).toBeCloseTo(0.65, 2);
});
test("mobile dark workspace hides stale data when assignment is revoked", async ({
  page,
}) => {
  const f = await setup(page, "hostel_guard");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() =>
    localStorage.setItem("sentinel.theme", "dark"),
  );
  await visit(page, "residents");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByText("Test Resident", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/hostel-mobile-dark.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  f.revoke();
  await f.emit({
    type: "hostel.configuration_changed",
    data: { hostel_id: hid, message_id: "revoke-refresh" },
  });
  await expect(
    page.getByText("Your hostel assignment was revoked").first(),
  ).toBeVisible();
  await expect(page.getByText("Test Resident", { exact: true })).toHaveCount(0);
});
test("admin opens registry and complete overview within the existing console", async ({
  page,
}) => {
  await setup(page, "admin");
  await page.goto("/hostels");
  await expect(
    page.getByRole("button", { name: "Create hostel", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open hostel", exact: true }).click();
  await expect(
    page.getByText("Residents inside", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Policies", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Reports", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/hostel-desktop.png",
    fullPage: true,
  });
});
