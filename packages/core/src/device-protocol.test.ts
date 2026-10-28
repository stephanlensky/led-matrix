import { describe, expect, it } from "vitest";
import {
  DeviceMode,
  type DeviceStatus,
  type FrameChunk,
  STALE_FRAME_WINDOW,
  createFrameAssembler,
  decodeMessage,
  decodeRunLength,
  encodeCompressedFrame,
  encodeFrame,
  encodeSetBrightness,
  encodeStatus,
} from "./device-protocol.ts";
import { type Frame, createFrame, getPixel, setPixel } from "./frame.ts";

function createGradient(): Frame {
  const frame = createFrame();
  for (let y = 0; y < 64; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      setPixel(frame, x, y, [x * 4, y * 4, (x + y) % 256]);
    }
  }
  return frame;
}

function createNoise(): Frame {
  const frame = createFrame();
  let seed = 1;
  for (let index = 0; index < frame.length; index++) {
    seed = (seed * 1_103_515_245 + 12_345) >>> 0;
    frame[index] = seed >>> 24;
  }
  return frame;
}

function createSprite(): Frame {
  const frame = createFrame();
  for (let y = 20; y < 40; y += 1) {
    for (let x = 24; x < 40; x += 1) {
      setPixel(frame, x, y, [x * 4, 0, y * 4]);
    }
  }
  return frame;
}

function getChunks(
  frame: Frame,
  sequence: number,
  encode: typeof encodeFrame = encodeFrame,
): FrameChunk[] {
  return encode(frame, sequence).map((packet) => {
    const message = decodeMessage(packet);
    if (message?.type !== "frame") {
      throw new Error("Expected a frame chunk");
    }
    return message;
  });
}

function addAll(assembler: ReturnType<typeof createFrameAssembler>, chunks: FrameChunk[]) {
  return chunks.map((chunk) => assembler.add(chunk)).find((frame) => frame !== undefined);
}

describe("device protocol", () => {
  it("splits frames into packets that fit in a single datagram", () => {
    const packets = encodeFrame(createFrame(), 1);
    expect(packets).toHaveLength(10);
    expect(Math.max(...packets.map((packet) => packet.length))).toBeLessThanOrEqual(1472);
    expect(packets.reduce((total, packet) => total + packet.length - 12, 0)).toBe(64 * 64 * 3);
  });

  it("encodes the header in little endian", () => {
    const [packet = new Uint8Array()] = encodeFrame(createFrame(), 0x01020304);
    expect([...packet.subarray(0, 12)]).toEqual([
      0x4c, 0x4d, 1, 0x01, 0x04, 0x03, 0x02, 0x01, 0, 10, 0, 0,
    ]);
  });

  it("round trips status and brightness messages", () => {
    const status: DeviceStatus = {
      width: 64,
      height: 64,
      brightness: 128,
      mode: DeviceMode.streaming,
      features: 1,
      uptimeMs: 123_456,
      framesShown: 900,
      framesDropped: 3,
      shownSequence: 0xfffffff0,
      shownAgeMs: 120,
    };
    expect(decodeMessage(encodeStatus(status))).toEqual({ type: "status", status });
    expect(decodeMessage(encodeSetBrightness(42))).toEqual({
      type: "setBrightness",
      brightness: 42,
    });
  });

  it("ignores packets with the wrong magic, version or size", () => {
    const [packet = new Uint8Array()] = encodeFrame(createFrame(), 1);
    expect(decodeMessage(packet.slice(0, 3))).toBeUndefined();
    expect(decodeMessage(Uint8Array.of(0, 0, 1, 1))).toBeUndefined();
    expect(decodeMessage(Uint8Array.of(0x4c, 0x4d, 2, 1))).toBeUndefined();
    expect(decodeMessage(packet.slice(0, 13))).toBeUndefined();
  });
});

describe("compressed frames", () => {
  it.each([
    ["black", createFrame(), 1],
    ["sprite", createSprite(), 1],
    ["gradient", createGradient(), 9],
    ["noise", createNoise(), 9],
  ])("round trips a %s frame in %i packets", (_name, frame, packetCount) => {
    const packets = encodeCompressedFrame(frame, 7);
    expect(packets).toHaveLength(packetCount);
    expect(Math.max(...packets.map((packet) => packet.length))).toBeLessThanOrEqual(1472);
    const chunks = getChunks(frame, 7, encodeCompressedFrame);
    expect(addAll(createFrameAssembler(), chunks.toReversed())).toEqual(frame);
  });

  it("encodes the header with the pixel range of each chunk", () => {
    const [packet = new Uint8Array()] = encodeCompressedFrame(createFrame(), 0x01020304);
    expect([...packet.subarray(0, 14)]).toEqual([
      0x4c, 0x4d, 1, 0x03, 0x04, 0x03, 0x02, 0x01, 0, 1, 0, 0, 0x00, 0x10,
    ]);
    expect(packet).toHaveLength(14 + 32 * 4);
  });

  it("rejects runs that overflow or leave pixels unset", () => {
    expect(decodeRunLength(Uint8Array.of(0x81, 1, 2, 3), 2)).toEqual(
      Uint8Array.of(1, 2, 3, 1, 2, 3),
    );
    expect(decodeRunLength(Uint8Array.of(0x82, 1, 2, 3), 2)).toBeUndefined();
    expect(decodeRunLength(Uint8Array.of(0x80, 1, 2, 3), 2)).toBeUndefined();
    expect(decodeRunLength(Uint8Array.of(0x01, 1, 2, 3), 2)).toBeUndefined();
  });
});

describe("frame assembler", () => {
  it("reassembles a frame once every chunk arrived in any order", () => {
    const frame = createGradient();
    const assembler = createFrameAssembler();
    const assembled = addAll(assembler, getChunks(frame, 1).toReversed());
    expect(assembled).toEqual(frame);
    expect(getPixel(assembled ?? createFrame(), 10, 20)).toEqual([40, 80, 30]);
  });

  it("drops an incomplete frame when a newer one starts", () => {
    const assembler = createFrameAssembler();
    addAll(assembler, getChunks(createGradient(), 1).slice(1));
    expect(addAll(assembler, getChunks(createGradient(), 2))).toBeDefined();
    expect(assembler.getFramesDropped()).toBe(1);
  });

  it("ignores late chunks from older frames", () => {
    const assembler = createFrameAssembler();
    const older = getChunks(createGradient(), 5);
    const newer = getChunks(createGradient(), 6);
    addAll(assembler, newer.slice(0, 1));
    addAll(assembler, older.slice(1, 2));
    expect(addAll(assembler, newer.slice(1))).toBeDefined();
    expect(addAll(assembler, older)).toBeUndefined();
    expect(assembler.getFramesDropped()).toBe(0);
  });

  it("accepts a restarted sequence far behind the last frame", () => {
    const assembler = createFrameAssembler();
    addAll(assembler, getChunks(createGradient(), 5000));
    expect(addAll(assembler, getChunks(createGradient(), 0))).toBeDefined();
    expect(addAll(assembler, getChunks(createGradient(), 1 - STALE_FRAME_WINDOW))).toBeUndefined();
  });

  it("follows the sequence across wraparound", () => {
    const assembler = createFrameAssembler();
    addAll(assembler, getChunks(createGradient(), 0xffff_ffff));
    expect(addAll(assembler, getChunks(createGradient(), 0))).toBeDefined();
    expect(addAll(assembler, getChunks(createGradient(), 0xffff_ffff))).toBeUndefined();
  });
});
