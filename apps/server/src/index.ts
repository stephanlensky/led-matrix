import { join } from "node:path";
import { createApp } from "./app.ts";

const port = Number(process.env["PORT"] ?? 3000);
const dataDir = process.env["DATA_DIR"] ?? join(import.meta.dirname, "../data/animations");
const app = createApp({ dataDir });

await app.listen({ port, host: "0.0.0.0" });
