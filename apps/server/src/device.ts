import { type Socket, createSocket } from "node:dgram";
import {
  DEVICE_PORT,
  DeviceFeature,
  DeviceMode,
  type DeviceState,
  type DeviceStatus,
  type Frame,
  SERVER_PORT,
  STATUS_INTERVAL_MS,
  decodeMessage,
  encodeCompressedFrame,
  encodeFrame,
  encodeSetBrightness,
} from "@led-matrix/core";
import type { PlaybackEngine } from "./engine.ts";

const CONNECTION_TIMEOUT_MS = STATUS_INTERVAL_MS * 3;
const SENT_FRAME_HISTORY = 256;
const LATENCY_SAMPLES = 8;

export type DeviceAddress = NonNullable<DeviceState["address"]>;

export type DeviceListener = (state: DeviceState) => void;

export const disabledDeviceState: DeviceState = {
  enabled: false,
  connected: false,
  address: null,
  status: null,
  brightness: null,
  latencyMs: null,
};

export type DeviceLinkOptions = {
  engine: PlaybackEngine;
  port?: number;
  host?: string;
  latencyOffset?: number;
  getTime?: () => number;
  onError?: (error: unknown) => void;
};

export type DeviceLink = Awaited<ReturnType<typeof createDeviceLink>>;

function bind(socket: Socket, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.bind(port, () => {
      socket.off("error", reject);
      resolve();
    });
  });
}

export async function createDeviceLink({
  engine,
  port = SERVER_PORT,
  host,
  latencyOffset = 0,
  getTime = () => performance.now(),
  onError,
}: DeviceLinkOptions) {
  const socket = createSocket("udp4");
  let target: DeviceAddress | null = host ? { address: host, port: DEVICE_PORT } : null;
  let status: DeviceStatus | null = null;
  let lastSeen: number | undefined;
  let brightness: number | null = null;
  let sequence = 0;
  let wasConnected = false;
  const sentFrames: Array<{ sequence: number; sentAt: number } | undefined> = [];
  const latencySamples: number[] = [];
  const listeners = new Set<DeviceListener>();

  function getLatency(): number | null {
    return latencySamples.length > 0 ? Math.min(...latencySamples) + latencyOffset : null;
  }

  function getState(): DeviceState {
    const connected = lastSeen !== undefined && getTime() - lastSeen < CONNECTION_TIMEOUT_MS;
    return {
      enabled: true,
      connected,
      address: target,
      status,
      brightness,
      latencyMs: getLatency(),
    };
  }

  function addLatencySample({ mode, shownSequence, shownAgeMs }: DeviceStatus): void {
    const sent = sentFrames[shownSequence % SENT_FRAME_HISTORY];
    if (mode !== DeviceMode.streaming || sent?.sequence !== shownSequence) {
      return;
    }
    latencySamples.push(getTime() - shownAgeMs - sent.sentAt);
    if (latencySamples.length > LATENCY_SAMPLES) {
      latencySamples.shift();
    }
  }

  function updateState(): void {
    const state = getState();
    wasConnected = state.connected;
    for (const listener of listeners) {
      listener(state);
    }
  }

  function updateConnection(): void {
    if (getState().connected !== wasConnected) {
      updateState();
    }
  }

  function send(packet: Uint8Array): void {
    if (target) {
      socket.send(packet, target.port, target.address);
    }
  }

  function sendFrame(frame: Frame): void {
    const isCompressed = ((status?.features ?? 0) & DeviceFeature.compressedFrames) !== 0;
    const packets = isCompressed
      ? encodeCompressedFrame(frame, sequence)
      : encodeFrame(frame, sequence);
    for (const packet of packets) {
      send(packet);
    }
    sentFrames[sequence % SENT_FRAME_HISTORY] = { sequence, sentAt: getTime() };
    sequence = (sequence + 1) >>> 0;
    updateConnection();
  }

  socket.on("error", (error) => onError?.(error));
  socket.on("message", (data, remote) => {
    const message = decodeMessage(data);
    if (message?.type !== "status") {
      return;
    }
    target = host ? target : { address: remote.address, port: remote.port };
    status = message.status;
    lastSeen = getTime();
    addLatencySample(status);
    if (brightness !== null && brightness !== status.brightness) {
      send(encodeSetBrightness(brightness));
    }
    updateState();
  });

  await bind(socket, port);
  const unsubscribe = engine.subscribe({ setFrame: sendFrame });

  return {
    getPort: () => socket.address().port,
    getState,
    getLatency: () => getLatency() ?? 0,
    setBrightness(value: number): void {
      brightness = value;
      send(encodeSetBrightness(value));
      updateState();
    },
    subscribe(listener: DeviceListener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close(): void {
      unsubscribe();
      listeners.clear();
      socket.close();
    },
  };
}
