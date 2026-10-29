import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { getGainValue } from "./gain.ts";
import { type VolumeServerOptions, createVolumeServer } from "./volume-server.ts";

function post(url: string, body: string): Promise<Response> {
  return fetch(`${url}/api/volume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("volume server", () => {
  const servers: Server[] = [];

  afterEach(() => {
    for (const server of servers.splice(0)) {
      server.close();
      server.closeAllConnections();
    }
  });

  async function start(options: Partial<VolumeServerOptions> = {}) {
    const sent: number[] = [];
    const server = createVolumeServer({
      getMainGain: () => 1,
      isConnected: () => true,
      setMainGain: (parameter) => {
        sent.push(parameter);
        return true;
      },
      ...options,
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address !== null ? address.port : 0;
    const url = `http://127.0.0.1:${port}`;
    return { url, sent };
  }

  it("serves the volume page", async () => {
    const { url } = await start();
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("api/volume");
  });

  it("returns the latest main gain", async () => {
    const { url } = await start({ getMainGain: () => getGainValue(0.75) });
    expect(await (await fetch(`${url}/api/volume`)).json()).toEqual({
      parameter: expect.closeTo(0.75),
      value: expect.closeTo(getGainValue(0.75)),
      connected: true,
    });
  });

  it("returns nulls before the first decks message", async () => {
    const { url } = await start({ getMainGain: () => undefined, isConnected: () => false });
    expect(await (await fetch(`${url}/api/volume`)).json()).toEqual({
      parameter: null,
      value: null,
      connected: false,
    });
  });

  it("sends the knob position to Mixxx", async () => {
    const { url, sent } = await start();
    const response = await post(url, JSON.stringify({ parameter: 0.25 }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      parameter: 0.25,
      value: getGainValue(0.25),
      connected: true,
    });
    expect(sent).toEqual([0.25]);
  });

  it("rejects invalid input", async () => {
    const { url, sent } = await start();
    const bodies = ["{", "{}", '{"parameter":1.5}', '{"parameter":"0.5"}', "x".repeat(4096)];
    const responses = await Promise.all(bodies.map((body) => post(url, body)));
    expect(responses.map((response) => response.status)).toEqual(bodies.map(() => 400));
    expect(sent).toEqual([]);
  });

  it("returns 503 while Mixxx is not connected", async () => {
    const { url, sent } = await start({ isConnected: () => false });
    expect((await post(url, JSON.stringify({ parameter: 0.5 }))).status).toBe(503);
    expect(sent).toEqual([]);
  });

  it("returns 404 and 405 for other requests", async () => {
    const { url } = await start();
    expect((await fetch(`${url}/missing`)).status).toBe(404);
    expect((await fetch(`${url}/api/volume`, { method: "DELETE" })).status).toBe(405);
  });
});
