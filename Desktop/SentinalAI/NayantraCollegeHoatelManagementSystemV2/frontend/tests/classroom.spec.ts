import { test, expect, type Page, type WebSocketRoute } from "@playwright/test";
import path from "node:path";
const sid = "11111111-1111-4111-8111-111111111111",
  rid = "22222222-2222-4222-8222-222222222222";
const cid = "camera-one",
  eid = "33333333-3333-4333-8333-333333333333",
  aid = "44444444-4444-4444-8444-444444444444";
const date = new Date().toISOString().slice(0, 10);
const faculty = {
  user_id: 7,
  username: "faculty",
  full_name: "Test Faculty",
  role: "faculty",
  is_active: true,
  email: "faculty@example.test",
  phone: "+919876543210",
  age: 35,
  branch: "CSE",
  roll_num: "FAC-07",
  created_at: `${date}T07:00:00Z`,
};
const profile = {
  ...faculty,
  faculty_code: "FAC-07",
  department: "CSE",
  designation: "Professor",
  office: "A-101",
  last_login: null,
};
const camera = {
  camera_id: cid,
  camera_name: "Classroom camera",
  is_active: true,
};
const room = {
  classroom_id: rid,
  code: "CSE-201",
  name: "Classroom 201",
  building: "Block A",
  capacity: 60,
  camera_id: cid,
  camera_name: camera.camera_name,
  attendance_zone_id: "zone-1",
  attendance_zone_points: [
    [0.1, 0.1],
    [0.9, 0.1],
    [0.9, 0.9],
  ],
  is_active: true,
};
const slot = {
  session_id: sid,
  course_id: "course-1",
  course_code: "CS201",
  course_name: "Data Structures",
  classroom_id: rid,
  classroom_code: "CSE-201",
  classroom_name: "Classroom 201",
  camera_id: cid,
  faculty_user_id: 7,
  faculty_name: "Test Faculty",
  faculty_code: "FAC-07",
  weekday: 1,
  start_time: "10:00:00",
  end_time: "11:00:00",
  term_start: date,
  term_end: "2027-12-31",
  time_zone: "UTC",
  min_presence_minutes: 30,
  is_active: true,
  student_count: 2,
  is_live: true,
  next_occurrence: date,
};
const student = {
  person_id: "person-1",
  reference: "CS/001",
  roll_num: "CS/001",
  name: "Test Student",
  branch: "CSE",
  auth_status: "enrolled",
  added_at: `${date}T07:00:00Z`,
};
const alert = {
  alert_id: aid,
  alert_type: "early_exit",
  severity: "medium",
  status: "open",
  title: "Early exit",
  description: "Test Student left after 22 minutes",
  sound_required: false,
  created_at: `${date}T10:22:00Z`,
  session_id: sid,
  course_code: "CS201",
  occurrence_date: date,
  classroom_id: rid,
  classroom_code: "CSE-201",
  camera_id: cid,
  camera_name: camera.camera_name,
  faculty_user_id: 7,
  person_id: "person-1",
  person_ref: "CS/001",
  person_name: "Test Student",
  roll_number: "CS/001",
  evidence_id: eid,
};
const evidence = {
  evidence_id: eid,
  alert_id: aid,
  alert_status: "open",
  person_id: "person-1",
  student_name: "Test Student",
  roll_number: "CS/001",
  classroom_code: "CSE-201",
  course_code: "CS201",
  course_name: "Data Structures",
  session_id: sid,
  occurrence_date: date,
  exit_time: `${date}T10:22:00Z`,
  duration_seconds: 1320,
  camera_id: cid,
  camera_name: camera.camera_name,
  faculty_user_id: 7,
  created_at: `${date}T10:22:00Z`,
  expires_at: "2027-12-31T00:00:00Z",
  purged_at: null,
  has_snapshot: true,
  snapshot_url: "https://signed.example.test/evidence.jpg?signature=test",
};

async function setup(page: Page, role = "faculty", failResolve = false) {
  const calls: { method: string; path: string; body: any; auth?: string }[] =
    [];
  let ws: WebSocketRoute | undefined,
    resolved = false,
    students = [student];
  const user = { ...faculty, username: role, role };
  await page.routeWebSocket(/\/ws\/live/, (socket) => {
    ws = socket;
  });
  await page.route("https://signed.example.test/**", async (route) => {
    expect(route.request().headers().authorization).toBeUndefined();
    await route.fulfill({
      contentType: "image/jpeg",
      path: path.resolve("tests/camera-fixture.jpg"),
    });
  });
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      pathname = url.pathname.replace(/^\/api/, "");
    if (pathname.endsWith("/stream")) return route.continue();
    calls.push({
      method: req.method(),
      path: pathname + url.search,
      body: req.postDataJSON(),
      auth: req.headers().authorization,
    });
    const reply = (value: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(value),
      });
    if (pathname === "/login")
      return reply({ access_token: "test-token", user });
    if (pathname.startsWith("/users/")) return reply(user);
    if (pathname === "/faculty/me") return reply(profile);
    if (pathname === "/health") return reply({ database: "connected" });
    if (pathname === "/ai/health")
      return reply({ status: "running", scrfd: true, arcface: true });
    if (pathname === "/ai/cameras")
      return reply({
        cameras: [{ ...camera, running: true, connected: true }],
      });
    if (pathname === "/ai/detections") return reply({ detections: [] });
    if (pathname === "/admin/members") return reply([]);
    if (pathname === "/admin/users") return reply([faculty]);
    if (
      ["/faculty/cameras", "/admin/cameras", "/me/cameras"].includes(pathname)
    )
      return reply([camera]);
    if (pathname === "/admin/members/7/cameras")
      return reply({ camera_ids: [cid] });
    if (pathname === "/admin/faculty")
      return reply(
        req.method() === "POST" ? profile : [profile],
        req.method() === "POST" ? 201 : 200,
      );
    if (pathname === "/admin/courses")
      return reply([
        {
          course_id: "course-1",
          code: "CS201",
          name: "Data Structures",
          department: "CSE",
          is_active: true,
        },
      ]);
    if (["/admin/classrooms", "/faculty/classes"].includes(pathname))
      return reply([room]);
    if (pathname === `/admin/classrooms/${rid}/attendance-zone`)
      return reply({
        ...room,
        attendance_zone_points: req.postDataJSON().points,
      });
    if (["/faculty/sessions", "/admin/sessions"].includes(pathname))
      return reply(req.method() === "POST" ? slot : [slot]);
    if (
      [`/faculty/sessions/${sid}`, `/admin/sessions/${sid}`].includes(pathname)
    )
      return reply({ ...slot, students });
    if (pathname === `/faculty/sessions/${sid}/attendance`)
      return reply({
        session_id: sid,
        course_code: "CS201",
        course_name: "Data Structures",
        classroom_code: "CSE-201",
        occurrence_date: date,
        occurrences: [],
        summary: {
          on_list: 2,
          present: 1,
          absent: 1,
          inside_now: 1,
          early_exits: 0,
          not_on_list: 0,
        },
        records: [
          {
            person_id: "person-1",
            person_ref: "CS/001",
            name: "Test Student",
            roll_number: "CS/001",
            branch: "CSE",
            state: "inside",
            status: "present",
            first_in_at: `${date}T10:00:00Z`,
            last_in_at: `${date}T10:30:00Z`,
            last_out_at: `${date}T10:22:00Z`,
            entries: 2,
            total_inside_seconds: 1800,
            on_list: true,
          },
        ],
      });
    if (pathname === `/faculty/sessions/${sid}/attendance/events`)
      return reply({
        session_id: sid,
        occurrence_date: date,
        events: ["in", "out", "in", "out"].map((direction, i) => ({
          attendance_event_id: i + 1,
          direction,
          occurred_at: `${date}T10:${String(i * 10).padStart(2, "0")}:00Z`,
          duration_seconds: direction === "out" ? 600 : null,
          in_event_id: null,
          auth_result: "authorized",
          person_id: "person-1",
          person_ref: "CS/001",
          name: "Test Student",
          roll_number: "CS/001",
        })),
      });
    if (pathname === "/faculty/alerts") return reply(resolved ? [] : [alert]);
    if (pathname === "/faculty/evidence")
      return reply(
        resolved && url.searchParams.get("include_closed") !== "true"
          ? []
          : [
              {
                ...evidence,
                alert_status: resolved ? "resolved" : "open",
                has_snapshot: !resolved,
              },
            ],
      );
    if (pathname === `/faculty/evidence/${eid}`)
      return reply({
        ...evidence,
        alert_status: resolved ? "resolved" : "open",
        has_snapshot: !resolved,
        snapshot_url: resolved ? null : evidence.snapshot_url,
      });
    if (pathname.endsWith("/resolve")) {
      if (failResolve)
        return reply({ detail: "Resolve denied by server" }, 403);
      resolved = true;
      return reply({
        ...evidence,
        alert_status: "resolved",
        has_snapshot: false,
      });
    }
    if (pathname === "/subjects")
      return reply(
        [
          student,
          {
            ...student,
            person_id: "person-2",
            external_reference: "CS/002",
            roll_num: "CS/002",
            full_name: "Second Student",
          },
        ].map((s) => ({
          ...s,
          external_reference:
            "external_reference" in s ? s.external_reference : s.reference,
          full_name: "full_name" in s ? s.full_name : s.name,
        })),
      );
    if (pathname === `/admin/sessions/${sid}/students`) {
      const references = req.postDataJSON().references;
      students = references.map((reference: string) => ({
        ...student,
        reference,
        roll_num: reference,
      }));
      return reply({
        session_id: sid,
        assigned: students.length,
        not_found: [],
        students,
      });
    }
    return reply({ detail: `Unexpected test request: ${pathname}` }, 404);
  });
  return {
    calls,
    emit: (type: string, data: object) =>
      ws!.send(
        JSON.stringify({
          type,
          data: {
            camera_id: cid,
            session_id: sid,
            faculty_user_id: 7,
            ...data,
          },
        }),
      ),
  };
}
async function signIn(page: Page, role = "faculty") {
  await page.goto("/login");
  await page
    .getByRole("button", {
      name:
        role === "faculty"
          ? "Faculty"
          : role === "admin"
            ? "Administrator"
            : "Member",
      exact: true,
    })
    .click();
  await page.getByLabel("Username", { exact: true }).fill(role);
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page).toHaveURL(
    role === "faculty" ? /\/faculty$/ : /\/overview$/,
  );
}

test("faculty isolation, assigned camera, repeated movements and server-scoped requests", async ({
  page,
}) => {
  const mock = await setup(page);
  await signIn(page);
  await expect(
    page.getByRole("heading", { name: "Your classroom, at a glance." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Sessions", exact: true }).click();
  await page.getByRole("link", { name: "Open session", exact: true }).click();
  await expect(
    page.getByAltText("Live view of Classroom camera"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "IN / OUT history", exact: true }),
  ).toBeVisible();
  const history = page.locator("section").filter({
    has: page.getByRole("heading", { name: "IN / OUT history", exact: true }),
  });
  await expect(history.locator("tbody tr")).toHaveCount(4);
  expect(
    mock.calls.filter(
      (c) => c.path.startsWith("/admin/") || c.path === "/ai/detections",
    ),
  ).toEqual([]);
  await page.goto("/users");
  await expect(page).toHaveURL(/\/faculty$/);
});

test("early-exit notification is silent, paired notifications deduplicate, escalation sounds", async ({
  page,
}) => {
  const mock = await setup(page);
  await page.addInitScript(() => {
    const original = AudioContext.prototype.createOscillator;
    (window as any).__sounds = 0;
    AudioContext.prototype.createOscillator = function () {
      (window as any).__sounds++;
      return original.call(this);
    };
  });
  await signIn(page);
  await page.getByRole("button", { name: "Enable alert sound" }).click();
  await expect(
    page.getByText("Alert sound enabled", { exact: true }),
  ).toBeVisible();
  const data = {
    alert_id: aid,
    alert_type: "early_exit",
    title: "Early exit fixture",
    sound_required: true,
    person_name: "Test Student",
  };
  mock.emit("attendance.early_exit", data);
  mock.emit("alert.created", data);
  await expect(page.locator(".classroom-notices .toast")).toHaveCount(1);
  expect(await page.evaluate(() => (window as any).__sounds)).toBe(0);
  mock.emit("evidence.created", {
    alert_id: aid,
    evidence_id: eid,
    sound_required: false,
  });
  await expect(
    page
      .locator(".classroom-notices")
      .getByRole("link", { name: "View evidence" }),
  ).toBeVisible();
  mock.emit("attendance.unidentified_person", {
    alert_id: "unknown-1",
    alert_type: "unidentified_person",
    sound_required: false,
  });
  mock.emit("attendance.unauthorized_entry", {
    alert_id: "unknown-1",
    alert_type: "unauthorized_entry",
    sound_required: true,
    escalated: true,
  });
  mock.emit("alert.updated", {
    alert_id: "unknown-1",
    alert_type: "unauthorized_entry",
    sound_required: true,
    escalated: true,
  });
  await expect
    .poll(() => page.evaluate(() => (window as any).__sounds))
    .toBe(1);
});

test("evidence resolve waits for success and keeps movement history", async ({
  page,
}) => {
  const mock = await setup(page);
  await signIn(page);
  await page.goto(`/faculty/evidence/${eid}`);
  await expect(page.getByAltText("Evidence for CS/001")).toBeVisible();
  await page
    .getByRole("button", { name: "Resolve evidence", exact: true })
    .click();
  expect(mock.calls.filter((c) => c.method === "PATCH")).toHaveLength(0);
  await page.getByRole("button", { name: "Confirm resolve" }).click();
  await expect(
    page.getByText("Snapshot unavailable", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await page
    .getByRole("link", { name: "Back to evidence box", exact: false })
    .click();
  await expect(
    page.getByText("No active evidence", { exact: true }),
  ).toBeVisible();
  expect(mock.calls.find((c) => c.method === "PATCH")?.auth).toBe(
    "Bearer test-token",
  );
});

test("failed resolve retains the evidence and shows the server error", async ({
  page,
}) => {
  await setup(page, "faculty", true);
  await signIn(page);
  await page.goto(`/faculty/evidence/${eid}`);
  await page
    .getByRole("button", { name: "Resolve evidence", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm resolve" }).click();
  await expect(page.getByText("Resolve denied by server")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByAltText("Evidence for CS/001")).toBeVisible();
});

test("admin weekly session form sends the actual backend schema", async ({
  page,
}) => {
  const mock = await setup(page, "admin");
  await signIn(page, "admin");
  await page.goto("/classroom-admin/sessions");
  await page.getByRole("button", { name: "Create session" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Faculty", { exact: true }).selectOption("7");
  await form.getByLabel("Classroom", { exact: true }).selectOption(rid);
  await form.getByLabel("Course", { exact: true }).selectOption("course-1");
  await form.getByLabel("Weekday").selectOption("2");
  await form.getByLabel("Start time", { exact: true }).fill("10:00");
  await form.getByLabel("End time", { exact: true }).fill("11:00");
  await form.getByLabel("Term start").fill(date);
  await form.getByLabel("Term end").fill("2027-12-31");
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(form).not.toBeVisible();
  const saved = mock.calls.find(
    (c) => c.method === "POST" && c.path === "/admin/sessions",
  )!;
  expect(saved.body).toMatchObject({
    faculty_user_id: 7,
    classroom_id: rid,
    weekday: 2,
    time_zone: "Asia/Kolkata",
    min_presence_minutes: 30,
  });
  expect(saved.body.camera_id).toBeUndefined();
  expect(saved.body.starts_at).toBeUndefined();
});

test("admin student references and normalized classroom zones", async ({
  page,
}) => {
  const mock = await setup(page, "admin");
  await signIn(page, "admin");
  await page.goto("/classroom-admin/students");
  await page.getByLabel("Session", { exact: true }).selectOption(sid);
  await page.getByLabel("Second Student · CS/002").check();
  await page.getByRole("button", { name: "Save assignments" }).click();
  await expect
    .poll(
      () =>
        mock.calls.filter(
          (c) => c.method === "PUT" && c.path.endsWith("/students"),
        ).length,
    )
    .toBe(1);
  expect(
    mock.calls.find((c) => c.method === "PUT" && c.path.endsWith("/students"))
      ?.body,
  ).toEqual({ references: ["CS/001", "CS/002"] });
  await page.goto("/classroom-admin/zones");
  await page.getByRole("button", { name: "Edit zone" }).click();
  await expect(
    page.getByAltText("Camera frame for attendance zone"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save zone", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(
    mock.calls.find((c) => c.path.endsWith("/attendance-zone"))?.body,
  ).toEqual({
    points: [
      [0.1, 0.1],
      [0.9, 0.1],
      [0.9, 0.9],
    ],
  });
});

test("faculty light/dark and tablet views preserve the original shell", async ({
  page,
}) => {
  await setup(page);
  await signIn(page);
  await expect(page.getByRole("link", { name: "Open session" })).toBeVisible();
  await page.screenshot({
    path: "test-results/faculty-light-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });
  await page.screenshot({
    path: "test-results/faculty-dark-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto("/faculty/attendance");
  await page.getByLabel("Session", { exact: true }).selectOption(sid);
  await expect(page.getByText("Test Student", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/faculty-tablet.png",
    fullPage: true,
  });
});
