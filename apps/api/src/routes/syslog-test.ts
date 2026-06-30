import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { AppError } from "../errors.js";
import {
  buildSyslogMessage,
  isSyslogRelayConfigured,
  sendSyslogTls,
} from "../syslog-send.js";

function assertSyslogTestEnabled(): void {
  if (!config.syslogTestEnabled) {
    throw new AppError(
      404,
      "SYSLOG_TEST_DISABLED",
      "Syslog test endpoint is disabled on this instance"
    );
  }
  if (!isSyslogRelayConfigured(config)) {
    throw new AppError(
      503,
      "SYSLOG_NOT_CONFIGURED",
      "Set LOG_SYSLOG_HOST and LOG_STREAM_TOKEN on this instance"
    );
  }
}

export async function syslogTestRoutes(app: FastifyInstance) {
  app.post("/syslog-test/send", async (request) => {
    assertSyslogTestEnabled();

    const body = z
      .object({
        message: z.string().min(1).max(2000),
      })
      .parse(request.body ?? {});

    const result = await sendSyslogTls({
      host: config.logSyslogHost,
      port: config.logSyslogPort,
      token: config.logStreamToken,
      text: body.message,
    });

    return {
      ok: true,
      host: config.logSyslogHost,
      port: config.logSyslogPort,
      preview: result.message.slice(0, 200),
    };
  });

  app.get("/syslog-test/status", async () => {
    const enabled = config.syslogTestEnabled;
    const configured = isSyslogRelayConfigured(config);
    return {
      enabled,
      configured,
      host: configured ? config.logSyslogHost : null,
      port: configured ? config.logSyslogPort : null,
      sample: configured
        ? buildSyslogMessage({
            token: config.logStreamToken,
            text: "example",
          }).replace(config.logStreamToken, "***")
        : null,
    };
  });
}
