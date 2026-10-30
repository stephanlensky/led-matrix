import {
  type AnimationInput,
  type ClipInfo,
  type PlaybackState,
  type StoredAnimation,
  CLIP_FRAME_BYTES,
  createFrame,
  createPlaybackEngine,
  encodeClipFrames,
  storedAnimationSchema,
} from "@led-matrix/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type RecordingState, idleRecordingState } from "../shared/api.ts";
import type { ResolvedCue } from "../shared/mapping.ts";
import { type LocalRenderProcess, createLocalClient, getUsedClips } from "./local-client.ts";
import type { RenderProcessOptions } from "./render-process.ts";
import {
  type RenderEvent,
  type RenderRequest,
  disabledRenderDeviceState,
} from "./render-protocol.ts";
import { createClipStore, createRenderService } from "./render-service.ts";
import type { ContentSource } from "./server.ts";
import { createSync } from "./sync.ts";

function getAnimation(id: string, clip?: string): StoredAnimation {
  const layer = clip
    ? { effect: "clip", params: { clip } }
    : { effect: "solid", params: { color: "#ff0000" } };
  const input: AnimationInput & { id: string } = {
    id,
    name: id,
    sections: [{ mode: { type: "loop", beats: 4 }, layers: [layer] }],
  };
  return storedAnimationSchema.parse(input);
}

function getClipInfo(id: string): ClipInfo {
  return { id, name: id, source: "image", durations: [100] };
}

function createFakeContent(animations: StoredAnimation[], clips: ClipInfo[]) {
  const content = {
    animations,
    clips,
    error: undefined as Error | undefined,
    frameRequests: [] as string[],
  };
  const source: ContentSource = {
    async getAnimations() {
      if (content.error) {
        throw content.error;
      }
      return content.animations;
    },
    getClips: async () => content.clips,
    async getClipFrames(id) {
      content.frameRequests.push(id);
      return encodeClipFrames(new Uint8Array(CLIP_FRAME_BYTES));
    },
  };
  return { content, source };
}

function createFakeProcess(options: RenderProcessOptions) {
  const engine = createPlaybackEngine({
    renderer: { render: () => createFrame() },
    fps: 30,
    bpm: 120,
  });
  const clips = createClipStore();
  const brightness: number[] = [];
  const frameStreams: boolean[] = [];
  const recordings: (string | null)[] = [];
  let recordingState: RecordingState = idleRecordingState;
  let response: RenderEvent | undefined;
  let isRunning = true;
  const service = createRenderService({
    engine,
    clips,
    setBrightness: (value) => brightness.push(value),
    send: (event) => {
      response = event;
    },
  });
  let nextId = 0;

  async function request(value: RenderRequest): Promise<PlaybackState> {
    if (!isRunning) {
      throw new Error("Render process exited with 1");
    }
    service.handle({ type: "request", id: nextId++, request: value });
    if (response?.type !== "response") {
      throw new Error("No response");
    }
    if ("error" in response) {
      throw new Error(response.error);
    }
    return response.state;
  }

  const render: LocalRenderProcess = {
    getState: () => request({ type: "getState" }),
    play: (value) => request({ type: "play", request: value }),
    stop: () => request({ type: "stop" }),
    pause: () => request({ type: "pause" }),
    setTimeline: (value) => request({ type: "setTimeline", request: value }),
    setClock: (value) => request({ type: "setClock", request: value }),
    setAnimations: vi.fn<LocalRenderProcess["setAnimations"]>((animations) =>
      service.handle({ type: "setAnimations", animations }),
    ),
    setClip: vi.fn<LocalRenderProcess["setClip"]>(({ id, durations, frames }) =>
      service.handle({
        type: "setClip",
        id,
        durations,
        frames: Buffer.from(frames).toString("base64"),
      }),
    ),
    removeClip: vi.fn<LocalRenderProcess["removeClip"]>((id) =>
      service.handle({ type: "removeClip", id }),
    ),
    setBrightness: (value) => service.handle({ type: "setBrightness", brightness: value }),
    setFrameStream: (isEnabled) => frameStreams.push(isEnabled),
    setRecording(directory) {
      recordings.push(directory);
      recordingState = {
        ...recordingState,
        isRecording: directory !== null,
        path: directory && `${directory}/recording.mkv`,
      };
      return Promise.resolve(recordingState);
    },
    getDeviceState: () => disabledRenderDeviceState,
    getRecordingState: () => recordingState,
    close: vi.fn<LocalRenderProcess["close"]>(() => exit("SIGTERM")),
  };

  function exit(code: number | string): void {
    isRunning = false;
    options.onExit?.(code);
  }

  return { render, options, clips, brightness, frameStreams, recordings, exit };
}

function setup(animations: StoredAnimation[], clips: ClipInfo[] = []) {
  const { content, source } = createFakeContent(animations, clips);
  const processes: ReturnType<typeof createFakeProcess>[] = [];
  const clock = { time: 0 };
  const logs: string[] = [];
  const client = createLocalClient({
    content: source,
    devicePath: "/dev/ttyACM0",
    latencyOffset: 20,
    getTime: () => clock.time,
    log: (message) => logs.push(message),
    createProcess: (options) => {
      const fake = createFakeProcess(options);
      processes.push(fake);
      return fake.render;
    },
  });
  return { client, content, processes, clock, logs };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("getUsedClips", () => {
  it("finds clips referenced by layers and parameter options", () => {
    const parameterized = storedAnimationSchema.parse({
      id: "parameterized",
      name: "Parameterized",
      parameters: [
        {
          name: "Clip",
          options: [
            { name: "A", values: { clip: "clip-a" } },
            { name: "B", values: { clip: "clip-b" } },
          ],
        },
      ],
      sections: [
        {
          mode: { type: "loop", beats: 4 },
          layers: [{ effect: "clip", params: { clip: { param: "clip" } } }],
        },
      ],
    });
    const clips = ["clip-a", "clip-b", "clip-c", "clip-d"].map(getClipInfo);
    expect(
      getUsedClips([parameterized, getAnimation("direct", "clip-c")], clips).map(({ id }) => id),
    ).toEqual(["clip-a", "clip-b", "clip-c"]);
  });
});

describe("createLocalClient", () => {
  it("starts the render process with the device options", () => {
    const { processes } = setup([]);
    expect(processes).toHaveLength(1);
    expect(processes[0]?.options).toMatchObject({ devicePath: "/dev/ttyACM0", latencyOffset: 20 });
  });

  it("loads animations and used clips before the first play", async () => {
    const { client, content, processes } = setup(
      [getAnimation("red"), getAnimation("clip-animation", "clip-a")],
      [getClipInfo("clip-a"), getClipInfo("clip-b")],
    );
    const state = await client.play({ id: "red", section: 0, beat: 0, bpm: 128 });
    expect(state).toMatchObject({ animationId: "red", bpm: 128 });
    expect(content.frameRequests).toEqual(["clip-a"]);
    expect(processes[0]?.clips.library.getClip("clip-a")).toBeDefined();
    expect(processes[0]?.clips.library.getClip("clip-b")).toBeUndefined();
  });

  it("reports state without loading animations", async () => {
    const { client, content } = setup([getAnimation("red")]);
    content.error = new Error("offline");
    await expect(client.getState()).resolves.toMatchObject({ animationId: null });
    await expect(client.play({ id: "red", section: 0, beat: 0, bpm: 120 })).rejects.toThrow(
      "offline",
    );
    content.error = undefined;
    await expect(client.play({ id: "red", section: 0, beat: 0, bpm: 120 })).resolves.toMatchObject({
      animationId: "red",
    });
  });

  it("returns render errors like the server", async () => {
    const { client } = setup([getAnimation("red")]);
    await expect(client.pause()).rejects.toThrow("Nothing is playing");
    await expect(client.play({ id: "blue", section: 0, beat: 0, bpm: 120 })).rejects.toThrow(
      'Animation "blue" not found',
    );
  });

  it("refreshes animations and clips on getAnimations", async () => {
    const { client, content, processes } = setup(
      [getAnimation("clip-animation", "clip-a")],
      [getClipInfo("clip-a"), getClipInfo("clip-b")],
    );
    expect(await client.getAnimations()).toHaveLength(1);
    content.animations = [getAnimation("clip-animation", "clip-b"), getAnimation("red")];
    expect(await client.getAnimations()).toHaveLength(2);
    await client.getAnimations();
    const [fake] = processes;
    expect(content.frameRequests).toEqual(["clip-a", "clip-b"]);
    expect(fake?.render.removeClip).toHaveBeenCalledWith("clip-a");
    await expect(client.play({ id: "red", section: 0, beat: 0, bpm: 120 })).resolves.toMatchObject({
      animationId: "red",
    });
  });

  it("shares a load between concurrent requests", async () => {
    const { client, processes } = setup([getAnimation("red")]);
    await Promise.all([
      client.play({ id: "red", section: 0, beat: 0, bpm: 120 }),
      client.getAnimations(),
    ]);
    expect(processes[0]?.render.setAnimations).toHaveBeenCalledTimes(1);
  });

  it("restarts the render process with its content, brightness and frame stream", async () => {
    vi.useFakeTimers();
    const { client, processes, clock, logs } = setup(
      [getAnimation("clip-animation", "clip-a")],
      [getClipInfo("clip-a")],
    );
    await client.getAnimations();
    client.setBrightness(40);
    client.setFrameStream(true);
    processes[0]?.exit(1);
    await expect(client.getState()).rejects.toThrow("exited");
    expect(logs).toContain("Render process exited with 1, restarting in 1 s");
    clock.time += 1000;
    vi.advanceTimersByTime(1000);
    const restarted = processes[1];
    expect(restarted?.clips.library.getClip("clip-a")).toBeDefined();
    expect(restarted?.brightness).toEqual([40]);
    expect(restarted?.frameStreams).toEqual([true]);
    await expect(
      client.play({ id: "clip-animation", section: 0, beat: 0, bpm: 120 }),
    ).resolves.toMatchObject({ animationId: "clip-animation" });
  });

  it("resumes recording into a new file after a restart", async () => {
    vi.useFakeTimers();
    const { client, processes, clock } = setup([]);
    await client.setRecording("/videos");
    processes[0]?.exit(1);
    clock.time += 1000;
    vi.advanceTimersByTime(1000);
    expect(processes[1]?.recordings).toEqual(["/videos"]);
  });

  it("does not resume a stopped recording after a restart", async () => {
    vi.useFakeTimers();
    const { client, processes, clock } = setup([]);
    await client.setRecording("/videos");
    await client.setRecording(null);
    processes[0]?.exit(1);
    clock.time += 1000;
    vi.advanceTimersByTime(1000);
    expect(processes[1]?.recordings).toEqual([]);
  });

  it("backs off when the render process keeps exiting", () => {
    vi.useFakeTimers();
    const { processes, clock, logs } = setup([]);
    for (let index = 0; index < 3; index++) {
      clock.time += 60_000;
      processes[index]?.exit(1);
      vi.advanceTimersByTime(1000);
    }
    processes[3]?.exit(1);
    vi.advanceTimersByTime(2000);
    processes[4]?.exit(1);
    vi.advanceTimersByTime(4000);
    processes[5]?.exit(1);
    expect(logs).toEqual([
      "Render process exited with 1, restarting in 1 s",
      "Render process exited with 1, restarting in 1 s",
      "Render process exited with 1, restarting in 1 s",
      "Render process exited with 1, restarting in 2 s",
      "Render process exited with 1, restarting in 4 s",
      "Render process exited with 1, restarting in 8 s",
    ]);
  });

  it("does not restart after close", () => {
    vi.useFakeTimers();
    const { client, processes, logs } = setup([]);
    client.close();
    vi.advanceTimersByTime(60_000);
    expect(processes).toHaveLength(1);
    expect(processes[0]?.render.close).toHaveBeenCalled();
    expect(logs).toEqual([]);
  });

  it("follows a track through sync", async () => {
    const cues: ResolvedCue[] = [
      { beat: 0, animationId: "red", section: 0, params: undefined, beats: undefined, offset: 0 },
    ];
    const { client } = setup([getAnimation("red")]);
    const logs: string[] = [];
    const sync = createSync({
      server: client,
      getMapping: () => new Map([["/music/a.flac", cues]]),
      keepCurrent: false,
      log: (message) => logs.push(message),
    });
    await sync.follow({ location: "/music/a.flac", beat: 4, bpm: 128, isPlaying: false, time: 0 });
    await expect(client.getState()).resolves.toMatchObject({
      animationId: "red",
      beat: 4,
      bpm: 128,
      paused: true,
      timeline: { cue: 0 },
    });
    await sync.follow({ location: "/music/a.flac", beat: 12, bpm: 128, isPlaying: false, time: 0 });
    await expect(client.getState()).resolves.toMatchObject({ beat: 12, paused: true });
    expect(logs).toEqual(["Loaded 1 cues for /music/a.flac", "Moved beat by 8.000"]);
  });
});
