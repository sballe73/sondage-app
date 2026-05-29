import type { FastifyRequest, FastifyReply } from "fastify";
import type { DataRegion } from "@sondage/shared";
import { DATA_REGIONS } from "@sondage/shared";
import { config } from "../config.js";
import { getPollById } from "@sondage/db";

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
  reply: FastifyReply,
  pollId: string
) {
  const data = await getPollById(pollId);
  if (!data) {
    return reply.status(404).send({ error: "Poll not found" });
  }
  const requestRegion = resolveRequestRegion(request);
  const pollRegion = data.poll.dataRegion as DataRegion;
  if (pollRegion !== "GLOBAL" && requestRegion !== pollRegion) {
    return reply.status(451).send({
      error: "Data region mismatch",
      message: `Poll is hosted in ${pollRegion}; route requests via ${pollRegion} endpoint`,
      requiredRegion: pollRegion,
    });
  }
  request.dataRegion = requestRegion;
  return data;
}
