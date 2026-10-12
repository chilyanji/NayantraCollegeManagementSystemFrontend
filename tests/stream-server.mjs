// Test-only stream fixture. Not part of the application runtime or backend.
import http from "node:http";
import fs from "node:fs";
const frame = fs.readFileSync(new URL("./camera-fixture.jpg", import.meta.url));
http
  .createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"database":"connected"}');
      return;
    }
    if (req.url?.includes("/stream")) {
      if (req.headers.authorization !== "Bearer test-token") {
        res.writeHead(401);
        res.end();
        return;
      }
      res.writeHead(200, {
        "Content-Type": "multipart/x-mixed-replace; boundary=frame",
        "Cache-Control": "no-store",
      });
      const send = () =>
        res.write(
          Buffer.concat([
            Buffer.from(
              `--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`,
            ),
            frame,
            Buffer.from("\r\n"),
          ]),
        );
      send();
      const timer = setInterval(send, 500);
      req.on("close", () => clearInterval(timer));
      return;
    }
    res.writeHead(404);
    res.end();
  })
  .listen(8765, "127.0.0.1");
