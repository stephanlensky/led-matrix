import { createApp } from "./app.ts";

const port = Number(process.env["PORT"] ?? 3000);
const app = createApp();

await app.listen({ port, host: "0.0.0.0" });
