import {
  type Animation,
  type Frame,
  type PlaybackState,
  type Renderer,
  createFrame,
} from "@led-matrix/core";

export type PlaybackListener = {
  setFrame?(frame: Frame): void;
  setState?(state: PlaybackState): void;
};

export type PlaybackEngineOptions = {
  renderer: Renderer;
  fps: number;
  bpm: number;
  getTime?: () => number;
  getLatency?: () => number;
  onError?: (error: unknown) => void;
};

export type PlaybackEngine = ReturnType<typeof createPlaybackEngine>;

export function createPlaybackEngine({
  renderer,
  fps,
  bpm: initialBpm,
  getTime = () => performance.now(),
  getLatency = () => 0,
  onError,
}: PlaybackEngineOptions) {
  const listeners = new Set<PlaybackListener>();
  let active: { id: string; animation: Animation; startedAt: number; failed: boolean } | undefined;
  let bpm = initialBpm;
  let timer: ReturnType<typeof setInterval> | undefined;

  function getBeatDuration(): number {
    return 60_000 / bpm;
  }

  function getBeat(): number | null {
    return active ? (getTime() - active.startedAt) / getBeatDuration() : null;
  }

  function getState(): PlaybackState {
    return { animationId: active?.id ?? null, bpm, fps, beat: getBeat() };
  }

  function updateState(): void {
    const state = getState();
    for (const listener of listeners) {
      listener.setState?.(state);
    }
  }

  function renderFrame(): Frame {
    if (!active) {
      return createFrame();
    }
    try {
      return renderer.render(active.animation, getTime() + getLatency() - active.startedAt, bpm);
    } catch (error) {
      if (!active.failed) {
        active.failed = true;
        onError?.(error);
      }
      return createFrame();
    }
  }

  function tick(): void {
    const frame = renderFrame();
    for (const listener of listeners) {
      listener.setFrame?.(frame);
    }
  }

  return {
    getState,
    renderFrame,
    tick,
    play(id: string, animation: Animation, beat = 0): void {
      active = {
        id,
        animation,
        startedAt: getTime() - beat * getBeatDuration(),
        failed: false,
      };
      updateState();
    },
    setBeat(beat: number): void {
      if (active) {
        active.startedAt = getTime() - beat * getBeatDuration();
        updateState();
      }
    },
    updateAnimation(id: string, animation: Animation): void {
      if (active?.id === id) {
        active = { ...active, animation, failed: false };
      }
    },
    stop(): void {
      active = undefined;
      updateState();
    },
    setBpm(value: number): void {
      const beat = getBeat();
      bpm = value;
      if (active && beat !== null && "beats" in active.animation.mode) {
        active.startedAt = getTime() - beat * getBeatDuration();
      }
      updateState();
    },
    subscribe(listener: PlaybackListener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start(): void {
      timer ??= setInterval(tick, 1000 / fps);
    },
    close(): void {
      clearInterval(timer);
      timer = undefined;
      listeners.clear();
    },
  };
}
