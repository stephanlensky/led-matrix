import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { CHANNELS, HEIGHT, WIDTH } from "@led-matrix/core";
import { z } from "zod";
import {
  type RecordingInfo,
  type RecordingPlayerState,
  idleRecordingPlayerState,
} from "../shared/api.ts";

const FRAME_BYTES = WIDTH * HEIGHT * CHANNELS;
const MAX_QUEUED_FRAMES = 60;
const MIN_QUEUED_FRAMES = 30;

export type Decoder = {
  stdout: {
    on(event: "data", listener: (data: Buffer) => void): unknown;
    pause(): unknown;
    resume(): unknown;
  };
  stderr: { on(event: "data", listener: (data: Buffer) => void): unknown };
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "close", listener: (code: number | null) => void): unknown;
  kill(): unknown;
};

export type RecordingPlayerOptions = {
  probe?: (path: string) => Promise<string>;
  spawnDecoder?: (args: string[]) => Decoder;
  getTime?: () => number;
  onState: (state: RecordingPlayerState) => void;
  onFrame: (frame: Uint8Array, positionMs: number) => void;
};

type Session = {
  decoder: Decoder;
  queue: Buffer[];
  pending: Buffer;
  isDone: boolean;
  isPreviewing: boolean;
};

const probeSchema = z.object({
  streams: z.tuple([z.object({ width: z.number(), height: z.number(), r_frame_rate: z.string() })]),
  format: z.object({ duration: z.coerce.number() }),
});

const execFileAsync = promisify(execFile);

async function getProbeOutput(path: string): Promise<string> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-of",
    "json",
    "-show_entries",
    "stream=width,height,r_frame_rate:format=duration",
    path,
  ]);
  return stdout;
}

function getFrameRate(value: string): number {
  const [numerator = Number.NaN, denominator = 1] = value.split("/").map(Number);
  return numerator / denominator;
}

export function getRecordingInfo(path: string, output: string): RecordingInfo {
  const {
    streams: [{ width, height, r_frame_rate }],
    format,
  } = probeSchema.parse(JSON.parse(output));
  if (width !== WIDTH || height !== HEIGHT) {
    throw new Error(`Expected a ${WIDTH}x${HEIGHT} video, got ${width}x${height}`);
  }
  const fps = getFrameRate(r_frame_rate);
  if (!(fps > 0)) {
    throw new Error(`Invalid frame rate ${r_frame_rate}`);
  }
  const frameCount = Math.max(Math.round(format.duration * fps), 1);
  return { path, fps, frameCount, durationMs: (frameCount * 1000) / fps };
}

export function getDecoderArgs(path: string, startMs: number): string[] {
  return [
    ["-v", "error", "-ss", (startMs / 1000).toFixed(3), "-i", path],
    ["-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
  ].flat();
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createRecordingPlayer({
  probe = getProbeOutput,
  spawnDecoder = (args) => spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] }),
  getTime = () => performance.now(),
  onState,
  onFrame,
}: RecordingPlayerOptions) {
  let state: RecordingPlayerState = idleRecordingPlayerState;
  let session: Session | undefined;
  let shownFrame = 0;
  let clock = { time: 0, frame: 0 };
  let timer: ReturnType<typeof setInterval> | undefined;
  let openId = 0;

  function setState(changes: Partial<RecordingPlayerState>): void {
    state = { ...state, ...changes };
    onState(state);
  }

  function getFrameMs(): number {
    return 1000 / (state.info?.fps ?? 30);
  }

  function show(frame: Buffer, index: number): void {
    shownFrame = index;
    onFrame(frame, index * getFrameMs());
  }

  function stopDecoder(): void {
    session?.decoder.kill();
    session = undefined;
  }

  function addData(current: Session, data: Buffer): void {
    current.pending = Buffer.concat([current.pending, data]);
    while (current.pending.length >= FRAME_BYTES) {
      const frame = Buffer.from(current.pending.subarray(0, FRAME_BYTES));
      current.pending = current.pending.subarray(FRAME_BYTES);
      if (current.isPreviewing) {
        current.isPreviewing = false;
        show(frame, shownFrame);
      } else {
        current.queue.push(frame);
      }
    }
    if (current.queue.length >= MAX_QUEUED_FRAMES) {
      current.decoder.stdout.pause();
    }
  }

  function startDecoder(path: string, frame: number, isPreviewing: boolean): void {
    stopDecoder();
    const decoder = spawnDecoder(getDecoderArgs(path, frame * getFrameMs()));
    const current: Session = {
      decoder,
      queue: [],
      pending: Buffer.alloc(0),
      isDone: false,
      isPreviewing,
    };
    session = current;
    let stderr = "";
    let error: string | undefined;
    decoder.stdout.on("data", (data) => addData(current, data));
    decoder.stderr.on("data", (data) => {
      stderr = (stderr + data.toString()).slice(-1000);
    });
    decoder.on("error", (cause) => {
      error = `Failed to start ffmpeg: ${cause.message}`;
    });
    decoder.on("close", (code) => {
      if (session !== current) {
        return;
      }
      current.isDone = true;
      if (code !== 0) {
        stopPlaying();
        setState({
          error: error ?? (stderr.trim().split("\n").at(-1) || `ffmpeg exited with ${code}`),
        });
      }
    });
  }

  function tick(): void {
    if (!session) {
      return;
    }
    const target = clock.frame + Math.floor((getTime() - clock.time) / getFrameMs());
    let frame: Buffer | undefined;
    let index = shownFrame;
    while (index < target && session.queue.length > 0) {
      frame = session.queue.shift();
      index++;
    }
    if (frame) {
      show(frame, index);
    }
    if (session.queue.length < MIN_QUEUED_FRAMES) {
      session.decoder.stdout.resume();
    }
    if (session.queue.length === 0 && session.isDone) {
      stopPlaying();
    }
  }

  function startPlaying(): void {
    clock = { time: getTime(), frame: shownFrame };
    timer = setInterval(tick, getFrameMs() / 2);
    setState({ isPlaying: true });
  }

  function stopPlaying(): void {
    clearInterval(timer);
    timer = undefined;
    setState({ isPlaying: false, positionMs: shownFrame * getFrameMs() });
  }

  function seek(frame: number): void {
    const { info, isPlaying } = state;
    if (!info) {
      return;
    }
    if (isPlaying) {
      stopPlaying();
    }
    shownFrame = Math.min(Math.max(frame, 0), info.frameCount - 1);
    setState({ positionMs: shownFrame * getFrameMs() });
    startDecoder(info.path, shownFrame, true);
    if (isPlaying) {
      startPlaying();
    }
  }

  return {
    async open(path: string): Promise<RecordingPlayerState> {
      const id = ++openId;
      if (state.isPlaying) {
        stopPlaying();
      }
      stopDecoder();
      try {
        const info = getRecordingInfo(path, await probe(path));
        if (id === openId) {
          setState({ info, positionMs: 0, isPlaying: false, error: null });
          seek(0);
        }
      } catch (error) {
        if (id === openId) {
          setState({ ...idleRecordingPlayerState, error: getErrorMessage(error) });
        }
      }
      return state;
    },
    play(): void {
      const { info, isPlaying } = state;
      if (!info || isPlaying) {
        return;
      }
      if (shownFrame >= info.frameCount - 1 || !session) {
        seek(shownFrame >= info.frameCount - 1 ? 0 : shownFrame);
      }
      startPlaying();
    },
    pause(): void {
      if (state.isPlaying) {
        stopPlaying();
      }
    },
    seek(positionMs: number): void {
      seek(Math.round(positionMs / getFrameMs()));
    },
    getState: () => state,
    close(): void {
      openId++;
      clearInterval(timer);
      stopDecoder();
      setState(idleRecordingPlayerState);
    },
  };
}
