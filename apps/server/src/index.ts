import { join } from "node:path";
import { createApp } from "./app.ts";

const port = Number(process.env["PORT"] ?? 3000);
const databasePath =
  process.env["DATABASE_PATH"] ?? join(import.meta.dirname, "../data/led-matrix.db");
const udpPort = process.env["UDP_PORT"];
const latencyOffset = process.env["DEVICE_LATENCY_OFFSET_MS"];
const app = createApp({
  databasePath,
  device: {
    host: process.env["DEVICE_HOST"],
    port: udpPort === undefined ? undefined : Number(udpPort),
    latencyOffset: latencyOffset === undefined ? undefined : Number(latencyOffset),
  },
});

await app.listen({ port, host: "0.0.0.0" });
