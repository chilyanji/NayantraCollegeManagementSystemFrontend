import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import {
  Activity,
  Bell,
  BookOpen,
  Building2,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings as SettingsIcon,
  ShieldCheck,
  UserRound,
  Users,
  Video,
  X,
  Radio,
} from "lucide-react";
import { AuthProvider, LiveProvider, useAuth, useLive } from "./state";
import { userName } from "./lib/domain";
import { Avatar, Badge, Button, Empty, Loading } from "./components/ui";
import { AuthPage } from "./pages/Auth";
import { Cameras, Overview } from "./pages/Overview";
import { Entries, Subjects } from "./pages/Entries";
import { MyProfile, UsersPage } from "./pages/Users";
import { ActivityPage } from "./pages/Activity";
import { Settings } from "./pages/Settings";
import { ClassroomProvider, useClassroom } from "./features/classroom/state";
import type { Capability } from "./features/classroom/types";
import {
  FacultyActivity,
  FacultyAlerts,
  FacultyAttendance,
  FacultyCameras,
  FacultyDashboard,
  FacultyEvidence,
  FacultyEvidenceDetail,
  FacultySession,
  FacultySessions,
} from "./pages/Faculty";
import { ClassroomAdmin } from "./pages/ClassroomAdmin";
import "./features/classroom/styles.css";
import { Hostels, HostelWorkspace } from "./pages/Hostels";
import { HostelLiveProvider } from "./features/hostel/state";
import "./features/hostel/styles.css";
function Protected() {
  const { session, ready } = useAuth();
  if (!ready) return <Loading />;
  if (!session) return <Navigate to="/login" replace />;
  if (
    !["admin", "member", "faculty", "hostel_warden", "hostel_guard"].includes(
      session.user.role,
    )
  )
    return <UnsupportedRole />;
  return (
    <LiveProvider key={session.token}>
      <ClassroomProvider>
        <HostelLiveProvider>
          <Layout />
        </HostelLiveProvider>
      </ClassroomProvider>
    </LiveProvider>
  );
}
function UnsupportedRole() {
  const { logout, session } = useAuth();
  return (
    <div className="access-denied">
      <Empty
        title="This role is not supported by the supplied frontend contract"
        detail={`Your account role is ${session?.user.role}. Ask your administrator to verify access.`}
      />
      <Button onClick={logout}>Sign out</Button>
    </div>
  );
}
function AdminOnly() {
  const { isAdmin } = useAuth();
  return isAdmin ? <Outlet /> : <HomeRedirect />;
}
function HomeRedirect() {
  const { session } = useAuth();
  return (
    <Navigate
      to={
        session?.user.role === "faculty"
          ? "/faculty"
          : session?.user.role.startsWith("hostel_")
            ? "/hostels"
            : "/overview"
      }
      replace
    />
  );
}
function FacultyOnly() {
  const { session, isAdmin } = useAuth();
  return isAdmin || session?.user.role === "faculty" ? (
    <Outlet />
  ) : (
    <HomeRedirect />
  );
}
function MonitoringOnly() {
  const { session } = useAuth();
  return ["admin", "member"].includes(session?.user.role) ? (
    <Outlet />
  ) : (
    <HomeRedirect />
  );
}
function HostelOnly() {
  const { session } = useAuth();
  return ["admin", "hostel_warden", "hostel_guard"].includes(
    session?.user.role,
  ) ? (
    <Outlet />
  ) : (
    <HomeRedirect />
  );
}
function PublicOnly() {
  const { session, ready } = useAuth();
  if (!ready) return <Loading />;
  return session ? <HomeRedirect /> : <Outlet />;
}
function Layout() {
  const { session, isAdmin, logout } = useAuth();
  const { can, adapter } = useClassroom();
  const isFaculty = session?.user.role === "faculty";
  const isHostel = session?.user.role.startsWith("hostel_");
  const roleLabel = isAdmin
    ? "Administrator"
    : isFaculty
      ? "Faculty"
      : isHostel
        ? session?.user.role === "hostel_warden"
          ? "Hostel Warden"
          : "Hostel Guard"
        : "Member";
  const home = isFaculty ? "/faculty" : isHostel ? "/hostels" : "/overview";
  const { health, socketState, events } = useLive();
  const [open, setOpen] = useState(false),
    [time, setTime] = useState(new Date());
  const location = useLocation();
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const facultyNavigation: {
    label: string;
    path: string;
    icon: typeof Video;
    capability: Capability;
  }[] = [
    {
      label: "Faculty dashboard",
      path: "/faculty",
      icon: LayoutDashboard,
      capability: "overview",
    },
    {
      label: "Sessions",
      path: "/faculty/sessions",
      icon: BookOpen,
      capability: "sessions",
    },
    {
      label: "Live camera",
      path: "/faculty/cameras",
      icon: Video,
      capability: "cameras",
    },
    {
      label: "Attendance",
      path: "/faculty/attendance",
      icon: Users,
      capability: "attendance",
    },
    {
      label: "Activity log",
      path: "/faculty/activity",
      icon: Activity,
      capability: "activity",
    },
    {
      label: "Alerts",
      path: "/faculty/alerts",
      icon: Bell,
      capability: "alerts",
    },
    {
      label: "Evidence",
      path: "/faculty/evidence",
      icon: ShieldCheck,
      capability: "evidence",
    },
  ];
  const nav = isHostel
    ? [{ label: "My hostels", path: "/hostels", icon: Building2 }]
    : isFaculty
      ? facultyNavigation.filter(
          (n) => can(n.capability) || (!adapter && n.path === "/faculty"),
        )
      : [
          { label: "Overview", path: "/overview", icon: LayoutDashboard },
          { label: "Camera console", path: "/cameras", icon: Video },
          ...(isAdmin
            ? [
                { label: "Entry log", path: "/entries", icon: BookOpen },
                {
                  label: "People directory",
                  path: "/subjects",
                  icon: UserRound,
                },
              ]
            : []),
          { label: "Activity", path: "/activity", icon: Activity },
        ];
  const admin = [
    ...(isAdmin
      ? [
          { label: "Accounts & access", path: "/users", icon: Users },
          { label: "Hostel management", path: "/hostels", icon: Building2 },
        ]
      : []),
    ...(isAdmin &&
    (!adapter ||
      [
        "manageFaculty",
        "manageClassrooms",
        "manageCourses",
        "manageSessions",
        "assignStudents",
        "assignCameras",
        "manageZones",
      ].some((capability) => can(capability as Capability)))
      ? [
          {
            label: "Classroom setup",
            path: "/classroom-admin/faculty",
            icon: BookOpen,
          },
        ]
      : []),
    { label: "My profile", path: "/profile", icon: UserRound },
    { label: "Settings", path: "/settings", icon: SettingsIcon },
  ];
  const title =
    [...nav, ...admin].find((n) => location.pathname === n.path)?.label ||
    (location.pathname.startsWith("/hostels/")
      ? "Hostel management"
      : "Workspace");
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {open && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <Link to={home} className="brand">
          <span className="brand-mark">
            <ShieldCheck size={25} />
          </span>
          <div>
            <b>SENTINEL</b>
            <small>SURVEILLANCE CONSOLE</small>
          </div>
        </Link>
        <button
          className="mobile-close icon-button"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        >
          <X />
        </button>
        <div className="workspace-card">
          <span className="workspace-avatar">S</span>
          <span>
            <strong>Sentinel workspace</strong>
            <small>
              {isAdmin
                ? "Administrator access"
                : isFaculty
                  ? "Faculty access"
                  : isHostel
                    ? roleLabel + " access"
                    : "Member access"}
            </small>
          </span>
          <ChevronRight size={15} />
        </div>
        <nav aria-label="Main navigation">
          <span className="nav-section">MONITORING</span>
          {nav.map((n) => (
            <NavLink
              key={n.path}
              to={n.path}
              end={n.path === "/faculty"}
              aria-label={n.label}
            >
              <n.icon size={19} />
              <span>{n.label}</span>
              {n.path === "/activity" && events.length > 0 && (
                <span className="nav-count">{events.length}</span>
              )}
            </NavLink>
          ))}
          <span className="nav-section">WORKSPACE</span>
          {admin.map((n) => (
            <NavLink key={n.path} to={n.path} aria-label={n.label}>
              <n.icon size={19} />
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="system-status">
            <span
              className={`status-light ${health.data?.status === "running" ? "online" : ""}`}
            />
            <div>
              <strong>
                {isHostel
                  ? "Hostel monitoring"
                  : isFaculty
                    ? "Classroom monitoring"
                    : health.error
                      ? "Service unavailable"
                      : health.data?.status === "running"
                        ? "AI service online"
                        : "AI service stopped"}
              </strong>
              <small>{socketState}</small>
            </div>
          </div>
          <div className="sidebar-user">
            <Avatar name={userName(session!.user)} />
            <div>
              <strong>{userName(session!.user)}</strong>
              <small>{roleLabel}</small>
            </div>
            <button aria-label="Sign out" title="Sign out" onClick={logout}>
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setOpen(true)}
            >
              <Menu />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-right">
            <time>
              {time.toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
              <span>{time.toLocaleTimeString()} local</span>
            </time>
            <span className="topbar-divider" />
            <Link
              className="notification-button"
              to={
                isHostel
                  ? "/hostels"
                  : isFaculty
                    ? "/faculty/alerts"
                    : "/activity"
              }
              aria-label="View notifications"
            >
              <Bell size={19} />
              {events.some((e) => e.type === "alert") && <i />}
            </Link>
            <Link
              className="profile-link"
              to="/profile"
              aria-label="Your profile"
            >
              <Avatar name={userName(session!.user)} />
            </Link>
          </div>
        </header>
        <main id="main" className="page-content">
          <Outlet />
        </main>
        <footer className="workspace-footer">
          <span>Sentinel · Connected awareness</span>
          <span>
            <Radio size={12} />
            {socketState}
          </span>
        </footer>
      </div>
    </div>
  );
}
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<PublicOnly />}>
            <Route path="/login" element={<AuthPage />} />
            <Route path="/register" element={<AuthPage register />} />
          </Route>
          <Route element={<Protected />}>
            <Route index element={<HomeRedirect />} />
            <Route element={<MonitoringOnly />}>
              <Route path="/overview" element={<Overview />} />
              <Route path="/cameras" element={<Cameras />} />
              <Route path="/activity" element={<ActivityPage />} />
            </Route>
            <Route element={<FacultyOnly />}>
              <Route path="/faculty" element={<FacultyDashboard />} />
              <Route path="/faculty/sessions" element={<FacultySessions />} />
              <Route
                path="/faculty/sessions/:sessionId"
                element={<FacultySession />}
              />
              <Route path="/faculty/cameras" element={<FacultyCameras />} />
              <Route
                path="/faculty/attendance"
                element={<FacultyAttendance />}
              />
              <Route path="/faculty/activity" element={<FacultyActivity />} />
              <Route path="/faculty/alerts" element={<FacultyAlerts />} />
              <Route path="/faculty/evidence" element={<FacultyEvidence />} />
              <Route
                path="/faculty/evidence/:evidenceId"
                element={<FacultyEvidenceDetail />}
              />
            </Route>
            <Route element={<HostelOnly />}>
              <Route path="/hostels" element={<Hostels />} />
              <Route
                path="/hostels/:hostelId/:section?"
                element={<HostelWorkspace />}
              />
            </Route>
            <Route path="/profile" element={<MyProfile />} />
            <Route path="/settings" element={<Settings />} />
            <Route element={<AdminOnly />}>
              <Route path="/entries" element={<Entries />} />
              <Route path="/subjects" element={<Subjects />} />
              <Route path="/users" element={<UsersPage />} />
              <Route
                path="/classroom-admin/:section"
                element={<ClassroomAdmin />}
              />
            </Route>
            <Route path="*" element={<HomeRedirect />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
