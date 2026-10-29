import { describe, expect, it, vi } from "vitest";
import { animationSchema } from "./animation.ts";
import {
  type DeviceLinkOptions,
  type DeviceTransport,
  type DeviceTransportListener,
  createDeviceLink,
  encodeSmallestFrame,
} from "./device-link.ts";
import {
  DeviceFeature,
  DeviceMode,
  type DeviceMessage,
  type DeviceStatus,
  MessageType,
  decodeMessage,
} from "./device-protocol.ts";
import { createPlaybackEngine } from "./engine.ts";
import type { DeviceState } from "./playback.ts";
import { createFrame, setPixel } from "./frame.ts";
import { createRenderer } from "./renderer.ts";

const status: DeviceStatus = {
  width: 64,
  height: 64,
  brightness: 255,
  mode: DeviceMode.idle,
  features: DeviceFeature.compressedFrames,
  uptimeMs: 1000,
  framesShown: 0,
  framesDropped: 0,
  shownSequence: 0,
  shownAgeMs: 0,
};

const red = animationSchema.parse({
  name: "Red",
  mode: { type: "loop", beats: 4 },
  layers: [{ effect: "solid", params: { color: "#ff0000" } }],
});

function getSequence(packets: Uint8Array[]): number | undefined {
  const message = packets[0] && decodeMessage(packets[0]);
  return message?.type === "frame" ? message.sequence : undefined;
}

function createFakeTransport() {
  const listeners = new Set<DeviceTransportListener>();
  const packets: Uint8Array[] = [];
  const frames: Uint8Array[][] = [];
  const state = { isWritable: true };
  const close = vi.fn<() => void>();
  const transport: DeviceTransport = {
    getAddress: () => null,
    send: (packet) => packets.push(packet),
    sendFrame(frame) {
      if (!state.isWritable) {
        return false;
      }
      frames.push(frame);
      return true;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close,
  };
  return {
    transport,
    packets,
    frames,
    state,
    close,
    setMessage: (message: DeviceMessage) => {
      for (const listener of listeners) {
        listener.setMessage?.(message);
      }
    },
    setConnected: (connected: boolean) => {
      for (const listener of listeners) {
        listener.setConnected?.(connected);
      }
    },
  };
}

function setup(options: Partial<DeviceLinkOptions> = {}) {
  const clock = { time: 0 };
  const engine = createPlaybackEngine({
    renderer: createRenderer({ fps: 30 }),
    fps: 30,
    bpm: 120,
    getTime: () => clock.time,
  });
  const fake = createFakeTransport();
  const link = createDeviceLink({
    engine,
    transport: fake.transport,
    getTime: () => clock.time,
    ...options,
  });
  return { clock, engine, link, ...fake };
}

describe("encodeSmallestFrame", () => {
  it("uses raw frames when the device does not support compression", () => {
    const packets = encodeSmallestFrame(createFrame(), 1, 0);
    expect(packets.every((packet) => packet[3] === MessageType.frame)).toBe(true);
  });

  it("uses compressed frames when they are smaller", () => {
    const packets = encodeSmallestFrame(createFrame(), 1, DeviceFeature.compressedFrames);
    expect(packets).toHaveLength(1);
    expect(packets[0]?.[3]).toBe(MessageType.compressedFrame);
  });

  it("falls back to raw frames when compression would grow them", () => {
    const frame = createFrame();
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const value = Math.imul(x * 73856093 + y * 19349663, 2654435761) >>> 0;
        setPixel(frame, x, y, [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff]);
      }
    }
    const packets = encodeSmallestFrame(frame, 1, DeviceFeature.compressedFrames);
    expect(packets.every((packet) => packet[3] === MessageType.frame)).toBe(true);
  });
});

describe("device link", () => {
  it("connects on status and resends brightness until the device reports it", () => {
    const { link, packets, setMessage } = setup();
    link.setBrightness(40);
    expect(packets).toHaveLength(1);
    setMessage({ type: "status", status });
    expect(link.getState()).toMatchObject({ connected: true, brightness: 40, status });
    expect(packets).toHaveLength(2);
    setMessage({ type: "status", status: { ...status, brightness: 40 } });
    expect(packets).toHaveLength(2);
  });

  it("does not use a sequence for frames the transport drops", () => {
    const { clock, engine, link, frames, state, setMessage } = setup();
    setMessage({ type: "status", status });
    engine.play("red", red);
    engine.tick();
    state.isWritable = false;
    clock.time = 33;
    engine.tick();
    state.isWritable = true;
    clock.time = 66;
    engine.tick();
    expect(frames.map(getSequence)).toEqual([0, 1]);

    clock.time = 100;
    setMessage({
      type: "status",
      status: { ...status, mode: DeviceMode.streaming, shownSequence: 1, shownAgeMs: 4 },
    });
    expect(link.getLatency()).toBe(30);
  });

  it("disconnects as soon as the transport closes", () => {
    const { link, setMessage, setConnected } = setup();
    const listener = vi.fn<(state: DeviceState) => void>();
    link.subscribe(listener);
    setMessage({ type: "status", status });
    setConnected(false);
    expect(link.getState().connected).toBe(false);
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ connected: false }));
  });

  it("passes device logs to the caller and closes the transport", () => {
    const onLog = vi.fn<(text: string) => void>();
    const { link, close, setMessage } = setup({ onLog });
    setMessage({ type: "log", text: "hello" });
    expect(onLog).toHaveBeenCalledWith("hello");
    link.close();
    expect(close).toHaveBeenCalled();
  });
});
