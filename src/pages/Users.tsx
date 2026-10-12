import { useState } from "react";
import { Link } from "react-router-dom";
import { KeyRound, Pencil, Save, Trash2, UserRound, Video } from "lucide-react";
import { api, type Row, messageOf } from "../lib/api";
import { useResource } from "../lib/hooks";
import { dateTime, userName } from "../lib/domain";
import { useAuth } from "../state";
import {
  Avatar,
  Badge,
  Button,
  Empty,
  ErrorBox,
  Field,
  Loading,
  Modal,
  PageTitle,
  Panel,
  Refresh,
  SearchBox,
} from "../components/ui";
function EditAccount({
  user,
  onClose,
  onSaved,
}: {
  user: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { notice } = useAuth();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = Object.fromEntries(new FormData(e.currentTarget));
    const body = {
      ...form,
      age: Number(form.age),
      is_active: form.is_active === "true",
      phone: String(form.phone).replace(/[\s-]/g, ""),
      email: String(form.email).trim().toLowerCase(),
      roll_num: String(form.roll_num).trim(),
    };
    setBusy(true);
    try {
      await api.updateUser(String(user.user_id), body);
      notice("Account updated.", "success");
      onSaved();
      onClose();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`Edit ${user.username}`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="modal-body" onSubmit={save}>
        <ErrorBox message={error} />
        <fieldset disabled={busy}>
          <div className="form-grid">
            {[
              ["full_name", "Full name", "text"],
              ["branch", "Branch", "text"],
              ["roll_num", "Roll number", "text"],
              ["age", "Age", "number"],
              ["email", "Email", "email"],
              ["phone", "Phone", "tel"],
            ].map(([key, label, type]) => (
              <Field key={key} label={label}>
                <input
                  name={key}
                  type={type}
                  required
                  defaultValue={
                    user[key] ??
                    (key === "full_name"
                      ? user.name
                      : key === "roll_num"
                        ? user.roll
                        : "")
                  }
                  min={key === "age" ? 13 : undefined}
                  max={key === "age" ? 120 : undefined}
                  minLength={
                    key === "full_name"
                      ? 3
                      : key === "branch" || key === "roll_num"
                        ? 2
                        : undefined
                  }
                  maxLength={
                    key === "full_name"
                      ? 50
                      : key === "roll_num"
                        ? 20
                        : undefined
                  }
                />
              </Field>
            ))}
            <Field label="Role">
              <select name="role" defaultValue={user.role || "member"}>
                <option value="member">Member</option>
                <option value="admin">Administrator</option>
                <option value="faculty">Faculty</option>
                <option value="hostel_warden">Hostel Warden</option>
                <option value="hostel_guard">Hostel Guard</option>
              </select>
            </Field>
            <Field label="Account status">
              <select
                name="is_active"
                defaultValue={String(user.is_active !== false)}
              >
                <option value="true">
                  Enabled (email verification required)
                </option>
                <option value="false">Inactive</option>
              </select>
            </Field>
          </div>
          <div className="form-actions">
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={busy}>
              <Save size={15} />
              {busy ? "Saving…" : "Save account"}
            </Button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
function CameraAccess({ user, onClose }: { user: Row; onClose: () => void }) {
  const { notice } = useAuth();
  const data = useResource(async (s) => {
    const [cameras, assigned] = await Promise.all([
      api.cameras(true, s),
      api.access(String(user.user_id), s),
    ]);
    return { cameras, assigned };
  }, `access-${user.user_id}`);
  const [draft, setDraft] = useState<string[] | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const selected = draft || data.data?.assigned || [];
  async function save() {
    if (busy || !data.data || data.error) return;
    setBusy(true);
    try {
      await api.saveAccess(String(user.user_id), selected);
      notice("Camera access saved.", "success");
      onClose();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Camera permissions"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="modal-body">
        <div className="subject-heading">
          <Avatar name={userName(user)} />
          <div>
            <h3>{userName(user)}</h3>
            <p>
              {user.username} · {user.roll_num || user.roll || "Member"}
            </p>
          </div>
        </div>
        <p className="muted">
          Select the cameras this member can view. Saving replaces their current
          camera assignments.
        </p>
        <ErrorBox message={data.error} retry={data.refresh} />
        <ErrorBox message={error} />
        {data.loading && !data.data ? (
          <Loading />
        ) : (
          <fieldset disabled={busy || !!data.error || !data.data}>
            <div className="permission-list">
              {data.data?.cameras.map((row) => (
                <label key={row.camera_id} className="permission-row">
                  <span className="permission-icon">
                    <Video size={21} />
                  </span>
                  <span>
                    <strong>{row.camera_name || row.camera_id}</strong>
                    <small>{row.camera_id}</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={selected.includes(String(row.camera_id))}
                    onChange={(e) =>
                      setDraft(
                        e.target.checked
                          ? [...selected, String(row.camera_id)]
                          : selected.filter((x) => x !== String(row.camera_id)),
                      )
                    }
                  />
                </label>
              ))}
              {!data.data?.cameras.length && (
                <Empty title="No active cameras available" />
              )}
            </div>
          </fieldset>
        )}
        <div className="form-actions">
          <span className="muted small">
            {selected.length} cameras selected
          </span>
          <Button
            variant="primary"
            onClick={save}
            disabled={busy || !data.data || !!data.error}
          >
            {busy ? "Saving…" : "Save permissions"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
function AccountDetail({ user, onClose }: { user: Row; onClose: () => void }) {
  return (
    <Modal title="Account details" onClose={onClose}>
      <div className="modal-body">
        <div className="subject-heading">
          <Avatar name={userName(user)} />
          <div>
            <h3>{userName(user)}</h3>
            <p>{user.username}</p>
          </div>
        </div>
        <dl className="details-list">
          {[
            ["Role", user.role],
            ["Roll number", user.roll_num || user.roll],
            ["Branch", user.branch],
            ["Age", user.age],
            ["Email", user.email],
            [
              "Email verification",
              user.email_verified ? "Verified" : "Pending — sign-in required",
            ],
            ["Phone", user.phone],
            ["Status", user.is_active === false ? "Inactive" : "Active"],
            ["Created", dateTime(user.created_at)],
            ["Last login", dateTime(user.last_login)],
          ].map(([key, value]) => (
            <div className="detail-pair" key={key}>
              <dt>{key}</dt>
              <dd>{value || "—"}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Modal>
  );
}
export function UsersPage() {
  const { notice } = useAuth();
  const [tab, setTab] = useState("members"),
    [search, setSearch] = useState(""),
    [edit, setEdit] = useState<Row | null>(null),
    [access, setAccess] = useState<Row | null>(null),
    [detail, setDetail] = useState<Row | null>(null),
    [remove, setRemove] = useState<Row | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const data = useResource(
    (s) => (tab === "members" ? api.members(s) : api.users(s)),
    `users-${tab}`,
  );
  const rows = (data.data || []).filter((row) =>
    `${userName(row)} ${row.username} ${row.roll_num || row.roll} ${row.branch} ${row.email}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  async function confirmDelete() {
    if (!remove || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.deleteUser(String(remove.user_id));
      setRemove(null);
      data.refresh();
      notice("Account removal request completed.", "success");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="ADMINISTRATION / ACCOUNTS"
        title="The right access. For every person."
        description="Manage registered accounts and assign camera access to members."
      >
        <Refresh onClick={data.refresh} loading={data.loading} />
      </PageTitle>
      <Panel
        title="Account directory"
        action={<Badge>{data.data?.length ?? "—"} accounts</Badge>}
      >
        <div className="filters">
          <div className="segmented compact">
            <button
              onClick={() => setTab("members")}
              className={tab === "members" ? "active" : ""}
            >
              Members
            </button>
            <button
              onClick={() => setTab("all")}
              className={tab === "all" ? "active" : ""}
            >
              All accounts
            </button>
          </div>
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search name, roll, email, or branch…"
          />
        </div>
        <ErrorBox message={data.error} retry={data.refresh} />
        {data.loading && !data.data ? (
          <Loading />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {[
                    "Account",
                    "Roll number",
                    "Branch",
                    "Email / phone",
                    "Role",
                    "Status",
                    "Created",
                    "Actions",
                  ].map((x) => (
                    <th key={x}>{x}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((user) => (
                  <tr key={user.user_id}>
                    <td>
                      <button
                        className="table-person"
                        onClick={() => setDetail(user)}
                      >
                        <Avatar name={userName(user)} />
                        <span>
                          <strong>{userName(user)}</strong>
                          <small>@{user.username}</small>
                        </span>
                      </button>
                    </td>
                    <td className="mono">
                      {user.roll_num || user.roll || "—"}
                    </td>
                    <td>{user.branch || "—"}</td>
                    <td>
                      <span>{user.email || "—"}</span>
                      <small className="table-sub">{user.phone || "—"}</small>
                    </td>
                    <td className="capitalize">{user.role || "member"}</td>
                    <td>
                      <Badge
                        tone={
                          user.is_active !== false && user.email_verified
                            ? "green"
                            : "neutral"
                        }
                      >
                        {user.is_active === false
                          ? "Inactive"
                          : user.email_verified
                            ? "Active"
                            : "Email pending"}
                      </Badge>
                    </td>
                    <td>{dateTime(user.created_at)}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          aria-label={`View ${user.username}`}
                          onClick={() => setDetail(user)}
                        >
                          <UserRound size={16} />
                        </button>
                        {user.role === "faculty" && (
                          <Link
                            className="button"
                            to="/classroom-admin/faculty"
                          >
                            Manage faculty
                          </Link>
                        )}
                        {user.role === "member" && (
                          <>
                            <button
                              aria-label={`Camera access for ${user.username}`}
                              title="Camera permissions"
                              onClick={() => setAccess(user)}
                            >
                              <KeyRound size={16} />
                            </button>
                            <button
                              aria-label={`Edit ${user.username}`}
                              title="Edit account"
                              onClick={() => setEdit(user)}
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              aria-label={`Remove ${user.username}`}
                              title="Remove account"
                              onClick={() => {
                                setError("");
                                setRemove(user);
                              }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && (
              <Empty
                title={
                  data.error ? "Accounts unavailable" : "No accounts found"
                }
              />
            )}
          </div>
        )}
        <footer className="table-footer">
          {rows.length} accounts shown · Administrator accounts are protected
          from editing in this console.
        </footer>
      </Panel>
      {edit && (
        <EditAccount
          user={edit}
          onClose={() => setEdit(null)}
          onSaved={data.refresh}
        />
      )}{" "}
      {access && <CameraAccess user={access} onClose={() => setAccess(null)} />}{" "}
      {detail && (
        <AccountDetail user={detail} onClose={() => setDetail(null)} />
      )}{" "}
      {remove && (
        <Modal
          title="Remove account?"
          onClose={() => {
            if (!busy) setRemove(null);
          }}
        >
          <div className="modal-body">
            <p>
              Send a removal request for <strong>{userName(remove)}</strong> (@
              {remove.username})?
            </p>
            <p className="muted">
              Your server determines whether the account is deleted or
              deactivated. This action may not be reversible.
            </p>
            <ErrorBox message={error} />
            <div className="form-actions">
              <Button disabled={busy} onClick={() => setRemove(null)}>
                Cancel
              </Button>
              <Button variant="danger" disabled={busy} onClick={confirmDelete}>
                {busy ? "Removing…" : "Confirm removal"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
export function MyProfile() {
  const { session } = useAuth();
  const data = useResource(
    (s) => api.profile(session!.user.username, s),
    "my-profile",
  );
  const user = data.data || session!.user;
  return (
    <>
      <PageTitle
        title="Your profile"
        description="Your account details and access level."
      />
      <Panel title="Account information">
        <div className="profile-page">
          <Avatar name={userName(user)} />
          <h2>{userName(user)}</h2>
          <Badge>{user.role}</Badge>
          <ErrorBox message={data.error} retry={data.refresh} />
          <dl className="details-list">
            {[
              ["Username", user.username],
              ["Roll number", user.roll_num || user.roll],
              ["Branch", user.branch],
              ["Email", user.email],
              [
                "Email verification",
                user.email_verified ? "Verified" : "Pending — sign-in required",
              ],
              ["Phone", user.phone],
              ["Age", user.age],
              ["Status", user.is_active === false ? "Inactive" : "Active"],
            ].map(([key, value]) => (
              <div className="detail-pair" key={key}>
                <dt>{key}</dt>
                <dd>{value || "—"}</dd>
              </div>
            ))}
          </dl>
          <p className="muted small">
            Contact your administrator to change account details or camera
            access.
          </p>
        </div>
      </Panel>
    </>
  );
}
