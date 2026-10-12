import { useState } from "react";
import { ImageOff, Save, UserRound } from "lucide-react";
import { api, type Row, messageOf } from "../lib/api";
import { useResource } from "../lib/hooks";
import {
  dateTime,
  duration,
  profileChanges,
  profileFields,
  userName,
} from "../lib/domain";
import { useAuth } from "../state";
import { Button, Empty, ErrorBox, Field, Loading, Modal, Status } from "./ui";
export function SubjectModal({
  reference,
  onClose,
  onSaved,
  publicOnly = false,
}: {
  reference: string;
  onClose: () => void;
  onSaved?: () => void;
  publicOnly?: boolean;
}) {
  const { isAdmin, notice } = useAuth();
  const resource = useResource(
    (s) =>
      publicOnly ? api.publicPerson(reference, s) : api.subject(reference, s),
    `subject-${reference}-${publicOnly}`,
  );
  const [draft, setDraft] = useState<Row | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [imageFailed, setImageFailed] = useState(false);
  const profile = resource.data;
  const form = draft || profile || {};
  const editable = isAdmin && !publicOnly;
  function close() {
    if (busy) return;
    if (
      draft &&
      Object.keys(profileChanges(profile || {}, draft)).length &&
      !window.confirm("Discard unsaved profile changes?")
    )
      return;
    onClose();
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || busy) return;
    const body = profileChanges(profile, form);
    if (!Object.keys(body).length) {
      notice("No changes to save.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const updated = await api.updateSubject(reference, body);
      if (!updated?.person_id && !updated?.external_reference)
        throw new Error(
          "Incomplete profile response. Refresh to verify the changes.",
        );
      resource.setData({
        ...profile,
        ...updated,
        sightings: profile.sightings,
      });
      setDraft(null);
      notice("Subject profile updated.", "success");
      onSaved?.();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={publicOnly ? "Public person profile" : "Subject profile"}
      onClose={close}
      wide={!publicOnly}
    >
      <div className="modal-body">
        <ErrorBox message={resource.error} retry={resource.refresh} />
        {resource.loading && !profile ? (
          <Loading />
        ) : profile ? (
          <>
            <div className="subject-heading">
              <span className="profile-icon">
                <UserRound size={28} />
              </span>
              <div>
                <h3>{userName(profile)}</h3>
                <p>
                  {profile.external_reference || profile.roll_num || reference}{" "}
                  · {profile.branch || "Branch not recorded"}
                </p>
              </div>
              {!publicOnly && <Status value={profile.auth_status || "auto"} />}
            </div>
            {publicOnly ? (
              <dl className="details-list">
                <dt>Name</dt>
                <dd>{userName(profile)}</dd>
                <dt>Roll number</dt>
                <dd>{profile.roll_num || profile.roll || reference}</dd>
                <dt>Branch</dt>
                <dd>{profile.branch || "—"}</dd>
              </dl>
            ) : (
              <div className="subject-layout">
                <aside>
                  <div className="profile-image">
                    {profile.image_url && !imageFailed ? (
                      <img
                        src={profile.image_url}
                        alt="Subject reference"
                        onError={() => setImageFailed(true)}
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <Empty
                        title={
                          imageFailed
                            ? "Image unavailable"
                            : "No reference image"
                        }
                        icon={ImageOff}
                      />
                    )}
                  </div>
                  <dl className="details-list">
                    <dt>Visits</dt>
                    <dd>{profile.sighting_count ?? 0}</dd>
                    <dt>Face samples</dt>
                    <dd>{profile.embedding_count ?? 0}</dd>
                    <dt>First seen</dt>
                    <dd>{dateTime(profile.first_seen_at)}</dd>
                    <dt>Last seen</dt>
                    <dd>{dateTime(profile.last_seen_at)}</dd>
                  </dl>
                  <p className="muted small">
                    {editable
                      ? "Fill in details as they become available. Authorization status is managed by the existing recognition workflow."
                      : "This profile is read-only."}
                  </p>
                </aside>
                <div>
                  <form onSubmit={save}>
                    <ErrorBox message={error} />
                    <fieldset disabled={busy || !editable}>
                      <div className="form-grid">
                        {profileFields.map(([key, label, type]) => (
                          <Field key={key} label={label}>
                            {type === "textarea" ? (
                              <textarea
                                value={form[key] ?? ""}
                                rows={3}
                                onChange={(e) =>
                                  setDraft({ ...form, [key]: e.target.value })
                                }
                              />
                            ) : (
                              <input
                                type={type}
                                value={form[key] ?? ""}
                                onChange={(e) =>
                                  setDraft({ ...form, [key]: e.target.value })
                                }
                                min={
                                  key === "age"
                                    ? 5
                                    : key === "year_of_study"
                                      ? 1
                                      : undefined
                                }
                                max={
                                  key === "age"
                                    ? 120
                                    : key === "year_of_study"
                                      ? 10
                                      : undefined
                                }
                                maxLength={
                                  key === "full_name"
                                    ? 120
                                    : key === "pincode"
                                      ? 10
                                      : undefined
                                }
                                pattern={
                                  type === "tel"
                                    ? "\+?[1-9][0-9\s\-]{7,20}"
                                    : undefined
                                }
                              />
                            )}
                          </Field>
                        ))}
                      </div>
                    </fieldset>
                    {editable && (
                      <div className="form-actions">
                        <span className="muted small">
                          Clearing a field removes its saved value.
                        </span>
                        <Button variant="primary" disabled={busy} type="submit">
                          <Save size={16} />
                          {busy ? "Saving…" : "Save changes"}
                        </Button>
                      </div>
                    )}
                  </form>
                  <h3 className="section-label">Recent sightings</h3>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Camera</th>
                          <th>Entered</th>
                          <th>Left</th>
                          <th>Duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(profile.sightings || []).map(
                          (row: Row, i: number) => (
                            <tr key={row.event_id || i}>
                              <td>{row.camera_name || "—"}</td>
                              <td>{dateTime(row.started_at)}</td>
                              <td>
                                {row.ended_at
                                  ? dateTime(row.ended_at)
                                  : "On camera"}
                              </td>
                              <td>{duration(row.duration_seconds)}</td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                    {!profile.sightings?.length && (
                      <Empty title="No sightings recorded" />
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </Modal>
  );
}
