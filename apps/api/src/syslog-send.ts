import tls from "node:tls";

export function buildSyslogMessage(params: {
  token: string;
  text: string;
  hostname?: string;
  appName?: string;
}): string {
  const ts = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const safeText = params.text.replace(/[\r\n]+/g, " ").slice(0, 2000);
  const host = params.hostname ?? "render-syslog-test";
  const app = params.appName ?? "sondage-api";
  return `<14>1 ${ts} ${host} ${app} 1 - [logtail@11993 source_token="${params.token}"] ${safeText}`;
}

export function frameSyslogMessage(msg: string): string {
  return `${Buffer.byteLength(msg, "utf8")} ${msg}\n`;
}

export function sendSyslogTls(params: {
  host: string;
  port: number;
  token: string;
  text: string;
  timeoutMs?: number;
}): Promise<{ message: string }> {
  const message = buildSyslogMessage({ token: params.token, text: params.text });
  const frame = frameSyslogMessage(message);
  const timeoutMs = params.timeoutMs ?? 8000;

  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: params.host,
      port: params.port,
      servername: params.host,
      rejectUnauthorized: true,
    });

    const fail = (err: Error) => {
      socket.destroy();
      reject(err);
    };

    socket.setTimeout(timeoutMs, () => fail(new Error("syslog TLS timeout")));

    socket.once("error", fail);
    socket.once("secureConnect", () => {
      socket.write(frame, (err) => {
        if (err) {
          fail(err);
          return;
        }
        socket.end();
      });
    });
    socket.once("close", () => resolve({ message }));
  });
}

export function isSyslogRelayConfigured(config: {
  logSyslogHost: string;
  logStreamToken: string;
}): boolean {
  return Boolean(
    config.logSyslogHost &&
      config.logStreamToken &&
      !config.logStreamToken.includes("CHANGE_ME")
  );
}
