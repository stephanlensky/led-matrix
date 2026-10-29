import { fork } from "node:child_process";
import { join } from "node:path";
import type { Frame, PlaybackState, StoredAnimation } from "@led-matrix/core";
import {
  type RenderClip,
  type RenderDeviceState,
  type RenderEvent,
  type RenderMessage,
  type RenderOptions,
  type RenderRequest,
  disabledRenderDeviceState,
} from "./render-protocol.ts";
import type { ServerClient } from "./server.ts";

const RENDER_PRIORITY = 10;
const REQUEST_TIMEOUT = 2000;

type PendingRequest = {
  resolve: (state: PlaybackState) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export type RenderProcessOptions = Partial<RenderOptions> & {
  nodePath?: string;
  onState?: (state: PlaybackState) => void;
  onDevice?: (state: RenderDeviceState) => void;
  onLog?: (message: string) => void;
  onDeviceLog?: (text: string) => void;
  onFrame?: (frame: Frame) => void;
  onExit?: (code: number | string) => void;
};

export type RenderProcess = ReturnType<typeof createRenderProcess>;

export function createRenderProcess({
  nodePath = "node",
  onState,
  onDevice,
  onLog,
  onDeviceLog,
  onFrame,
  onExit,
  ...options
}: RenderProcessOptions = {}) {
  const child = fork(join(import.meta.dirname, "render.js"), [JSON.stringify(options)], {
    execPath: "nice",
    execArgv: ["-n", String(RENDER_PRIORITY), nodePath],
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  });
  const pending = new Map<number, PendingRequest>();
  let nextId = 0;
  let exitCode: number | string | undefined;
  let deviceState: RenderDeviceState = disabledRenderDeviceState;

  function post(message: RenderMessage): void {
    if (child.connected) {
      child.send(message);
    }
  }

  function request(value: RenderRequest): Promise<PlaybackState> {
    if (exitCode !== undefined) {
      return Promise.reject(new Error(`Render process exited with ${exitCode}`));
    }
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Render process did not answer ${value.type}`));
      }, REQUEST_TIMEOUT);
      pending.set(id, { resolve, reject, timer });
      post({ type: "request", id, request: value });
    });
  }

  function setResponse(event: Extract<RenderEvent, { type: "response" }>): void {
    const entry = pending.get(event.id);
    if (!entry) {
      return;
    }
    pending.delete(event.id);
    clearTimeout(entry.timer);
    if ("error" in event) {
      entry.reject(new Error(event.error));
    } else {
      entry.resolve(event.state);
    }
  }

  child.on("message", (event: RenderEvent) => {
    switch (event.type) {
      case "response":
        setResponse(event);
        break;
      case "state":
        onState?.(event.state);
        break;
      case "device":
        deviceState = event.state;
        onDevice?.(event.state);
        break;
      case "log":
        onLog?.(event.message);
        break;
      case "deviceLog":
        onDeviceLog?.(event.text);
        break;
      case "frame":
        onFrame?.(new Uint8ClampedArray(Buffer.from(event.frame, "base64")));
        break;
    }
  });
  function setExited(code: number | string): void {
    if (exitCode !== undefined) {
      return;
    }
    exitCode = code;
    deviceState = disabledRenderDeviceState;
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error(`Render process exited with ${exitCode}`));
    }
    pending.clear();
    onExit?.(code);
  }

  child.on("error", (error) => {
    onLog?.(`Render process error: ${error.message}`);
    if (child.pid === undefined) {
      setExited(error.message);
    }
  });
  child.once("exit", (code, signal) => setExited(code ?? signal ?? "unknown"));

  const client: Omit<ServerClient, "getAnimations"> = {
    getState: () => request({ type: "getState" }),
    play: (value) => request({ type: "play", request: value }),
    stop: () => request({ type: "stop" }),
    pause: () => request({ type: "pause" }),
    setTimeline: (value) => request({ type: "setTimeline", request: value }),
    setClock: (value) => request({ type: "setClock", request: value }),
  };

  return {
    ...client,
    setAnimations(animations: StoredAnimation[]): void {
      post({ type: "setAnimations", animations });
    },
    setClip({ id, durations, frames }: RenderClip): void {
      post({
        type: "setClip",
        id,
        durations,
        frames: Buffer.from(frames.buffer, frames.byteOffset, frames.byteLength).toString("base64"),
      });
    },
    removeClip(id: string): void {
      post({ type: "removeClip", id });
    },
    setBrightness(brightness: number): void {
      post({ type: "setBrightness", brightness });
    },
    setFrameStream(isEnabled: boolean): void {
      post({ type: "setFrameStream", isEnabled });
    },
    getDeviceState: () => deviceState,
    getPid: () => child.pid,
    isRunning: () => exitCode === undefined,
    close(): void {
      child.kill();
    },
  };
}
