import type { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { config } from "../config.js";

export async function corsPlugin(app: FastifyInstance) {
  await app.register(cors, {
    origin: config.corsOrigins,
    methods: ["GET", "POST", "OPTIONS"],
  });
}
