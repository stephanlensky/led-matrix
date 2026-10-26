import { HEIGHT, WIDTH } from "@led-matrix/core";
import Fastify from "fastify";

export function createApp({ logger = true } = {}) {
  const app = Fastify({ logger });

  app.get("/api/health", () => ({ status: "ok", width: WIDTH, height: HEIGHT }));

  return app;
}
