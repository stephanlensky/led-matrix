import { spawn } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { type Frame, HEIGHT, WIDTH } from "@led-matrix/core";
import { type RecordingState, idleRecordingState } from "../shared/api.ts";

const SIZE_INTERVAL = 1000;

export type Encoder = {
  stdin: {
    write(chunk: Buffer): boolean;
    end(): void;
    on(event: "error", listener: () => void): unknown;
  };
  stderr: { on(event: "data", listener: (data: Buffer) => void): unknown };
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "close", listener: (code: number | null) => void): unknown;
};

export type RecorderOptions = {
  fps: number;
  spawnEncoder?: (args: string[]) => Encoder;
  getTime?: () => number;
  getDate?: () => number;
  onState: (state: RecordingState) => void;
};

type Session = {
  encoder: Encoder;
  firstFrameAt: number | undefined;
  framesWritten: number;
  lastFrame: Buffer | undefined;
};

function getPadded(value: number): string {
  return String(value).padStart(2, "0");
}

export function getRecordingName(date: Date): string {
  const day = [date.getFullYear(), date.getMonth() + 1, date.getDate()].map(getPadded).join("-");
  const time = [date.getHours(), date.getMinutes(), date.getSeconds()].map(getPadded).join("-");
  return `led-matrix-${day}_${time}.mkv`;
}

export function getEncoderArgs(fps: number, path: string, date: Date): string[] {
  return [
    ["-hide_banner", "-loglevel", "error", "-n"],
    ["-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${WIDTH}x${HEIGHT}`, "-r", String(fps)],
    ["-i", "-"],
    ["-c:v", "libx264rgb", "-qp", "0", "-preset", "veryslow"],
    ["-metadata", `creation_time=${date.toISOString()}`, path],
  ].flat();
}

export function getFrameCount(elapsedMs: number, fps: number): number {
  return Math.round((elapsedMs * fps) / 1000) + 1;
}

async function getSize(path: string): Promise<number> {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createRecorder({
  fps,
  spawnEncoder = (args) => spawn("ffmpeg", args),
  getTime = () => performance.now(),
  getDate = () => Date.now(),
  onState,
}: RecorderOptions) {
  let state: RecordingState = idleRecordingState;
  let session: Session | undefined;
  let isStarting = false;
  let startedAt = 0;

  function setState(changes: Partial<RecordingState>): void {
    state = { ...state, ...changes };
    onState(state);
  }

  function startEncoder(path: string, date: Date): void {
    const encoder = spawnEncoder(getEncoderArgs(fps, path, date));
    const current: Session = {
      encoder,
      firstFrameAt: undefined,
      framesWritten: 0,
      lastFrame: undefined,
    };
    let stderr = "";
    let error: string | null = null;
    session = current;
    const sizeTimer = setInterval(() => {
      void getSize(path).then((bytes) => {
        if (state.path === path && state.isRecording) {
          setState({ bytes, durationMs: getDate() - startedAt });
        }
      });
    }, SIZE_INTERVAL);

    encoder.stdin.on("error", () => {});
    encoder.stderr.on("data", (data: Buffer) => {
      stderr = (stderr + data.toString()).slice(-1000);
    });
    encoder.on("error", (cause) => {
      error = `Failed to start ffmpeg: ${cause.message}`;
    });
    encoder.on("close", (code) => {
      clearInterval(sizeTimer);
      if (session === current) {
        session = undefined;
      }
      if (code !== 0 && error === null) {
        error = stderr.trim().split("\n").at(-1) || `ffmpeg exited with ${code}`;
      }
      void getSize(path).then((bytes) => {
        if (state.path === path) {
          setState({ isRecording: false, bytes, error });
        }
      });
    });
  }

  return {
    async start(directory: string): Promise<void> {
      if (session || isStarting) {
        return;
      }
      const date = new Date(getDate());
      const path = join(directory, getRecordingName(date));
      isStarting = true;
      try {
        await mkdir(directory, { recursive: true });
        startedAt = date.getTime();
        setState({ isRecording: true, path, durationMs: 0, bytes: 0, error: null });
        startEncoder(path, date);
      } catch (error) {
        setState({ ...idleRecordingState, error: getErrorMessage(error) });
      } finally {
        isStarting = false;
      }
    },
    setFrame(frame: Frame): void {
      if (!session) {
        return;
      }
      const time = getTime();
      session.firstFrameAt ??= time;
      const copy = Buffer.from(frame);
      const count = getFrameCount(time - session.firstFrameAt, fps);
      while (session.framesWritten < count) {
        const isLast = session.framesWritten === count - 1;
        session.encoder.stdin.write(isLast ? copy : (session.lastFrame ?? copy));
        session.framesWritten++;
      }
      session.lastFrame = copy;
    },
    stop(): void {
      if (!session) {
        return;
      }
      const { encoder } = session;
      session = undefined;
      encoder.stdin.end();
      setState({ isRecording: false, durationMs: getDate() - startedAt });
    },
    getState: () => state,
  };
}
