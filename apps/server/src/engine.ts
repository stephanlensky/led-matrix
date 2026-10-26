import {
  type Animation,
  type Frame,
  type PlaybackState,
  type Renderer,
  createFrame,
  getAnimationTiming,
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
  onError?: (error: unknown) => void;
};

export type PlaybackEngine = ReturnType<typeof createPlaybackEngine>;

export function createPlaybackEngine({
  renderer,
  fps,
  bpm: initialBpm,
  getTime = () => performance.now(),
  onError,
}: PlaybackEngineOptions) {
  const listeners = new Set<PlaybackListener>();
  let active: { id: string; animation: Animation; startedAt: number; failed: boolean } | undefined;
  let bpm = initialBpm;
  let timer: ReturnType<typeof setInterval> | undefined;

  function getState(): PlaybackState {
    return { animationId: active?.id ?? null, bpm, fps };
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
      return renderer.render(active.animation, getTime() - active.startedAt, bpm);
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
    play(id: string, animation: Animation): void {
      active = { id, animation, startedAt: getTime(), failed: false };
      updateState();
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
      if (active?.animation.mode.type === "loop" && "beats" in active.animation.mode) {
        const now = getTime();
        const { progress } = getAnimationTiming(
          active.animation.mode,
          now - active.startedAt,
          bpm,
          fps,
        );
        active.startedAt = now - (progress * active.animation.mode.beats * 60_000) / value;
      }
      bpm = value;
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
