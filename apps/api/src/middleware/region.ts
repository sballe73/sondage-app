import type { FastifyRequest } from "fastify";
import type { DataRegion } from "@sondage/shared";
import { DATA_REGIONS } from "@sondage/shared";
import { config } from "../config.js";
import { getPollByIdCached } from "../poll-cache.js";
import { AppError } from "../errors.js";

declare module "fastify" {
  interface FastifyRequest {
    dataRegion?: DataRegion;
  }
}

export function resolveRequestRegion(
  request: FastifyRequest
): DataRegion {
  const header = request.headers[config.regionHeader];
  const value = Array.isArray(header) ? header[0] : header;
  if (value && DATA_REGIONS.includes(value as DataRegion)) {
    return value as DataRegion;
  }
  return config.defaultDataRegion;
}

export async function enforcePollRegion(
  request: FastifyRequest,
  pollId: string
) {
  const data = await getPollByIdCached(pollId);
  if (!data) {
    throw new AppError(404, "NOT_FOUND", "Poll not found");
  }
  const requestRegion = resolveRequestRegion(request);
  const pollRegion = data.poll.dataRegion as DataRegion;
  if (pollRegion !== "GLOBAL" && requestRegion !== pollRegion) {
    throw new AppError(
      451,
      "REGION_MISMATCH",
      "Data region mismatch",
      {
        requiredRegion: pollRegion,
        requestRegion,
        message: `Poll is hosted in ${pollRegion}; route requests via ${pollRegion} endpoint`,
      }
    );
  }
  request.dataRegion = requestRegion;
  return data;
}
