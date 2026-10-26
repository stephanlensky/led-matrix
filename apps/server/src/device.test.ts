import { type Socket, createSocket } from "node:dgram";
import { once } from "node:events";
import {
  DeviceMode,
  type DeviceMessage,
  type DeviceStatus,
  animationSchema,
  createFrameAssembler,
  createRenderer,
  decodeMessage,
  encodeStatus,
  getPixel,
} from "@led-matrix/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type DeviceLink, createDeviceLink } from "./device.ts";
import { createPlaybackEngine } from "./engine.ts";

const status: DeviceStatus = {
  width: 64,
  height: 64,
  brightness: 255,
  mode: DeviceMode.idle,
  uptimeMs: 1000,
  framesShown: 0,
  framesDropped: 0,
};

const red = animationSchema.parse({
  name: "Red",
  mode: { type: "loop", beats: 4 },
  layers: [{ effect: "solid", params: { color: "#ff0000" } }],
});

async function createFakeDevice() {
  const socket = createSocket("udp4");
  socket.bind(0, "127.0.0.1");
  await once(socket, "listening");
  const messages: DeviceMessage[] = [];
  socket.on("message", (data) => {
    const message = decodeMessage(data);
    if (message) {
      messages.push(message);
    }
  });
  return { socket, messages };
}

function sendStatus(socket: Socket, port: number, value: DeviceStatus): Promise<void> {
  return new Promise((resolve) =>
    socket.send(encodeStatus(value), port, "127.0.0.1", () => resolve()),
  );
}

describe("device link", () => {
  const cleanup: Array<() => void> = [];

  afterEach(() => {
    for (const close of cleanup.splice(0)) {
      close();
    }
  });

  async function setup() {
    const clock = { time: 0 };
    const engine = createPlaybackEngine({
      renderer: createRenderer({ fps: 30 }),
      fps: 30,
      bpm: 120,
      getTime: () => clock.time,
    });
    const link: DeviceLink = await createDeviceLink({ engine, port: 0, getTime: () => clock.time });
    const device = await createFakeDevice();
    cleanup.push(
      () => link.close(),
      () => device.socket.close(),
      () => engine.close(),
    );
    return { clock, engine, link, device };
  }

  it("discovers the device from its status and streams frames to it", async () => {
    const { engine, link, device } = await setup();
    engine.tick();
    expect(link.getState()).toMatchObject({ connected: false, address: null });

    await sendStatus(device.socket, link.getPort(), status);
    await vi.waitFor(() => expect(link.getState().connected).toBe(true));
    expect(link.getState()).toMatchObject({
      address: { address: "127.0.0.1", port: device.socket.address().port },
      status,
    });

    engine.play("red", red);
    engine.tick();
    const assembler = createFrameAssembler();
    await vi.waitFor(() => expect(device.messages).toHaveLength(10));
    const frames = device.messages.map((message) =>
      message.type === "frame" ? assembler.add(message) : undefined,
    );
    const frame = frames.at(-1);
    expect(frame && getPixel(frame, 5, 5)).toEqual([255, 0, 0]);
  });

  it("disconnects after missing status messages", async () => {
    const { clock, link, device } = await setup();
    await sendStatus(device.socket, link.getPort(), status);
    await vi.waitFor(() => expect(link.getState().connected).toBe(true));
    clock.time = 3000;
    expect(link.getState().connected).toBe(false);
  });

  it("resends the brightness until the device reports it", async () => {
    const { link, device } = await setup();
    link.setBrightness(64);
    await sendStatus(device.socket, link.getPort(), status);
    await vi.waitFor(() => expect(device.messages).toHaveLength(1));
    await sendStatus(device.socket, link.getPort(), { ...status, brightness: 64 });
    await sendStatus(device.socket, link.getPort(), { ...status, brightness: 64 });
    await vi.waitFor(() => expect(link.getState().status?.brightness).toBe(64));
    expect(device.messages).toEqual([{ type: "setBrightness", brightness: 64 }]);
    expect(link.getState().brightness).toBe(64);
  });
});
