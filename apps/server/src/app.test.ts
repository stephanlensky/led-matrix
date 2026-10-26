import { describe, expect, it } from "vitest";
import { createApp } from "./app.ts";

describe("server", () => {
  it("reports health with panel dimensions", async () => {
    const app = createApp({ logger: false });
    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", width: 64, height: 64 });
  });
});
