import { join } from "node:path";
import { createApp } from "./app.ts";

const port = Number(process.env["PORT"] ?? 3000);
const databasePath =
  process.env["DATABASE_PATH"] ?? join(import.meta.dirname, "../data/led-matrix.db");
const app = createApp({ databasePath });

await app.listen({ port, host: "0.0.0.0" });
