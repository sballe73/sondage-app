import { z } from "zod";

export type ApiErrorBody = {
  error: string;
  code: string;
  details?: unknown;
};

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;
  readonly headers?: Record<string, string>;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: unknown,
    headers?: Record<string, string>
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.headers = headers;
  }
}

export function formatZodDetails(error: z.ZodError) {
  return error.errors.map((err) => ({
    path: err.path.join("."),
    message: err.message,
  }));
}

export function toErrorBody(
  statusCode: number,
  code: string,
  message: string,
  details?: unknown
): ApiErrorBody {
  const body: ApiErrorBody = { error: message, code };
  if (details !== undefined) {
    body.details = details;
  }
  return body;
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
