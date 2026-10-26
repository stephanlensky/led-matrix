import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HEIGHT, WIDTH } from "@led-matrix/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { seedAnimations } from "./seeds.ts";

let rootDir: string;
let databasePath: string;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  rootDir = await mkdtemp(join(tmpdir(), "led-matrix-"));
  databasePath = join(rootDir, "data", "led-matrix.db");
  app = createApp({ databasePath, logger: false });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  await rm(rootDir, { recursive: true, force: true });
});

const animation = {
  name: "Red Alert!",
  mode: { type: "loop", beats: 2 },
  layers: [{ effect: "solid", params: { color: "#ff0000" } }],
};

describe("health", () => {
  it("reports panel dimensions", async () => {
    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", width: 64, height: 64 });
  });
});

describe("effects", () => {
  it("lists effects with JSON schemas for their params", async () => {
    const response = await app.inject({ method: "GET", url: "/api/effects" });
    const solid = response
      .json<{ id: string; params: { properties: object } }[]>()
      .find((effect) => effect.id === "solid");
    expect(solid?.params.properties).toEqual({
      color: expect.objectContaining({ type: "string", default: "#ffffff" }),
    });
  });
});

describe("animations", () => {
  it("seeds example animations into a new database", async () => {
    const response = await app.inject({ method: "GET", url: "/api/animations" });
    expect(response.json<{ id: string }[]>().map(({ id }) => id)).toEqual(
      Object.keys(seedAnimations).toSorted(),
    );
  });

  it("reapplies seed animations to an existing database on restart", async () => {
    await app.inject({ method: "DELETE", url: "/api/animations/plasma" });
    await app.inject({ method: "POST", url: "/api/animations", body: animation });
    await app.close();
    app = createApp({ databasePath, logger: false });
    await app.ready();
    const plasma = await app.inject({ method: "GET", url: "/api/animations/plasma" });
    expect(plasma.statusCode).toBe(200);
    const created = await app.inject({ method: "GET", url: "/api/animations/red-alert" });
    expect(created.statusCode).toBe(200);
  });

  it("creates animations with ids derived from their name", async () => {
    const first = await app.inject({ method: "POST", url: "/api/animations", body: animation });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toEqual({
      id: "red-alert",
      name: "Red Alert!",
      mode: { type: "loop", beats: 2 },
      layers: [{ effect: "solid", params: { color: "#ff0000" }, blend: "normal", opacity: 1 }],
    });
    const second = await app.inject({ method: "POST", url: "/api/animations", body: animation });
    expect(second.json<{ id: string }>().id).toBe("red-alert-2");
    const stored = await app.inject({ method: "GET", url: "/api/animations/red-alert" });
    expect(stored.json()).toEqual(first.json());
  });

  it("creates animations with explicit ids and rejects duplicates", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/animations",
      body: { ...animation, id: "alarm" },
    });
    expect(created.json<{ id: string }>().id).toBe("alarm");
    const duplicate = await app.inject({
      method: "POST",
      url: "/api/animations",
      body: { ...animation, id: "alarm" },
    });
    expect(duplicate.statusCode).toBe(409);
  });

  it("rejects invalid animations", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/animations",
      body: {
        ...animation,
        id: "../escape",
        layers: [{ effect: "solid", params: { color: "red" } }],
      },
    });
    expect(response.statusCode).toBe(400);
    expect(
      response.json<{ issues: { path: unknown[] }[] }>().issues.map(({ path }) => path),
    ).toEqual([["layers", 0, "params", "color"], ["id"]]);
  });

  it("updates and deletes animations", async () => {
    const updated = await app.inject({
      method: "PUT",
      url: "/api/animations/plasma",
      body: animation,
    });
    expect(updated.json<{ name: string }>().name).toBe("Red Alert!");
    const missing = await app.inject({
      method: "PUT",
      url: "/api/animations/missing",
      body: animation,
    });
    expect(missing.statusCode).toBe(404);
    const deleted = await app.inject({ method: "DELETE", url: "/api/animations/plasma" });
    expect(deleted.statusCode).toBe(204);
    const gone = await app.inject({ method: "GET", url: "/api/animations/plasma" });
    expect(gone.statusCode).toBe(404);
  });

  it("returns 404 for invalid ids", async () => {
    const response = await app.inject({ method: "GET", url: "/api/animations/..%2Fsecret" });
    expect(response.statusCode).toBe(404);
  });
});

describe("playback", () => {
  it("plays and stops animations", async () => {
    const played = await app.inject({
      method: "POST",
      url: "/api/outputs/simulator/play",
      body: { id: "plasma" },
    });
    expect(played.json()).toEqual({
      animationId: "plasma",
      bpm: 120,
      fps: 30,
      beat: expect.any(Number),
    });
    const stopped = await app.inject({ method: "POST", url: "/api/outputs/simulator/stop" });
    expect(stopped.json()).toEqual({ animationId: null, bpm: 120, fps: 30, beat: null });
  });

  it("plays from a beat position and resyncs the beat", async () => {
    const idle = await app.inject({
      method: "POST",
      url: "/api/outputs/device/beat",
      body: { beat: 4 },
    });
    expect(idle.statusCode).toBe(409);
    const played = await app.inject({
      method: "POST",
      url: "/api/outputs/device/play",
      body: { id: "plasma", beat: 8, bpm: 128 },
    });
    expect(played.json()).toMatchObject({ animationId: "plasma", bpm: 128 });
    expect(played.json<{ beat: number }>().beat).toBeCloseTo(8, 1);
    const synced = await app.inject({
      method: "POST",
      url: "/api/outputs/device/beat",
      body: { beat: 16 },
    });
    expect(synced.json<{ beat: number }>().beat).toBeCloseTo(16, 1);
    const invalid = await app.inject({
      method: "POST",
      url: "/api/outputs/device/beat",
      body: { beat: -1 },
    });
    expect(invalid.statusCode).toBe(400);
  });

  it("rejects unknown animations, outputs and bad requests", async () => {
    const unknown = await app.inject({
      method: "POST",
      url: "/api/outputs/simulator/play",
      body: { id: "missing" },
    });
    expect(unknown.statusCode).toBe(404);
    const invalid = await app.inject({
      method: "POST",
      url: "/api/outputs/simulator/play",
      body: {},
    });
    expect(invalid.statusCode).toBe(400);
    const output = await app.inject({
      method: "POST",
      url: "/api/outputs/stage/play",
      body: { id: "plasma" },
    });
    expect(output.statusCode).toBe(404);
  });

  it("sets the bpm", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/outputs/simulator/bpm",
      body: { bpm: 1000 },
    });
    expect(response.json<{ bpm: number }>().bpm).toBe(1000);
    const invalid = await app.inject({
      method: "POST",
      url: "/api/outputs/simulator/bpm",
      body: { bpm: 0 },
    });
    expect(invalid.statusCode).toBe(400);
  });

  it("keeps playback and bpm separate per output", async () => {
    await app.inject({
      method: "POST",
      url: "/api/outputs/device/play",
      body: { id: "plasma" },
    });
    await app.inject({ method: "POST", url: "/api/outputs/device/bpm", body: { bpm: 128 } });
    const device = await app.inject({ method: "GET", url: "/api/outputs/device" });
    expect(device.json()).toMatchObject({ animationId: "plasma", bpm: 128, fps: 30 });
    const simulator = await app.inject({ method: "GET", url: "/api/outputs/simulator" });
    expect(simulator.json()).toEqual({ animationId: null, bpm: 120, fps: 30, beat: null });
  });

  it("stops the deleted animation on every output", async () => {
    const outputs = ["simulator", "device"];
    await Promise.all(
      outputs.map((output) =>
        app.inject({ method: "POST", url: `/api/outputs/${output}/play`, body: { id: "plasma" } }),
      ),
    );
    await app.inject({ method: "DELETE", url: "/api/animations/plasma" });
    const responses = await Promise.all(
      outputs.map((output) => app.inject({ method: "GET", url: `/api/outputs/${output}` })),
    );
    expect(
      responses.map((response) => response.json<{ animationId: unknown }>().animationId),
    ).toEqual([null, null]);
  });

  it("streams state messages and binary frames over websocket", async () => {
    const messages: { data: Buffer; isBinary: boolean }[] = [];
    const socket = await app.injectWS("/api/stream/simulator", undefined, {
      onInit: (client) =>
        client.on("message", (data: Buffer, isBinary: boolean) =>
          messages.push({ data, isBinary }),
        ),
    });
    await expect.poll(() => messages.length).toBeGreaterThan(0);
    await app.inject({
      method: "POST",
      url: "/api/outputs/simulator/play",
      body: { id: "white-strobe" },
    });
    await expect.poll(() => messages.filter(({ isBinary }) => isBinary).length).toBeGreaterThan(1);
    socket.terminate();

    const states = messages
      .filter(({ isBinary }) => !isBinary)
      .map(({ data }) => JSON.parse(data.toString()));
    expect(states).toEqual([
      { type: "state", state: { animationId: null, bpm: 120, fps: 30, beat: null } },
      {
        type: "state",
        state: { animationId: "white-strobe", bpm: 120, fps: 30, beat: expect.any(Number) },
      },
    ]);
    const frame = messages.find(({ isBinary }) => isBinary);
    expect(frame?.data).toHaveLength(WIDTH * HEIGHT * 3);
  });

  it("sends a disabled device state on the device stream when the link is off", async () => {
    const messages: unknown[] = [];
    const socket = await app.injectWS("/api/stream/device", undefined, {
      onInit: (client) =>
        client.on("message", (data: Buffer, isBinary: boolean) => {
          if (!isBinary) {
            messages.push(JSON.parse(data.toString()));
          }
        }),
    });
    await expect.poll(() => messages.length).toBe(2);
    socket.terminate();
    expect(messages).toEqual([
      { type: "state", state: { animationId: null, bpm: 120, fps: 30, beat: null } },
      {
        type: "device",
        device: {
          enabled: false,
          connected: false,
          address: null,
          status: null,
          brightness: null,
          latencyMs: null,
        },
      },
    ]);
  });

  it("sends the device state on the device stream when the link is on", async () => {
    await app.close();
    app = createApp({ databasePath, logger: false, device: { port: 0 } });
    await app.ready();
    const messages: unknown[] = [];
    const socket = await app.injectWS("/api/stream/device", undefined, {
      onInit: (client) =>
        client.on("message", (data: Buffer, isBinary: boolean) => {
          if (!isBinary) {
            messages.push(JSON.parse(data.toString()));
          }
        }),
    });
    await expect.poll(() => messages.length).toBe(2);
    await app.inject({ method: "PUT", url: "/api/device/brightness", body: { brightness: 40 } });
    await expect.poll(() => messages.length).toBe(3);
    socket.terminate();
    expect(messages.slice(1)).toEqual([
      {
        type: "device",
        device: {
          enabled: true,
          connected: false,
          address: null,
          status: null,
          brightness: null,
          latencyMs: null,
        },
      },
      {
        type: "device",
        device: {
          enabled: true,
          connected: false,
          address: null,
          status: null,
          brightness: 40,
          latencyMs: null,
        },
      },
    ]);
  });
});
