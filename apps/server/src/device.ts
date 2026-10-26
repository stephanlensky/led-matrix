import { type Socket, createSocket } from "node:dgram";
import {
  DEVICE_PORT,
  type DeviceStatus,
  type Frame,
  SERVER_PORT,
  STATUS_INTERVAL_MS,
  decodeMessage,
  encodeFrame,
  encodeSetBrightness,
} from "@led-matrix/core";
import type { PlaybackEngine } from "./engine.ts";

const CONNECTION_TIMEOUT_MS = STATUS_INTERVAL_MS * 3;

export type DeviceAddress = { address: string; port: number };

export type DeviceState = {
  connected: boolean;
  address: DeviceAddress | null;
  status: DeviceStatus | null;
  brightness: number | null;
};

export type DeviceLinkOptions = {
  engine: PlaybackEngine;
  port?: number;
  host?: string;
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
  getTime = () => performance.now(),
  onError,
}: DeviceLinkOptions) {
  const socket = createSocket("udp4");
  let target: DeviceAddress | null = host ? { address: host, port: DEVICE_PORT } : null;
  let status: DeviceStatus | null = null;
  let lastSeen: number | undefined;
  let brightness: number | null = null;
  let sequence = 0;

  function send(packet: Uint8Array): void {
    if (target) {
      socket.send(packet, target.port, target.address);
    }
  }

  function sendFrame(frame: Frame): void {
    for (const packet of encodeFrame(frame, sequence)) {
      send(packet);
    }
    sequence = (sequence + 1) >>> 0;
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
    if (brightness !== null && brightness !== status.brightness) {
      send(encodeSetBrightness(brightness));
    }
  });

  await bind(socket, port);
  const unsubscribe = engine.subscribe({ setFrame: sendFrame });

  return {
    getPort: () => socket.address().port,
    getState(): DeviceState {
      const connected = lastSeen !== undefined && getTime() - lastSeen < CONNECTION_TIMEOUT_MS;
      return { connected, address: target, status, brightness };
    },
    setBrightness(value: number): void {
      brightness = value;
      send(encodeSetBrightness(value));
    },
    close(): void {
      unsubscribe();
      socket.close();
    },
  };
}
