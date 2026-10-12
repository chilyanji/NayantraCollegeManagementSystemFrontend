import { test, expect, type Page, type WebSocketRoute } from "@playwright/test";
const admin = {
  user_id: 1,
  username: "admin",
  full_name: "Saurabh Kumar",
  role: "admin",
  is_active: true,
  roll_num: "ADM/01",
  branch: "CSE",
  age: 20,
  email: "admin@example.com",
  phone: "+919876543210",
  created_at: "2026-09-01T08:00:00Z",
};
const member = {
  ...admin,
  user_id: 2,
  username: "member",
  role: "member",
  full_name: "Avery Sharma",
  roll_num: "CS/001",
  email: "avery@example.com",
};
const cameras = [
  {
    camera_id: "camera-one",
    camera_name: "Main Entrance",
    location_name: "Ground floor",
  },
  {
    camera_id: "camera-two",
    camera_name: "East Corridor",
    location_name: "First floor",
  },
];
const subject = {
  person_id: "person-one",
  external_reference: "CS/001",
  full_name: "Avery Sharma",
  auth_status: "enrolled",
  branch: "CSE",
  course: "B.Tech",
  age: 20,
  year_of_study: 2,
  email: "avery@example.com",
  phone: "+919876543210",
  sighting_count: 4,
  embedding_count: 3,
  has_profile: true,
  sightings: [
    {
      event_id: "event-one",
      camera_name: "Main Entrance",
      started_at: "2026-09-13T08:00:00Z",
      ended_at: "2026-09-13T08:01:30Z",
      duration_seconds: 90,
    },
  ],
};
const entries = [
  {
    ...subject,
    visit_count: 4,
    first_entry: "2026-09-13T08:00:00Z",
    last_entry: "2026-09-13T09:00:00Z",
    last_camera: "Main Entrance",
    total_seconds: 150,
    on_camera_now: true,
    has_profile_flag: true,
  },
  {
    person_id: "person-two",
    external_reference: "SUB-000002",
    full_name: null,
    auth_status: "auto",
    visit_count: 2,
    last_camera: "East Corridor",
    total_seconds: 32,
  },
];
async function setup(page: Page, role = "admin", offline = false) {
  let activeSubject = { ...subject };
  const calls: {
    method: string;
    path: string;
    body: any;
    auth: string | undefined;
  }[] = [];
  let socket: WebSocketRoute | undefined;
  await page.routeWebSocket(/\/ws\/live/, (ws) => {
    socket = ws;
  });
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    const path = decodeURIComponent(url.pathname.replace(/^\/api/, ""));
    if (path.includes("/stream")) {
      await route.continue();
      return;
    }
    calls.push({
      method: req.method(),
      path: url.pathname + url.search,
      body: req.postDataJSON(),
      auth: req.headers().authorization,
    });
    const reply = (body: any, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (offline && path.startsWith("/ai/"))
      return reply({ detail: "AI service unavailable" }, 503);
    if (path === "/login")
      return reply({
        access_token: "test-token",
        user: role === "member" ? member : admin,
      });
    if (path === "/register") return reply(member, 201);
    if (path.startsWith("/username-available/"))
      return reply({ available: true });
    if (path === "/health") return reply({ database: "connected" });
    if (path.startsWith("/users/"))
      return reply(role === "member" ? member : admin);
    if (path === "/ai/health")
      return reply({
        status: "running",
        scrfd: true,
        arcface: true,
        camera: true,
      });
    if (path === "/ai/camera/status")
      return reply({ running: true, connected: true, camera_id: "camera-one" });
    if (["/ai/start", "/ai/stop"].includes(path))
      return reply({ status: "ok" });
    if (path === "/ai/detections")
      return reply({
        detections: [
          {
            person_id: "CS/001",
            display_name: "Avery Sharma",
            branch: "CSE",
            decided: true,
            matched: true,
            status: "enrolled",
            recognition_confidence: 0.93,
          },
          {
            person_id: "SUB-000002",
            decided: true,
            matched: false,
            status: "auto",
            recognition_confidence: 0.32,
          },
          { person_id: "not-yet-decided", decided: false, matched: false },
        ],
      });
    if (path === "/admin/cameras" || path === "/me/cameras")
      return reply({
        cameras: role === "member" ? cameras.slice(0, 1) : cameras,
      });
    if (path === "/admin/members") return reply([member]);
    if (path === "/admin/users") return reply({ users: [admin, member] });
    if (path === "/admin/users/2")
      return reply({ ...member, ...req.postDataJSON() });
    if (path === "/admin/members/2/cameras")
      return reply({
        camera_ids:
          req.method() === "PUT"
            ? req.postDataJSON().camera_ids
            : ["camera-one"],
      });
    if (path === "/subjects") return reply([activeSubject, entries[1]]);
    if (path.startsWith("/subjects/"))
      return reply(
        path.endsWith("CS/001")
          ? activeSubject
          : { ...activeSubject, ...entries[1], sightings: [] },
      );
    if (path.startsWith("/persons/"))
      return reply({ name: "Avery Sharma", roll_num: "CS/001", branch: "CSE" });
    if (path.startsWith("/admin/subjects/")) {
      activeSubject = { ...activeSubject, ...req.postDataJSON() };
      return reply(activeSubject);
    }
    if (path === "/entries")
      return reply({
        entries,
        summary: {
          subjects: 2,
          visits: 6,
          authorised: 1,
          unauthorised: 1,
          on_camera_now: 1,
        },
      });
    if (path === "/entries/export")
      return route.fulfill({
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        body: Buffer.from("PK\u0003\u0004TEST-EXPORT"),
      });
    return reply({ detail: "Not found" }, 404);
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return {
    calls,
    errors,
    send: (message: any) => socket?.send(JSON.stringify(message)),
    closeSocket: () => socket?.close({ code: 1011, reason: "Test disconnect" }),
  };
}
async function signIn(page: Page, role = "admin") {
  await page.goto("/login");
  await page
    .getByRole("button", {
      name: role === "admin" ? "Administrator" : "Member",
      exact: true,
    })
    .click();
  await page.getByLabel("Username", { exact: true }).fill(role);
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(
    page.getByRole("heading", { name: "Your watch, at a glance." }),
  ).toBeVisible();
}
test("administrator workspace, live MJPEG, focus view, pause and snapshot", async ({
  page,
}) => {
  const mock = await setup(page);
  await signIn(page);
  await expect(page.getByAltText("Live view of Main Entrance")).toBeVisible();
  await expect(page.getByText("not-yet-decided")).toHaveCount(0);
  await page.getByRole("button", { name: "Focus view" }).click();
  await expect(page.getByAltText("Live view of East Corridor")).toHaveCount(0);
  await page.getByLabel("Select camera").selectOption("camera-two");
  await expect(page.getByAltText("Live view of East Corridor")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save snapshot" }).click();
  expect((await download).suggestedFilename()).toContain(".jpg");
  await page.getByRole("button", { name: "Pause stream" }).click();
  await expect(page.getByText("Stream paused", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Resume stream" }).click();
  await expect(page.getByAltText("Live view of East Corridor")).toBeVisible();
  await page.getByRole("button", { name: "Expand camera" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(mock.errors).toEqual([]);
});
test("subject edit preserves all fields and explicitly clears email", async ({
  page,
}) => {
  const mock = await setup(page);
  await signIn(page);
  await page
    .getByRole("link", { name: "People directory", exact: true })
    .click();
  await page.getByRole("button", { name: "AS Avery Sharma" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Subject profile",
    exact: true,
  });
  await expect(dialog.getByLabel("Guardian phone")).toBeVisible();
  await dialog.getByLabel("Email", { exact: true }).fill("");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Subject profile updated.")).toBeVisible();
  const put = mock.calls.find(
    (c) => c.method === "PUT" && c.path.includes("/admin/subjects/"),
  );
  expect(put?.body).toEqual({ email: null });
  expect(put?.path).toContain("CS%2F001");
  await expect(dialog.getByText("1m 30s")).toBeVisible();
  expect(mock.errors).toEqual([]);
});
test("entry register filters, detail selection, live reload and authenticated export", async ({
  page,
}) => {
  const mock = await setup(page);
  await signIn(page);
  await page.getByRole("link", { name: "Entry log", exact: true }).click();
  await page.getByLabel("Entry period").selectOption("week");
  await page.getByLabel("Entry status").selectOption("authorised");
  await page
    .getByPlaceholder("Search name, roll number, or branch…")
    .fill("CS/001 & Avery");
  await expect
    .poll(() =>
      mock.calls.some((c) => c.path.includes("search=CS%2F001+%26+Avery")),
    )
    .toBe(true);
  const d = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Excel" }).click();
  expect((await d).suggestedFilename()).toMatch(
    /sentinel-entries-week.*\.xlsx/,
  );
  const exportCall = mock.calls.find((c) => c.path.includes("/entries/export"));
  expect(exportCall?.auth).toBe("Bearer test-token");
  expect(exportCall?.path).toContain("status=authorised");
  await page.getByRole("button", { name: /Avery Sharma/ }).click();
  await expect(
    page.getByRole("heading", { name: "Selected person" }),
  ).toBeVisible();
  const before = mock.calls.filter((c) =>
    c.path.startsWith("/api/entries?"),
  ).length;
  mock.send({
    type: "sighting",
    data: { event_id: "new-event", description: "Person entered" },
  });
  await expect
    .poll(
      () => mock.calls.filter((c) => c.path.startsWith("/api/entries?")).length,
    )
    .toBeGreaterThan(before);
  expect(mock.errors).toEqual([]);
});
test("camera permissions, account update and deletion contract", async ({
  page,
}) => {
  const mock = await setup(page);
  await signIn(page);
  await page
    .getByRole("link", { name: "Accounts & access", exact: true })
    .click();
  await page.getByRole("button", { name: "Camera access for member" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/East Corridor/).check();
  await dialog.getByRole("button", { name: "Save permissions" }).click();
  await expect(page.getByText("Camera access saved.")).toBeVisible();
  expect(
    mock.calls.find((c) => c.method === "PUT" && c.path.endsWith("/2/cameras"))
      ?.body,
  ).toEqual({ camera_ids: ["camera-one", "camera-two"] });
  await page.getByRole("button", { name: "Edit member" }).click();
  await page.getByRole("dialog").getByLabel("Full name").fill("Avery Updated");
  await page.getByRole("button", { name: "Save account" }).click();
  await expect(page.getByText("Account updated.")).toBeVisible();
  expect(
    mock.calls.find(
      (c) => c.method === "PUT" && c.path.endsWith("/admin/users/2"),
    )?.body.full_name,
  ).toBe("Avery Updated");
  await page.getByRole("button", { name: "All accounts", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit admin", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Remove member" }).click();
  await page.getByRole("button", { name: "Confirm removal" }).click();
  await expect
    .poll(() =>
      mock.calls.some(
        (c) => c.method === "DELETE" && c.path.endsWith("/admin/users/2"),
      ),
    )
    .toBe(true);
});
test("member gets assigned cameras and only the public person profile", async ({
  page,
}) => {
  const mock = await setup(page, "member");
  await signIn(page, "member");
  await expect(
    page.getByRole("link", { name: "Accounts & access" }),
  ).toHaveCount(0);
  await expect(page.getByAltText("Live view of Main Entrance")).toBeVisible();
  await page.getByRole("button", { name: /Avery Sharma.*CS\/001/ }).click();
  const dialog = page.getByRole("dialog", { name: "Public person profile" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("CSE", { exact: true })).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Save changes" }),
  ).toHaveCount(0);
  expect(mock.calls.some((c) => c.path.startsWith("/api/persons/"))).toBe(true);
  expect(mock.calls.some((c) => c.path.startsWith("/api/subjects/"))).toBe(
    false,
  );
  await page.keyboard.press("Escape");
  await page.goto("/users");
  await expect(page).toHaveURL(/overview/);
  expect(mock.calls.some((c) => c.path.startsWith("/api/admin/"))).toBe(false);
});
test("offline AI is explicit and creates no fake detections", async ({
  page,
}) => {
  const mock = await setup(page, "admin", true);
  await signIn(page);
  await expect(
    page.getByText("AI service unavailable", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("Avery Sharma", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("Detection data unavailable").first(),
  ).toBeVisible();
  expect(mock.errors).toEqual([]);
});
test("mobile layout, theme persistence and connection test without implicit save", async ({
  page,
}) => {
  const mock = await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByLabel("Workspace theme").selectOption("dark");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByLabel("API base URL").fill("/other");
  await page.route("**/other/health", (route) =>
    route.fulfill({ json: { database: "connected" } }),
  );
  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(
    page.getByText("Server reachable · Database: connected"),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("sentinel.api")),
  ).toBeNull();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(mock.errors).toEqual([]);
});
test("sign-out closes real-time connection and protected routes redirect", async ({
  page,
}) => {
  await setup(page);
  await signIn(page);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/login/);
  await page.goto("/entries");
  await expect(page).toHaveURL(/login/);
});
test("registration sends a member registration payload with matching passwords", async ({
  page,
}) => {
  const mock = await setup(page);
  await page.goto("/register");
  await page.getByLabel("Username", { exact: true }).fill("newmember");
  await page.getByLabel("Full name").fill("New Member");
  await page.getByLabel("Branch", { exact: true }).selectOption("CSE");
  await page.getByLabel("Roll number").fill("CS/002");
  await page.getByLabel("Age", { exact: true }).fill("20");
  await page.getByLabel("Email", { exact: true }).fill("new@example.com");
  await page.getByLabel("Phone", { exact: true }).fill("+91 98765 43210");
  await page.getByLabel("Password", { exact: true }).fill("secret123456789");
  await page.getByLabel("Confirm password").fill("secret123456789");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/login/);
  const call = mock.calls.find((c) => c.path === "/api/register");
  expect(call?.body.phone).toBe("+919876543210");
  expect(call?.body.re_enter_password).toBe("secret123456789");
  expect(call?.body.role).toBeUndefined();
});
test("expired session redirects to login without a render crash", async ({
  page,
}) => {
  await setup(page);
  await signIn(page);
  await page.route("**/api/subjects", (route) =>
    route.fulfill({ status: 401, json: { detail: "Session expired" } }),
  );
  await page
    .getByRole("link", { name: "People directory", exact: true })
    .click();
  await expect(page).toHaveURL(/login/);
  await expect(
    page.getByText("Your session has expired. Please sign in again."),
  ).toBeVisible();
});
test("websocket alert is deduplicated and disconnect switches to polling", async ({
  page,
}) => {
  const mock = await setup(page);
  await signIn(page);
  const event = {
    type: "alert",
    data: {
      alert_id: "alert1",
      description: "Test live alert",
      camera_name: "Main Entrance",
      severity: "high",
    },
  };
  mock.send(event);
  mock.send(event);
  await page.getByRole("link", { name: "Activity", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("Test live alert");
  mock.closeSocket();
  await expect(page.getByText("Polling · reconnecting").first()).toBeVisible();
});
test("capture representative desktop and mobile screens", async ({ page }) => {
  await setup(page);
  await signIn(page);
  await expect(page.getByAltText("Live view of Main Entrance")).toBeVisible();
  await page.screenshot({
    path: "test-results/overview-desktop.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Entry log", exact: true }).click();
  await expect(page.getByText("Entry register", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/entries-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/overview");
  await expect(
    page.getByRole("heading", { name: "Your watch, at a glance." }),
  ).toBeVisible();
  await expect(page.getByAltText("Live view of Main Entrance")).toBeVisible();
  await page.screenshot({
    path: "test-results/overview-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
