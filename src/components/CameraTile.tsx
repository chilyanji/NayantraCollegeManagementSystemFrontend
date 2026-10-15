import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Maximize2,
  Pause,
  Play,
  RefreshCw,
  Video,
  WifiOff,
} from "lucide-react";
import { apiUrl, getSession, messageOf, type Row } from "../lib/api";
import { JpegParser } from "../lib/mjpeg";
import { useVisible } from "../lib/hooks";
import { download } from "../lib/domain";
import { Badge, Button } from "./ui";

// ngrok's free-domain browser interstitial must not replace MJPEG stream data.
// Use the extra header only for ngrok URLs, not for localhost or other APIs.
function isNgrokFreeUrl(streamUrl: string): boolean {
  const hostname = new URL(streamUrl, window.location.origin).hostname;
  return /\.ngrok-free\.(?:app|dev)$/i.test(hostname);
}

export function CameraTile({
  camera,
  expanded = false,
  onExpand,
}: {
  camera: Row;
  expanded?: boolean;
  onExpand?: () => void;
}) {
  const [paused, setPaused] = useState(false),
    [attempt, setAttempt] = useState(0),
    [state, setState] = useState("Connecting"),
    [error, setError] = useState(""),
    [src, setSrc] = useState("");
  const lastBlob = useRef<Blob | null>(null);
  const visible = useVisible();
  const token = getSession()?.token;
  useEffect(() => {
    let disposed = false,
      failures = 0,
      url = "",
      retry: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    setSrc("");
    lastBlob.current = null;
    setError("");
    if (paused || !visible) {
      setState(paused ? "Paused" : "Hidden");
      return;
    }
    if (!token) {
      setState("Offline");
      setError("Your login session is unavailable. Please sign in again.");
      return;
    }

    async function connect() {
      if (disposed) return;
      const activeController = new AbortController();
      controller = activeController;
      setState("Connecting");
      setError("");
      let watchdog: ReturnType<typeof setTimeout> | undefined;
      const reset = () => {
        clearTimeout(watchdog);
        watchdog = setTimeout(() => activeController.abort(), 15000);
      };
      reset();
      try {
        const streamUrl = apiUrl(
          `/ai/camera/${encodeURIComponent(camera.camera_id)}/stream`,
        );
        const headers: Record<string, string> = {
          Authorization: `Bearer ${token}`,
        };
        if (isNgrokFreeUrl(streamUrl)) {
          headers["ngrok-skip-browser-warning"] = "1";
        }

        const response = await fetch(streamUrl, {
          method: "GET",
          headers,
          signal: activeController.signal,
          credentials: "omit",
        });
        if (!response.ok) {
          if (response.status === 401 && getSession()?.token === token)
            window.dispatchEvent(new CustomEvent("sentinel:expired"));
          let message = `Stream unavailable (${response.status})`;
          try {
            message = (await response.json()).detail || message;
          } catch {
            /* status fallback */
          }
          throw Object.assign(new Error(message), { status: response.status });
        }
        // A successful HTML/JSON response is not an MJPEG stream (for example,
        // an ngrok interstitial or an incorrectly routed Vercel request).
        const contentType = (response.headers.get("content-type") || "").toLowerCase();
        if (contentType.includes("text/html") || contentType.includes("application/json")) {
          throw new Error(
            "The camera endpoint returned HTML/JSON instead of a video stream. Check the ngrok backend URL.",
          );
        }
        if (!response.body)
          throw new Error("This browser cannot read a camera stream.");
        const reader = response.body.getReader();
        const parser = new JpegParser();
        while (!disposed) {
          const { done, value } = await reader.read();
          if (done) throw new Error("Camera stream ended.");
          const frames = parser.push(value);
          if (frames.length) {
            reset();
            failures = 0;
            const frame = frames[frames.length - 1];
            const blob = new Blob([new Uint8Array(frame)], {
              type: "image/jpeg",
            });
            lastBlob.current = blob;
            const next = URL.createObjectURL(blob);
            if (url) URL.revokeObjectURL(url);
            url = next;
            if (!disposed) {
              setSrc(next);
              setState("Live");
            }
          }
        }
      } catch (err: any) {
        if (disposed) return;
        setState("Offline");
        setError(
          err.name === "AbortError"
            ? "No camera frame received for 15 seconds."
            : messageOf(err),
        );
        setSrc("");
        lastBlob.current = null;
        if (url) {
          URL.revokeObjectURL(url);
          url = "";
        }
        if (![401, 403, 404].includes(err.status))
          retry = setTimeout(connect, Math.min(30000, 2000 * 2 ** failures++));
      } finally {
        clearTimeout(watchdog);
        activeController.abort();
      }
    }
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      controller?.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [camera.camera_id, token, paused, visible, attempt]);
  return (
    <article className={`camera-tile ${expanded ? "expanded" : ""}`}>
      <div className="camera-image">
        {src ? (
          <img
            src={src}
            alt={`Live view of ${camera.camera_name || camera.camera_id}`}
          />
        ) : (
          <div className="camera-placeholder">
            <div className="camera-grid-lines" />
            <span>
              {state === "Offline" ? (
                <WifiOff size={30} />
              ) : (
                <Video size={30} />
              )}
            </span>
            <strong>
              {state === "Connecting"
                ? "Connecting to camera"
                : state === "Paused"
                  ? "Stream paused"
                  : state === "Hidden"
                    ? "Stream suspended"
                    : "Camera unavailable"}
            </strong>
            <p>{error || "The camera feed will appear here."}</p>
            {state === "Offline" && (
              <Button onClick={() => setAttempt((v) => v + 1)}>
                <RefreshCw size={14} />
                Reconnect
              </Button>
            )}
          </div>
        )}
        <div className="camera-overlay">
          <span className="camera-code">
            {camera.camera_name || camera.camera_id}
          </span>
          <Badge
            tone={
              state === "Live"
                ? "green"
                : state === "Offline"
                  ? "red"
                  : "neutral"
            }
          >
            {state}
          </Badge>
        </div>
      </div>
      <footer>
        <div>
          <strong>{camera.camera_name || "Camera"}</strong>
          <span>
            {camera.location_name || camera.location || "Assigned camera"}
            {camera.resolution ? ` · ${camera.resolution}` : ""}
          </span>
        </div>
        <div className="camera-tools">
          <button
            title={paused ? "Resume stream" : "Pause stream"}
            aria-label={paused ? "Resume stream" : "Pause stream"}
            onClick={() => setPaused((v) => !v)}
          >
            {paused ? <Play size={16} /> : <Pause size={16} />}
          </button>
          <button
            title="Save snapshot"
            aria-label="Save snapshot"
            disabled={!src || state !== "Live"}
            onClick={() =>
              lastBlob.current &&
              download(
                lastBlob.current,
                `sentinel-${String(camera.camera_name || camera.camera_id).replace(/[^\w-]/g, "_")}-${Date.now()}.jpg`,
              )
            }
          >
            <Camera size={16} />
          </button>
          {onExpand && (
            <button
              title="Expand camera"
              aria-label="Expand camera"
              onClick={onExpand}
            >
              <Maximize2 size={16} />
            </button>
          )}
        </div>
      </footer>
    </article>
  );
}
