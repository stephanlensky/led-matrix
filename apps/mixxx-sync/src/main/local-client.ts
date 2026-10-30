import type { ClipInfo, Frame, PlaybackState, StoredAnimation } from "@led-matrix/core";
import type { RecordingState } from "../shared/api.ts";
import type { RenderClip, RenderDeviceState } from "./render-protocol.ts";
import {
  type RenderProcess,
  type RenderProcessOptions,
  createRenderProcess,
} from "./render-process.ts";
import type { ContentSource, ServerClient } from "./server.ts";

const MIN_RESTART_DELAY = 1000;
const MAX_RESTART_DELAY = 30_000;
const STABLE_UPTIME = 10_000;

export type LocalRenderProcess = Pick<
  RenderProcess,
  | "getState"
  | "play"
  | "stop"
  | "pause"
  | "setTimeline"
  | "setClock"
  | "setAnimations"
  | "setClip"
  | "removeClip"
  | "setBrightness"
  | "setFrameStream"
  | "setRecording"
  | "getDeviceState"
  | "getRecordingState"
  | "close"
>;

export type LocalClientOptions = {
  content: ContentSource;
  devicePath?: string;
  latencyOffset?: number;
  createProcess?: (options: RenderProcessOptions) => LocalRenderProcess;
  getTime?: () => number;
  log?: (message: string) => void;
  onState?: (state: PlaybackState) => void;
  onDevice?: (state: RenderDeviceState) => void;
  onDeviceLog?: (text: string) => void;
  onFrame?: (frame: Frame) => void;
};

export type LocalClient = ServerClient & {
  load(): Promise<StoredAnimation[]>;
  setBrightness(brightness: number): void;
  setFrameStream(isEnabled: boolean): void;
  setRecording(directory: string | null): Promise<RecordingState>;
  getDeviceState(): RenderDeviceState;
  getRecordingState(): RecordingState;
  close(): void;
};

function getStrings(value: unknown, strings: Set<string>): Set<string> {
  if (typeof value === "string") {
    strings.add(value);
  } else if (Array.isArray(value)) {
    for (const item of value) {
      getStrings(item, strings);
    }
  } else if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value)) {
      getStrings(item, strings);
    }
  }
  return strings;
}

export function getUsedClips(
  animations: readonly StoredAnimation[],
  clips: readonly ClipInfo[],
): ClipInfo[] {
  const strings = getStrings(
    animations.map(({ sections, parameters }) => [sections, parameters]),
    new Set(),
  );
  return clips.filter(({ id }) => strings.has(id));
}

export function createLocalClient({
  content,
  devicePath,
  latencyOffset,
  createProcess = createRenderProcess,
  getTime = () => Date.now(),
  log = console.log,
  onState,
  onDevice,
  onDeviceLog,
  onFrame,
}: LocalClientOptions): LocalClient {
  const clips = new Map<string, RenderClip>();
  let animations: StoredAnimation[] | undefined;
  let brightness: number | undefined;
  let isFrameStreamEnabled = false;
  let recordingDirectory: string | null = null;
  let loading: Promise<StoredAnimation[]> | undefined;
  let render: LocalRenderProcess;
  let startedAt = 0;
  let restartDelay = MIN_RESTART_DELAY;
  let restartTimer: ReturnType<typeof setTimeout> | undefined;
  let isClosed = false;

  function setExited(code: number | string): void {
    if (isClosed) {
      return;
    }
    const delay = getTime() - startedAt >= STABLE_UPTIME ? MIN_RESTART_DELAY : restartDelay;
    log(`Render process exited with ${code}, restarting in ${delay / 1000} s`);
    const isRecording = recordingDirectory !== null && render.getRecordingState().error === null;
    restartTimer = setTimeout(() => start(isRecording), delay);
    restartDelay = Math.min(delay * 2, MAX_RESTART_DELAY);
  }

  function start(isRecording = false): void {
    startedAt = getTime();
    render = createProcess({
      devicePath,
      latencyOffset,
      onState,
      onDevice,
      onDeviceLog,
      onFrame,
      onLog: log,
      onExit: setExited,
    });
    for (const clip of clips.values()) {
      render.setClip(clip);
    }
    if (animations) {
      render.setAnimations(animations);
    }
    if (brightness !== undefined) {
      render.setBrightness(brightness);
    }
    if (isFrameStreamEnabled) {
      render.setFrameStream(true);
    }
    if (isRecording && recordingDirectory !== null) {
      void render.setRecording(recordingDirectory);
    }
  }

  async function loadContent(): Promise<StoredAnimation[]> {
    const [nextAnimations, clipInfos] = await Promise.all([
      content.getAnimations(),
      content.getClips(),
    ]);
    const usedClips = getUsedClips(nextAnimations, clipInfos);
    const newClips = await Promise.all(
      usedClips
        .filter(({ id }) => !clips.has(id))
        .map(async ({ id, durations }) => ({
          id,
          durations,
          frames: await content.getClipFrames(id),
        })),
    );
    for (const clip of newClips) {
      clips.set(clip.id, clip);
      render.setClip(clip);
    }
    animations = nextAnimations;
    render.setAnimations(nextAnimations);
    const usedIds = new Set(usedClips.map(({ id }) => id));
    for (const id of clips.keys()) {
      if (!usedIds.has(id)) {
        clips.delete(id);
        render.removeClip(id);
      }
    }
    return nextAnimations;
  }

  function load(): Promise<StoredAnimation[]> {
    loading ??= loadContent().finally(() => {
      loading = undefined;
    });
    return loading;
  }

  async function checkLoaded(): Promise<void> {
    if (!animations) {
      await load();
    }
  }

  start();

  return {
    getState: () => render.getState(),
    getAnimations: load,
    load,
    async play(request) {
      await checkLoaded();
      return render.play(request);
    },
    stop: () => render.stop(),
    pause: () => render.pause(),
    async setTimeline(request) {
      await checkLoaded();
      return render.setTimeline(request);
    },
    setClock: (request) => render.setClock(request),
    setBrightness(value) {
      brightness = value;
      render.setBrightness(value);
    },
    setFrameStream(isEnabled) {
      isFrameStreamEnabled = isEnabled;
      render.setFrameStream(isEnabled);
    },
    setRecording(directory) {
      recordingDirectory = directory;
      return render.setRecording(directory);
    },
    getDeviceState: () => render.getDeviceState(),
    getRecordingState: () => render.getRecordingState(),
    close(): void {
      isClosed = true;
      clearTimeout(restartTimer);
      render.close();
    },
  };
}
