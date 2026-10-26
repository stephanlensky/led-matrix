import { CHANNELS, type Frame, HEIGHT, WIDTH, createFrame } from "./frame.ts";

export const DEVICE_PORT = 7700;
export const SERVER_PORT = 7701;
export const PROTOCOL_VERSION = 1;
export const HEADER_SIZE = 4;
export const FRAME_HEADER_SIZE = 12;
export const MAX_CHUNK_PIXELS = 448;
export const STALE_FRAME_WINDOW = 16;
export const FRAME_TIMEOUT_MS = 2000;
export const STATUS_INTERVAL_MS = 1000;

const MAGIC = [0x4c, 0x4d] as const;
const BRIGHTNESS_SIZE = HEADER_SIZE + 1;
const STATUS_SIZE = 24;

export const MessageType = {
  frame: 0x01,
  setBrightness: 0x02,
  status: 0x81,
} as const;

export const DeviceMode = {
  idle: 0,
  streaming: 1,
  fallback: 2,
} as const;

export type DeviceMode = (typeof DeviceMode)[keyof typeof DeviceMode];

export type DeviceStatus = {
  width: number;
  height: number;
  brightness: number;
  mode: DeviceMode;
  uptimeMs: number;
  framesShown: number;
  framesDropped: number;
};

export type FrameChunk = {
  sequence: number;
  chunkIndex: number;
  chunkCount: number;
  offset: number;
  pixels: Uint8Array;
};

export type DeviceMessage =
  | ({ type: "frame" } & FrameChunk)
  | { type: "setBrightness"; brightness: number }
  | { type: "status"; status: DeviceStatus };

function createMessage(type: number, size: number): { bytes: Uint8Array; view: DataView } {
  const bytes = new Uint8Array(size);
  bytes.set([...MAGIC, PROTOCOL_VERSION, type]);
  return { bytes, view: new DataView(bytes.buffer) };
}

const PIXEL_COUNT = WIDTH * HEIGHT;
const CHUNK_COUNT = Math.ceil(PIXEL_COUNT / MAX_CHUNK_PIXELS);

export function encodeFrame(frame: Frame, sequence: number): Uint8Array[] {
  return Array.from({ length: CHUNK_COUNT }, (_, chunkIndex) => {
    const offset = chunkIndex * MAX_CHUNK_PIXELS;
    const pixelCount = Math.min(MAX_CHUNK_PIXELS, PIXEL_COUNT - offset);
    const { bytes, view } = createMessage(
      MessageType.frame,
      FRAME_HEADER_SIZE + pixelCount * CHANNELS,
    );
    view.setUint32(4, sequence >>> 0, true);
    view.setUint8(8, chunkIndex);
    view.setUint8(9, CHUNK_COUNT);
    view.setUint16(10, offset, true);
    bytes.set(
      frame.subarray(offset * CHANNELS, (offset + pixelCount) * CHANNELS),
      FRAME_HEADER_SIZE,
    );
    return bytes;
  });
}

export function encodeSetBrightness(brightness: number): Uint8Array {
  const { bytes, view } = createMessage(MessageType.setBrightness, BRIGHTNESS_SIZE);
  view.setUint8(4, brightness);
  return bytes;
}

export function encodeStatus(status: DeviceStatus): Uint8Array {
  const { bytes, view } = createMessage(MessageType.status, STATUS_SIZE);
  view.setUint16(4, status.width, true);
  view.setUint16(6, status.height, true);
  view.setUint8(8, status.brightness);
  view.setUint8(9, status.mode);
  view.setUint32(12, status.uptimeMs >>> 0, true);
  view.setUint32(16, status.framesShown >>> 0, true);
  view.setUint32(20, status.framesDropped >>> 0, true);
  return bytes;
}

function isDeviceMode(value: number): value is DeviceMode {
  return Object.values<number>(DeviceMode).includes(value);
}

export function decodeMessage(bytes: Uint8Array): DeviceMessage | undefined {
  if (
    bytes.length < HEADER_SIZE ||
    bytes[0] !== MAGIC[0] ||
    bytes[1] !== MAGIC[1] ||
    bytes[2] !== PROTOCOL_VERSION
  ) {
    return undefined;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  switch (bytes[3]) {
    case MessageType.frame: {
      const pixelBytes = bytes.length - FRAME_HEADER_SIZE;
      if (pixelBytes <= 0 || pixelBytes % CHANNELS !== 0) {
        return undefined;
      }
      const offset = view.getUint16(10, true);
      if (offset + pixelBytes / CHANNELS > PIXEL_COUNT) {
        return undefined;
      }
      return {
        type: "frame",
        sequence: view.getUint32(4, true),
        chunkIndex: view.getUint8(8),
        chunkCount: view.getUint8(9),
        offset,
        pixels: bytes.subarray(FRAME_HEADER_SIZE),
      };
    }
    case MessageType.setBrightness:
      return bytes.length < BRIGHTNESS_SIZE
        ? undefined
        : { type: "setBrightness", brightness: view.getUint8(4) };
    case MessageType.status: {
      const mode = view.getUint8(9);
      if (bytes.length < STATUS_SIZE || !isDeviceMode(mode)) {
        return undefined;
      }
      return {
        type: "status",
        status: {
          width: view.getUint16(4, true),
          height: view.getUint16(6, true),
          brightness: view.getUint8(8),
          mode,
          uptimeMs: view.getUint32(12, true),
          framesShown: view.getUint32(16, true),
          framesDropped: view.getUint32(20, true),
        },
      };
    }
    default:
      return undefined;
  }
}

function getSequenceDistance(from: number, to: number): number {
  return (to - from) | 0;
}

export type FrameAssembler = ReturnType<typeof createFrameAssembler>;

export function createFrameAssembler() {
  let pending: { sequence: number; frame: Frame; received: Set<number> } | undefined;
  let latest: number | undefined;
  let framesDropped = 0;

  function isStale(sequence: number): boolean {
    if (latest === undefined) {
      return false;
    }
    const behind = getSequenceDistance(sequence, latest);
    return behind >= 0 && behind < STALE_FRAME_WINDOW;
  }

  return {
    getFramesDropped: () => framesDropped,
    add(chunk: FrameChunk): Frame | undefined {
      if (chunk.chunkIndex >= chunk.chunkCount) {
        return undefined;
      }
      if (pending?.sequence !== chunk.sequence) {
        if (isStale(chunk.sequence)) {
          return undefined;
        }
        if (pending) {
          framesDropped += 1;
        }
        pending = { sequence: chunk.sequence, frame: createFrame(), received: new Set() };
        latest = chunk.sequence;
      }
      pending.frame.set(chunk.pixels, chunk.offset * CHANNELS);
      pending.received.add(chunk.chunkIndex);
      if (pending.received.size < chunk.chunkCount) {
        return undefined;
      }
      const { frame } = pending;
      pending = undefined;
      return frame;
    },
  };
}
