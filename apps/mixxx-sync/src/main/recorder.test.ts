import { EventEmitter } from "node:events";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { createFrame } from "@led-matrix/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RecordingState } from "../shared/api.ts";
import {
  type Encoder,
  createRecorder,
  getEncoderArgs,
  getFrameCount,
  getRecordingName,
} from "./recorder.ts";

const FPS = 30;
const FRAME_MS = 1000 / FPS;

function createFakeEncoder() {
  const frames: number[] = [];
  let isEnded = false;
  const stdin = Object.assign(new EventEmitter(), {
    write(chunk: Buffer) {
      frames.push(chunk[0] ?? 0);
      return true;
    },
    end() {
      isEnded = true;
    },
  });
  const stderr = new PassThrough();
  const events = new EventEmitter();
  const encoder: Encoder = Object.assign(events, { stdin, stderr });
  return {
    encoder,
    frames,
    isEnded: () => isEnded,
    exit(code: number) {
      events.emit("close", code);
    },
    fail(message: string) {
      stderr.write(`${message}\n`);
    },
  };
}

function getFrame(value: number) {
  const frame = createFrame();
  frame[0] = value;
  return frame;
}

describe("recorder", () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true })));
  });

  async function setup() {
    const root = await mkdtemp(join(tmpdir(), "recorder-"));
    directories.push(root);
    const clock = { time: 0 };
    const states: RecordingState[] = [];
    const encoders: ReturnType<typeof createFakeEncoder>[] = [];
    const args: string[][] = [];
    const recorder = createRecorder({
      fps: FPS,
      spawnEncoder(value) {
        args.push(value);
        const fake = createFakeEncoder();
        encoders.push(fake);
        return fake.encoder;
      },
      getTime: () => clock.time,
      getDate: () => new Date(2026, 9, 31, 21, 5, 9).getTime(),
      onState: (state) => states.push(state),
    });
    return { recorder, root, directory: join(root, "mixxx-sync"), clock, states, encoders, args };
  }

  it("names recordings by local start time", () => {
    expect(getRecordingName(new Date(2026, 9, 31, 21, 5, 9))).toBe(
      "led-matrix-2026-10-31_21-05-09.mkv",
    );
  });

  it("encodes lossless RGB without overwriting", () => {
    const args = getEncoderArgs(30, "/videos/a.mkv", new Date(0));
    expect(args).toEqual(expect.arrayContaining(["-n", "libx264rgb", "-qp", "0", "64x64"]));
    expect(args.at(-1)).toBe("/videos/a.mkv");
  });

  it("counts frames from the first frame time", () => {
    expect(getFrameCount(0, FPS)).toBe(1);
    expect(getFrameCount(FRAME_MS * 2 + 10, FPS)).toBe(3);
    expect(getFrameCount(FRAME_MS * 2 - 10, FPS)).toBe(3);
  });

  it("creates the directory and reports the recording", async () => {
    const { recorder, directory, states } = await setup();
    await recorder.start(directory);
    await stat(directory);
    expect(states.at(-1)).toEqual({
      isRecording: true,
      path: join(directory, "led-matrix-2026-10-31_21-05-09.mkv"),
      durationMs: 0,
      bytes: 0,
      error: null,
    });
  });

  it("keeps a constant frame rate when ticks are late or early", async () => {
    const { recorder, directory, clock, encoders } = await setup();
    await recorder.start(directory);
    for (const [time, value] of [
      [1000, 1],
      [1000 + FRAME_MS + 5, 2],
      [1000 + FRAME_MS * 4, 3],
      [1000 + FRAME_MS * 4 + 8, 4],
      [1000 + FRAME_MS * 5 - 6, 5],
    ] as const) {
      clock.time = time;
      recorder.setFrame(getFrame(value));
    }
    expect(encoders[0]?.frames).toEqual([1, 2, 2, 2, 3, 5]);
  });

  it("copies frames so later changes are not recorded", async () => {
    const { recorder, directory, clock, encoders } = await setup();
    await recorder.start(directory);
    const frame = getFrame(1);
    recorder.setFrame(frame);
    frame[0] = 9;
    clock.time = FRAME_MS * 2;
    recorder.setFrame(getFrame(3));
    expect(encoders[0]?.frames).toEqual([1, 1, 3]);
  });

  it("ends the encoder input on stop and ignores later frames", async () => {
    const { recorder, directory, encoders, states } = await setup();
    await recorder.start(directory);
    recorder.setFrame(getFrame(1));
    recorder.stop();
    recorder.setFrame(getFrame(2));
    expect(encoders[0]?.isEnded()).toBe(true);
    expect(encoders[0]?.frames).toEqual([1]);
    expect(states.at(-1)).toMatchObject({ isRecording: false, error: null });
  });

  it("reports the last encoder error line when it fails", async () => {
    const { recorder, directory, encoders, states } = await setup();
    await recorder.start(directory);
    encoders[0]?.fail("Unknown encoder 'libx264rgb'");
    await new Promise((resolve) => setTimeout(resolve, 0));
    encoders[0]?.exit(1);
    await vi.waitFor(() =>
      expect(states.at(-1)).toMatchObject({
        isRecording: false,
        error: "Unknown encoder 'libx264rgb'",
      }),
    );
    await recorder.start(directory);
    expect(encoders).toHaveLength(2);
  });

  it("starts one encoder at a time", async () => {
    const { recorder, directory, encoders } = await setup();
    await Promise.all([recorder.start(directory), recorder.start(directory)]);
    expect(encoders).toHaveLength(1);
  });
});
