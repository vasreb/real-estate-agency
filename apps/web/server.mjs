// Production web server: Next.js request handler behind a small Node HTTP
// server that sets an honest X-Forwarded-For (see forwarding.mjs).
//   node server.mjs [--hostname 127.0.0.1] [--port 3000]
import { createServer } from "node:http";
import { parseArgs } from "node:util";
import next from "next";
import { forwardedFor, parseTrustedProxies } from "./forwarding.mjs";

const { values } = parseArgs({
  options: {
    hostname: { type: "string", default: process.env.HOSTNAME ?? "127.0.0.1" },
    port: { type: "string", default: process.env.PORT ?? "3000" },
  },
});
const hostname = values.hostname;
const port = Number(values.port);
const trusted = parseTrustedProxies(process.env.WEB_TRUSTED_PROXIES);

const app = next({
  dev: false,
  dir: import.meta.dirname,
  hostname,
  port,
});
await app.prepare();
const handle = app.getRequestHandler();

const server = createServer((request, response) => {
  const value = forwardedFor(
    request.headers["x-forwarded-for"],
    request.socket.remoteAddress,
    trusted,
  );
  if (value) request.headers["x-forwarded-for"] = value;
  else delete request.headers["x-forwarded-for"];
  void handle(request, response);
});
server.listen(port, hostname, () => {
  console.log(`Web server ready on http://${hostname}:${port}`);
});

let closing = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    if (closing) return;
    closing = true;
    server.close(() => {
      void app.close().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 10_000).unref();
  });
