import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  AppError,
  formatZodDetails,
  toErrorBody,
} from "../errors.js";

export async function errorHandlerPlugin(app: FastifyInstance) {
  app.setNotFoundHandler((request, reply) => {
    reply
      .status(404)
      .send(toErrorBody(404, "NOT_FOUND", "Route not found"));
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError) {
      return reply.status(400).send(
        toErrorBody(400, "VALIDATION_ERROR", "Validation failed", {
          fields: formatZodDetails(error),
        })
      );
    }

    if (error instanceof AppError) {
      request.log.warn(
        {
          code: error.code,
          statusCode: error.statusCode,
          path: request.url,
          method: request.method,
        },
        error.message
      );
      if (error.headers) {
        for (const [name, value] of Object.entries(error.headers)) {
          reply.header(name, value);
        }
      }
      return reply
        .status(error.statusCode)
        .send(toErrorBody(error.statusCode, error.code, error.message, error.details));
    }

    request.log.error(
      {
        err: error,
        path: request.url,
        method: request.method,
      },
      "Unhandled error"
    );
    return reply
      .status(500)
      .send(toErrorBody(500, "INTERNAL_ERROR", "Internal server error"));
  });
}
