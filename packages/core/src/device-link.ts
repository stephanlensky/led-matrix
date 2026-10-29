import { CHANNELS, type Frame, HEIGHT, WIDTH } from "./frame.ts";
import {
  DeviceFeature,
  DeviceMode,
  type DeviceMessage,
  type DeviceStatus,
  FRAME_HEADER_SIZE,
  MAX_CHUNK_PIXELS,
  STATUS_INTERVAL_MS,
  encodeCompressedFrame,
  encodeFrame,
  encodeSetBrightness,
} from "./device-protocol.ts";
import type { PlaybackEngine } from "./engine.ts";
import type { DeviceState } from "./playback.ts";

const CONNECTION_TIMEOUT_MS = STATUS_INTERVAL_MS * 3;
const SENT_FRAME_HISTORY = 256;
const LATENCY_SAMPLES = 8;
const RAW_FRAME_SIZE =
  Math.ceil((WIDTH * HEIGHT) / MAX_CHUNK_PIXELS) * FRAME_HEADER_SIZE + WIDTH * HEIGHT * CHANNELS;

export type DeviceAddress = NonNullable<DeviceState["address"]>;

export type DeviceListener = (state: DeviceState) => void;

export type DeviceTransportListener = {
  setMessage?: (message: DeviceMessage) => void;
  setConnected?: (connected: boolean) => void;
};

export type DeviceTransport = {
  getAddress: () => DeviceAddress | null;
  send: (packet: Uint8Array) => void;
  sendFrame: (packets: Uint8Array[]) => boolean;
  subscribe: (listener: DeviceTransportListener) => () => void;
  close: () => void;
};

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
  transport: DeviceTransport;
  latencyOffset?: number;
  getTime?: () => number;
  onLog?: (text: string) => void;
};

export type DeviceLink = ReturnType<typeof createDeviceLink>;

function getSize(packets: Uint8Array[]): number {
  return packets.reduce((size, packet) => size + packet.length, 0);
}

export function encodeSmallestFrame(
  frame: Frame,
  sequence: number,
  features: number,
): Uint8Array[] {
  if ((features & DeviceFeature.compressedFrames) === 0) {
    return encodeFrame(frame, sequence);
  }
  const packets = encodeCompressedFrame(frame, sequence);
  return getSize(packets) <= RAW_FRAME_SIZE ? packets : encodeFrame(frame, sequence);
}

export function createDeviceLink({
  engine,
  transport,
  latencyOffset = 0,
  getTime = () => performance.now(),
  onLog,
}: DeviceLinkOptions) {
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
      address: transport.getAddress(),
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

  function sendFrame(frame: Frame): void {
    const packets = encodeSmallestFrame(frame, sequence, status?.features ?? 0);
    if (transport.sendFrame(packets)) {
      sentFrames[sequence % SENT_FRAME_HISTORY] = { sequence, sentAt: getTime() };
      sequence = (sequence + 1) >>> 0;
    }
    updateConnection();
  }

  function setStatus(value: DeviceStatus): void {
    status = value;
    lastSeen = getTime();
    addLatencySample(status);
    if (brightness !== null && brightness !== status.brightness) {
      transport.send(encodeSetBrightness(brightness));
    }
    updateState();
  }

  const unsubscribeTransport = transport.subscribe({
    setMessage(message) {
      if (message.type === "status") {
        setStatus(message.status);
      } else if (message.type === "log") {
        onLog?.(message.text);
      }
    },
    setConnected(connected) {
      if (!connected) {
        lastSeen = undefined;
        updateState();
      }
    },
  });
  const unsubscribeEngine = engine.subscribe({ setFrame: sendFrame });

  return {
    getState,
    getLatency: () => getLatency() ?? 0,
    setBrightness(value: number): void {
      brightness = value;
      transport.send(encodeSetBrightness(value));
      updateState();
    },
    subscribe(listener: DeviceListener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close(): void {
      unsubscribeEngine();
      unsubscribeTransport();
      listeners.clear();
      transport.close();
    },
  };
}
