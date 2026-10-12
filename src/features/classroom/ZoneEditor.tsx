import { useEffect, useRef, useState } from "react";
import { Button, Empty, ErrorBox, Field, Modal } from "../../components/ui";
import { useResource } from "../../lib/hooks";
import { messageOf } from "../../lib/api";
import { useClassroom } from "./state";
import { ResourceState } from "./components";
import { polygonError } from "./geometry";
import type { Point, ZoneView } from "./types";

export function ZoneEditor({
  zone,
  onClose,
}: {
  zone: ZoneView | null;
  onClose: () => void;
}) {
  const { adapter, refresh } = useClassroom();
  const options = useResource((s) => adapter!.formOptions(s), "zone-options");
  const [classroomId, setClassroomId] = useState(zone?.classroomId ?? "");
  const cameraId = options.data?.classroomCameras[classroomId]?.id || "";
  const name = zone?.name || "Attendance zone";
  const [points, setPoints] = useState<Point[]>(zone?.points ?? []);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [hasFrame, setHasFrame] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const invalid = polygonError(points);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (pending.current || !adapter?.saveZone || !cameraId || !hasFrame) return;
    const c = new AbortController();
    pending.current = c;
    setBusy(true);
    setError("");
    try {
      await adapter.saveZone(
        zone?.id ?? null,
        { name, cameraId, classroomId, points },
        c.signal,
      );
      if (!c.signal.aborted) {
        refresh();
        onClose();
      }
    } catch (err) {
      if (!c.signal.aborted) setError(messageOf(err));
    } finally {
      if (!c.signal.aborted) {
        pending.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <Modal
      title={zone ? "Edit attendance zone" : "Configure attendance zone"}
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <form className="modal-body" onSubmit={save}>
        <ErrorBox message={error} />
        <ResourceState resource={options}>
          <fieldset disabled={busy || !options.data || !!options.error}>
            <div className="form-grid">
              <Field label="Classroom">
                <select
                  required
                  value={classroomId}
                  disabled={!!zone}
                  onChange={(e) => {
                    setClassroomId(e.target.value);
                    setPoints([]);
                    setHasFrame(false);
                  }}
                >
                  <option value="">Select a classroom</option>
                  {options.data?.classrooms.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Assigned camera">
                <input
                  readOnly
                  value={
                    options.data?.classroomCameras[classroomId]?.label ||
                    "Assign a classroom camera first"
                  }
                />
              </Field>
            </div>
            <p>
              Click around the attendance area in the frame. Points follow the
              original image dimensions.
            </p>
            {cameraId ? (
              <ZoneFrame
                key={cameraId}
                cameraId={cameraId}
                points={points}
                onChange={setPoints}
                onReady={setHasFrame}
                disabled={busy}
              />
            ) : (
              <Empty title="Select a camera to load its frame" />
            )}
            <div className="actions">
              <Button
                type="button"
                disabled={!points.length}
                onClick={() => setPoints((v) => v.slice(0, -1))}
              >
                Undo point
              </Button>
              <Button
                type="button"
                disabled={!points.length}
                onClick={() => setPoints([])}
              >
                Clear points
              </Button>
            </div>
            <div className="classroom-coordinates">
              {points.map((point, i) => (
                <div className="classroom-row" key={i}>
                  <span>Point {i + 1}</span>
                  {(["x", "y"] as const).map((axis) => (
                    <Field key={axis} label={`${axis.toUpperCase()} ${i + 1}`}>
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.001"
                        required
                        value={point[axis]}
                        onChange={(e) =>
                          setPoints((v) =>
                            v.map((p, n) =>
                              n === i
                                ? { ...p, [axis]: e.target.valueAsNumber }
                                : p,
                            ),
                          )
                        }
                      />
                    </Field>
                  ))}
                </div>
              ))}
            </div>
            <p className="muted">
              Saving configures and activates this classroom's attendance zone.
              Separate zone disable is unavailable in this backend version.
            </p>
            <div className="form-actions">
              <Button type="button" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={busy || !hasFrame || !adapter?.saveZone}
              >
                {busy ? "Saving…" : "Save zone"}
              </Button>
            </div>
          </fieldset>
        </ResourceState>
      </form>
    </Modal>
  );
}
function ZoneFrame({
  cameraId,
  points,
  onChange,
  onReady,
  disabled,
}: {
  cameraId: string;
  points: Point[];
  onChange: (points: Point[]) => void;
  onReady: (ready: boolean) => void;
  disabled: boolean;
}) {
  const { adapter } = useClassroom();
  const frame = useResource(
    (s) => adapter!.zoneFrame(cameraId, s),
    `zone-frame-${cameraId}`,
  );
  const [url, setUrl] = useState("");
  useEffect(() => {
    onReady(false);
    setUrl("");
    if (!frame.data || !/^image\/(jpeg|png|webp)$/.test(frame.data.type))
      return;
    const objectUrl = URL.createObjectURL(frame.data);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [frame.data, onReady]);
  return (
    <ResourceState resource={frame}>
      {url ? (
        <div className="classroom-zone-frame">
          <img
            src={url}
            alt="Camera frame for attendance zone"
            onLoad={() => onReady(true)}
            onError={() => onReady(false)}
          />
          <svg
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
            aria-label="Attendance zone drawing surface"
            onClick={(e) => {
              if (disabled || points.length >= 50) return;
              const rect = e.currentTarget.getBoundingClientRect();
              onChange([
                ...points,
                {
                  x: Number(((e.clientX - rect.left) / rect.width).toFixed(4)),
                  y: Number(((e.clientY - rect.top) / rect.height).toFixed(4)),
                },
              ]);
            }}
          >
            <polygon
              points={points
                .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
                .map((p) => `${p.x},${p.y}`)
                .join(" ")}
            />
            {points
              .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
              .map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="0.008" />
              ))}
          </svg>
        </div>
      ) : (
        !frame.loading && <Empty title="Camera frame unavailable" />
      )}
      <Button
        type="button"
        onClick={frame.refresh}
        disabled={disabled || frame.loading}
      >
        Refresh frame
      </Button>
    </ResourceState>
  );
}
