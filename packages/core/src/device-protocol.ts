import { z } from "zod";
import { CHANNELS, type Frame, HEIGHT, WIDTH, createFrame } from "./frame.ts";

export const DEVICE_PORT = 7700;
export const SERVER_PORT = 7701;
export const PROTOCOL_VERSION = 1;
export const HEADER_SIZE = 4;
export const FRAME_HEADER_SIZE = 12;
export const COMPRESSED_FRAME_HEADER_SIZE = 14;
export const MAX_CHUNK_PIXELS = 448;
export const MAX_PACKET_SIZE = FRAME_HEADER_SIZE + MAX_CHUNK_PIXELS * CHANNELS;
export const STALE_FRAME_WINDOW = 16;
export const FRAME_TIMEOUT_MS = 2000;
export const STATUS_INTERVAL_MS = 1000;

const MAGIC = [0x4c, 0x4d] as const;
const BRIGHTNESS_SIZE = HEADER_SIZE + 1;
const STATUS_SIZE = 32;

export const MessageType = {
  frame: 0x01,
  setBrightness: 0x02,
  compressedFrame: 0x03,
  status: 0x81,
} as const;

export const DeviceMode = {
  idle: 0,
  streaming: 1,
  fallback: 2,
} as const;

export type DeviceMode = (typeof DeviceMode)[keyof typeof DeviceMode];

export const DeviceFeature = {
  compressedFrames: 0x01,
} as const;

const MAX_RUN = 128;
const MIN_REPEAT_RUN = 3;
const REPEAT_FLAG = 0x80;

export const deviceStatusSchema = z.object({
  width: z.int(),
  height: z.int(),
  brightness: z.int(),
  mode: z.literal([DeviceMode.idle, DeviceMode.streaming, DeviceMode.fallback]),
  features: z.int(),
  uptimeMs: z.int(),
  framesShown: z.int(),
  framesDropped: z.int(),
  shownSequence: z.int(),
  shownAgeMs: z.int(),
});

export type DeviceStatus = z.infer<typeof deviceStatusSchema>;

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

function isSamePixel(frame: Frame, a: number, b: number): boolean {
  const first = a * CHANNELS;
  const second = b * CHANNELS;
  return (
    frame[first] === frame[second] &&
    frame[first + 1] === frame[second + 1] &&
    frame[first + 2] === frame[second + 2]
  );
}

function getRunLength(frame: Frame, start: number): number {
  let length = 1;
  while (
    length < MAX_RUN &&
    start + length < PIXEL_COUNT &&
    isSamePixel(frame, start, start + length)
  ) {
    length++;
  }
  return length;
}

type CompressedChunk = { offset: number; pixelCount: number; bytes: number[] };

function getCompressedChunk(frame: Frame, offset: number): CompressedChunk {
  const bytes: number[] = [];
  const budget = MAX_PACKET_SIZE - COMPRESSED_FRAME_HEADER_SIZE;
  let pixel = offset;
  while (pixel < PIXEL_COUNT && bytes.length + 1 + CHANNELS <= budget) {
    const run = getRunLength(frame, pixel);
    if (run >= MIN_REPEAT_RUN) {
      bytes.push(
        REPEAT_FLAG + run - 1,
        ...frame.subarray(pixel * CHANNELS, (pixel + 1) * CHANNELS),
      );
      pixel += run;
      continue;
    }
    let count = 1;
    while (
      count < MAX_RUN &&
      pixel + count < PIXEL_COUNT &&
      bytes.length + 1 + (count + 1) * CHANNELS <= budget &&
      getRunLength(frame, pixel + count) < MIN_REPEAT_RUN
    ) {
      count++;
    }
    bytes.push(count - 1, ...frame.subarray(pixel * CHANNELS, (pixel + count) * CHANNELS));
    pixel += count;
  }
  return { offset, pixelCount: pixel - offset, bytes };
}

export function encodeCompressedFrame(frame: Frame, sequence: number): Uint8Array[] {
  const chunks: CompressedChunk[] = [];
  for (let offset = 0; offset < PIXEL_COUNT;) {
    const chunk = getCompressedChunk(frame, offset);
    chunks.push(chunk);
    offset += chunk.pixelCount;
  }
  return chunks.map(({ offset, pixelCount, bytes: data }, chunkIndex) => {
    const { bytes, view } = createMessage(
      MessageType.compressedFrame,
      COMPRESSED_FRAME_HEADER_SIZE + data.length,
    );
    view.setUint32(4, sequence >>> 0, true);
    view.setUint8(8, chunkIndex);
    view.setUint8(9, chunks.length);
    view.setUint16(10, offset, true);
    view.setUint16(12, pixelCount, true);
    bytes.set(data, COMPRESSED_FRAME_HEADER_SIZE);
    return bytes;
  });
}

export function decodeRunLength(data: Uint8Array, pixelCount: number): Uint8Array | undefined {
  const pixels = new Uint8Array(pixelCount * CHANNELS);
  let position = 0;
  let pixel = 0;
  while (position < data.length) {
    const token = data[position++]!;
    const isRepeat = token >= REPEAT_FLAG;
    const count = (token & (REPEAT_FLAG - 1)) + 1;
    const size = isRepeat ? CHANNELS : count * CHANNELS;
    if (pixel + count > pixelCount || position + size > data.length) {
      return undefined;
    }
    for (let index = 0; index < count; index++) {
      const source = isRepeat ? position : position + index * CHANNELS;
      pixels.set(data.subarray(source, source + CHANNELS), (pixel + index) * CHANNELS);
    }
    position += size;
    pixel += count;
  }
  return pixel === pixelCount ? pixels : undefined;
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
  view.setUint8(10, status.features);
  view.setUint32(12, status.uptimeMs >>> 0, true);
  view.setUint32(16, status.framesShown >>> 0, true);
  view.setUint32(20, status.framesDropped >>> 0, true);
  view.setUint32(24, status.shownSequence >>> 0, true);
  view.setUint16(28, Math.min(status.shownAgeMs, 0xffff), true);
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
    case MessageType.compressedFrame: {
      if (bytes.length < COMPRESSED_FRAME_HEADER_SIZE) {
        return undefined;
      }
      const offset = view.getUint16(10, true);
      const pixelCount = view.getUint16(12, true);
      if (pixelCount === 0 || offset + pixelCount > PIXEL_COUNT) {
        return undefined;
      }
      const pixels = decodeRunLength(bytes.subarray(COMPRESSED_FRAME_HEADER_SIZE), pixelCount);
      return pixels
        ? {
            type: "frame",
            sequence: view.getUint32(4, true),
            chunkIndex: view.getUint8(8),
            chunkCount: view.getUint8(9),
            offset,
            pixels,
          }
        : undefined;
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
          features: view.getUint8(10),
          uptimeMs: view.getUint32(12, true),
          framesShown: view.getUint32(16, true),
          framesDropped: view.getUint32(20, true),
          shownSequence: view.getUint32(24, true),
          shownAgeMs: view.getUint16(28, true),
        },
      };
    }
    default:
      return undefined;
  }
}

export const SERIAL_DELIMITER = 0x00;
export const MAX_SERIAL_PACKET_SIZE = 1472;

const MAX_BLOCK_CODE = 0xff;

export function getMaxEncodedSerialSize(size: number): number {
  return size + Math.max(1, Math.ceil(size / (MAX_BLOCK_CODE - 1))) + 1;
}

export function encodeSerialPacket(packet: Uint8Array): Uint8Array {
  const encoded = new Uint8Array(getMaxEncodedSerialSize(packet.length));
  let codeIndex = 0;
  let position = 1;
  let code = 1;
  for (let index = 0; index < packet.length; index++) {
    const byte = packet[index]!;
    if (byte !== SERIAL_DELIMITER) {
      encoded[position++] = byte;
      code++;
    }
    if (byte === SERIAL_DELIMITER || (code === MAX_BLOCK_CODE && index + 1 < packet.length)) {
      encoded[codeIndex] = code;
      code = 1;
      codeIndex = position++;
    }
  }
  encoded[codeIndex] = code;
  encoded[position++] = SERIAL_DELIMITER;
  return encoded.slice(0, position);
}

export type SerialDecoder = ReturnType<typeof createSerialDecoder>;

export function createSerialDecoder(maxPacketSize = MAX_SERIAL_PACKET_SIZE) {
  const buffer = new Uint8Array(maxPacketSize);
  let size = 0;
  let remaining = 0;
  let isStarted = false;
  let isZeroPending = false;
  let isDiscarding = false;

  function reset() {
    size = 0;
    remaining = 0;
    isStarted = false;
    isZeroPending = false;
    isDiscarding = false;
  }

  function append(byte: number) {
    if (size === maxPacketSize) {
      isDiscarding = true;
      return;
    }
    buffer[size++] = byte;
  }

  function addByte(byte: number): Uint8Array | undefined {
    if (byte === SERIAL_DELIMITER) {
      const isComplete = isStarted && !isDiscarding && remaining === 0 && size > 0;
      const packet = isComplete ? buffer.slice(0, size) : undefined;
      reset();
      return packet;
    }
    if (isDiscarding) {
      return undefined;
    }
    if (remaining > 0) {
      append(byte);
      remaining--;
      return undefined;
    }
    if (isZeroPending) {
      append(SERIAL_DELIMITER);
    }
    isStarted = true;
    isZeroPending = byte !== MAX_BLOCK_CODE;
    remaining = byte - 1;
    return undefined;
  }

  return {
    add(bytes: Uint8Array): Uint8Array[] {
      const packets: Uint8Array[] = [];
      for (const byte of bytes) {
        const packet = addByte(byte);
        if (packet) {
          packets.push(packet);
        }
      }
      return packets;
    },
  };
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
