#!/usr/bin/env node
/**
 * TLS syslog gate — validates LOG_STREAM_TOKEN before forwarding to rsyslog.
 * Render embeds the token in RFC 5424 structured data (format varies by provider).
 */
import fs from "node:fs";
import net from "node:net";
import tls from "node:tls";

const TOKEN = process.env.LOG_STREAM_TOKEN ?? "";
const PORT = Number(process.env.LOG_GATE_PORT ?? 6514);
const UPSTREAM_HOST = process.env.LOG_UPSTREAM_HOST ?? "log-collector";
const UPSTREAM_PORT = Number(process.env.LOG_UPSTREAM_PORT ?? 514);
const CERT = process.env.TLS_CERT_FILE ?? "/certs/cert.pem";
const KEY = process.env.TLS_KEY_FILE ?? "/certs/key.pem";
const LOG_REJECTS = process.env.LOG_GATE_LOG_REJECTS === "true";
const REJECT_LOG = process.env.LOG_REJECT_FILE ?? "/var/log/rejected.log";

if (!TOKEN || TOKEN.includes("CHANGE_ME")) {
  console.error("syslog-gate: set LOG_STREAM_TOKEN in infra/logs/.env.logs");
  process.exit(1);
}

const escapedToken = TOKEN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** @param {string} msg */
function tokenValid(msg) {
  const patterns = [
    new RegExp(`source_token="${escapedToken}"`),
    new RegExp(`source_token='${escapedToken}'`),
    new RegExp(`private_key="${escapedToken}"`),
    new RegExp(`api_key="${escapedToken}"`),
    new RegExp(`\\btoken="${escapedToken}"`),
    new RegExp(`nrLicenseKey=${escapedToken}\\b`),
  ];
  if (msg.startsWith(`${TOKEN} <`)) return true;
  return patterns.some((re) => re.test(msg));
}

/** @param {string} reason @param {string} msg */
function logReject(reason, msg) {
  if (!LOG_REJECTS) return;
  const line = `${new Date().toISOString()} ${reason} ${msg.slice(0, 400).replace(/\n/g, "\\n")}\n`;
  try {
    fs.appendFileSync(REJECT_LOG, line);
  } catch {
    // ignore
  }
}

/** @param {net.Socket} upstream @param {string} payload */
function forward(upstream, payload) {
  const data = payload.endsWith("\n") ? payload : `${payload}\n`;
  if (!upstream.write(data)) {
    upstream.once("drain", () => {});
  }
}

/**
 * @param {Buffer} buf
 * @returns {{ consumed: number, messages: string[] }}
 */
function parseFrames(buf) {
  const messages = [];
  let offset = 0;

  while (offset < buf.length) {
    if (buf[offset] >= 0x30 && buf[offset] <= 0x39) {
      let lenEnd = offset;
      while (lenEnd < buf.length && buf[lenEnd] >= 0x30 && buf[lenEnd] <= 0x39) {
        lenEnd += 1;
      }
      if (lenEnd >= buf.length || buf[lenEnd] !== 0x20) break;
      const frameLen = Number(buf.toString("ascii", offset, lenEnd));
      const msgStart = lenEnd + 1;
      const msgEnd = msgStart + frameLen;
      if (msgEnd > buf.length) break;
      messages.push(buf.toString("utf8", msgStart, msgEnd));
      offset = msgEnd;
      continue;
    }

    const nl = buf.indexOf(0x0a, offset);
    if (nl === -1) break;
    const line = buf.toString("utf8", offset, nl);
    if (line.length > 0) messages.push(line);
    offset = nl + 1;
  }

  return { consumed: offset, messages };
}

function connectUpstream() {
  return net.connect(UPSTREAM_PORT, UPSTREAM_HOST);
}

const server = tls.createServer(
  {
    cert: fs.readFileSync(CERT),
    key: fs.readFileSync(KEY),
    minVersion: "TLSv1.2",
  },
  (socket) => {
    let upstream = null;
    let buffer = Buffer.alloc(0);
    let accepted = 0;
    let rejected = 0;

    const ensureUpstream = () => {
      if (upstream) return upstream;
      upstream = connectUpstream();
      upstream.on("error", (err) => {
        console.error("syslog-gate: upstream error:", err.message);
        socket.destroy();
      });
      upstream.on("close", () => {
        upstream = null;
      });
      return upstream;
    };

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const { consumed, messages } = parseFrames(buffer);
      buffer = buffer.subarray(consumed);

      for (const msg of messages) {
        if (tokenValid(msg)) {
          accepted += 1;
          forward(ensureUpstream(), msg);
        } else {
          rejected += 1;
          logReject("token_mismatch", msg);
        }
      }
    });

    socket.on("close", () => {
      const peer = `${socket.remoteAddress ?? "?"}:${socket.remotePort ?? "?"}`;
      console.log(
        `syslog-gate: ${peer} done — accepted=${accepted} rejected=${rejected} leftover=${buffer.length}`
      );
      if (buffer.length) {
        console.log(
          `syslog-gate: ${peer} unparsed: ${buffer.toString("utf8", 0, Math.min(buffer.length, 200)).replace(/\n/g, "\\n")}`
        );
      }
      upstream?.end();
    });

    socket.on("error", () => {
      upstream?.destroy();
    });
  }
);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`syslog-gate: listening TLS :${PORT} → ${UPSTREAM_HOST}:${UPSTREAM_PORT}`);
});

server.on("error", (err) => {
  console.error("syslog-gate:", err.message);
  process.exit(1);
});

server.on("connection", (socket) => {
  console.log(
    `syslog-gate: connection from ${socket.remoteAddress ?? "?"}:${socket.remotePort ?? "?"}`
  );
});
