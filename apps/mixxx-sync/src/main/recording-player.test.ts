import { EventEmitter } from "node:events";
import { CHANNELS, HEIGHT, WIDTH } from "@led-matrix/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RecordingPlayerState } from "../shared/api.ts";
import {
  type Decoder,
  createRecordingPlayer,
  getDecoderArgs,
  getRecordingInfo,
} from "./recording-player.ts";

const FRAME_BYTES = WIDTH * HEIGHT * CHANNELS;
const FRAME_MS = 1000 / 30;

function getProbe(width = 64, height = 64, duration = "1.000000"): string {
  return JSON.stringify({
    streams: [{ width, height, r_frame_rate: "30/1" }],
    format: { duration },
  });
}

function getFrames(values: number[]): Buffer {
  return Buffer.concat(values.map((value) => Buffer.alloc(FRAME_BYTES, value)));
}

function createFakeDecoder(args: string[]) {
  const events = new EventEmitter();
  const stdout = Object.assign(new EventEmitter(), {
    isPaused: false,
    pause() {
      stdout.isPaused = true;
    },
    resume() {
      stdout.isPaused = false;
    },
  });
  const stderr = new EventEmitter();
  const kill = vi.fn<() => void>();
  const decoder: Decoder = Object.assign(events, { stdout, stderr, kill });
  return {
    args,
    decoder,
    kill,
    stdout,
    write: (data: Buffer) => stdout.emit("data", data),
    fail: (message: string) => stderr.emit("data", Buffer.from(`${message}\n`)),
    close: (code: number) => events.emit("close", code),
  };
}

function setup(probe = getProbe()) {
  const clock = { time: 0 };
  const decoders: ReturnType<typeof createFakeDecoder>[] = [];
  const states: RecordingPlayerState[] = [];
  const frames: { value: number; positionMs: number }[] = [];
  const player = createRecordingPlayer({
    probe: () => Promise.resolve(probe),
    spawnDecoder(args) {
      const fake = createFakeDecoder(args);
      decoders.push(fake);
      return fake.decoder;
    },
    getTime: () => clock.time,
    onState: (state) => states.push(state),
    onFrame: (frame, positionMs) => frames.push({ value: frame[0] ?? 0, positionMs }),
  });
  function advance(ms: number) {
    clock.time += ms;
    vi.advanceTimersByTime(ms);
  }
  return { player, clock, decoders, states, frames, advance };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("getRecordingInfo", () => {
  it("reads the frame rate and duration", () => {
    expect(getRecordingInfo("/a.mkv", getProbe(64, 64, "18.500000"))).toEqual({
      path: "/a.mkv",
      fps: 30,
      frameCount: 555,
      durationMs: 18_500,
    });
  });

  it("rejects videos that are not 64x64", () => {
    expect(() => getRecordingInfo("/a.mkv", getProbe(1920, 1080))).toThrow(
      "Expected a 64x64 video, got 1920x1080",
    );
  });
});

describe("getDecoderArgs", () => {
  it("seeks and decodes to raw RGB", () => {
    expect(getDecoderArgs("/a.mkv", 1500)).toEqual([
      "-v",
      "error",
      "-ss",
      "1.500",
      "-i",
      "/a.mkv",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-",
    ]);
  });
});

describe("createRecordingPlayer", () => {
  it("shows the first frame after opening", async () => {
    const { player, decoders, frames } = setup();
    const state = await player.open("/a.mkv");
    expect(state).toMatchObject({ isPlaying: false, positionMs: 0, error: null });
    decoders[0]?.write(getFrames([1, 2]));
    expect(frames).toEqual([{ value: 1, positionMs: 0 }]);
  });

  it("plays decoded frames at the recording frame rate", async () => {
    vi.useFakeTimers();
    const { player, decoders, frames, advance } = setup();
    await player.open("/a.mkv");
    decoders[0]?.write(getFrames([1, 2, 3, 4, 5]));
    player.play();
    advance(FRAME_MS + 1);
    advance(FRAME_MS);
    expect(frames.map(({ value }) => value)).toEqual([1, 2, 3]);
    expect(frames.at(-1)?.positionMs).toBeCloseTo(FRAME_MS * 2);
  });

  it("skips frames to catch up after a stall", async () => {
    vi.useFakeTimers();
    const { player, decoders, frames, clock } = setup();
    await player.open("/a.mkv");
    decoders[0]?.write(getFrames([1, 2, 3, 4, 5]));
    player.play();
    clock.time += FRAME_MS * 3 + 1;
    vi.advanceTimersByTime(FRAME_MS / 2);
    expect(frames.map(({ value }) => value)).toEqual([1, 4]);
  });

  it("pauses the decoder when enough frames are queued", async () => {
    const { player, decoders } = setup(getProbe(64, 64, "10"));
    await player.open("/a.mkv");
    decoders[0]?.write(getFrames(Array.from({ length: 61 }, () => 0)));
    expect(decoders[0]?.stdout.isPaused).toBe(true);
  });

  it("restarts the decoder at the seek position", async () => {
    const { player, decoders, frames, states } = setup();
    await player.open("/a.mkv");
    player.seek(500);
    expect(decoders[0]?.kill).toHaveBeenCalled();
    expect(decoders[1]?.args).toContain("0.500");
    decoders[1]?.write(getFrames([7]));
    expect(frames.at(-1)?.value).toBe(7);
    expect(frames.at(-1)?.positionMs).toBeCloseTo(500);
    expect(states.at(-1)?.positionMs).toBeCloseTo(500);
  });

  it("stops at the end of the recording", async () => {
    vi.useFakeTimers();
    const { player, decoders, states, advance } = setup();
    await player.open("/a.mkv");
    decoders[0]?.write(getFrames([1, 2]));
    decoders[0]?.close(0);
    player.play();
    advance(FRAME_MS * 3);
    expect(states.at(-1)).toMatchObject({ isPlaying: false });
  });

  it("reports decoder errors", async () => {
    const { player, decoders, states } = setup();
    await player.open("/a.mkv");
    decoders[0]?.fail("/a.mkv: Invalid data found when processing input");
    decoders[0]?.close(1);
    expect(states.at(-1)?.error).toBe("/a.mkv: Invalid data found when processing input");
  });

  it("reports files it cannot open", async () => {
    const { player } = setup(getProbe(32, 32));
    const state = await player.open("/a.mkv");
    expect(state).toMatchObject({ info: null, error: "Expected a 64x64 video, got 32x32" });
  });

  it("restarts from the beginning when played at the end", async () => {
    const { player, decoders } = setup();
    await player.open("/a.mkv");
    player.seek(10_000);
    player.play();
    expect(decoders.at(-1)?.args).toContain("0.000");
  });
});
