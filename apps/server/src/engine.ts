import {
  type AdvanceTiming,
  type Animation,
  type Frame,
  type PlaybackState,
  type Renderer,
  type SectionFit,
  type SectionPlayback,
  type SectionState,
  createFrame,
  getAnimationLength,
  getCurrentPlayback,
  getFittedAnimation,
  getNextSection,
  getSectionCursor,
  getSectionPosition,
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
  let active:
    | {
        id: string;
        source: Animation;
        animation: Animation;
        fit: SectionFit | null;
        startedAt: number;
        sections: SectionPlayback;
        reportedSection: number;
        pausedAt: number | undefined;
        failed: boolean;
      }
    | undefined;
  let bpm = initialBpm;
  let timer: ReturnType<typeof setInterval> | undefined;

  function getPlaybackTime(): number {
    return active?.pausedAt ?? getTime();
  }

  function getRenderTime(): number {
    return getPlaybackTime() + getLatency();
  }

  function getSectionIndex(time: number): number {
    return active ? getSectionPosition(active.animation, active.sections, time, bpm, fps).index : 0;
  }

  function getSection(): SectionState | null {
    if (!active) {
      return null;
    }
    const time = getPlaybackTime();
    const { index, time: sectionTime } = getSectionPosition(
      active.animation,
      active.sections,
      time,
      bpm,
      fps,
    );
    const { next } = active.sections;
    return {
      index,
      time: sectionTime,
      next:
        next && next.startedAt > time ? { index: next.index, delay: next.startedAt - time } : null,
    };
  }

  function getBeatDuration(): number {
    return 60_000 / bpm;
  }

  function getBeat(): number | null {
    return active ? (getPlaybackTime() - active.startedAt) / getBeatDuration() : null;
  }

  function getState(): PlaybackState {
    return {
      animationId: active?.id ?? null,
      bpm,
      fps,
      beat: getBeat(),
      section: getSection(),
      fit: active?.fit ?? null,
      paused: active?.pausedAt !== undefined,
    };
  }

  function updateState(): void {
    if (active) {
      active.reportedSection = getSectionIndex(getPlaybackTime());
    }
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
      const { index, time, length } = getSectionPosition(
        active.animation,
        active.sections,
        getRenderTime(),
        bpm,
        fps,
      );
      const mode = active.source.sections[index]?.mode;
      const scale = mode ? getAnimationLength(mode, bpm, fps) / length : 1;
      return renderer.render(active.source, time * scale, bpm, index);
    } catch (error) {
      if (!active.failed) {
        active.failed = true;
        onError?.(error);
      }
      return createFrame();
    }
  }

  function updateSections(): void {
    if (!active) {
      return;
    }
    const time = getPlaybackTime();
    active.sections = getCurrentPlayback(active.sections, time);
    if (getSectionIndex(time) !== active.reportedSection) {
      updateState();
    }
  }

  function shiftSections(offset: number): void {
    if (!active) {
      return;
    }
    const { current, next } = active.sections;
    active.sections = {
      current: { ...current, startedAt: current.startedAt + offset },
      next: next && { ...next, startedAt: next.startedAt + offset },
    };
  }

  function tick(): void {
    updateSections();
    const frame = renderFrame();
    for (const listener of listeners) {
      listener.setFrame?.(frame);
    }
  }

  return {
    getState,
    renderFrame,
    tick,
    play(id: string, animation: Animation, beat = 0, section = 0, beats?: number): void {
      const startedAt = getTime() - beat * getBeatDuration();
      const fit = beats === undefined ? null : { section, beats };
      active = {
        id,
        source: animation,
        animation: getFittedAnimation(animation, fit),
        fit,
        startedAt,
        sections: { current: { index: section, startedAt }, next: undefined },
        reportedSection: section,
        pausedAt: undefined,
        failed: false,
      };
      updateState();
    },
    setBeat(beat: number): void {
      if (active) {
        const startedAt = getPlaybackTime() - beat * getBeatDuration();
        shiftSections(startedAt - active.startedAt);
        active.startedAt = startedAt;
        updateState();
      }
    },
    pause(): void {
      if (active && active.pausedAt === undefined) {
        active.pausedAt = getTime();
        updateState();
      }
    },
    resume(): void {
      if (active?.pausedAt !== undefined) {
        const offset = getTime() - active.pausedAt;
        shiftSections(offset);
        active.startedAt += offset;
        active.pausedAt = undefined;
        updateState();
      }
    },
    seek(section: number, progress: number): void {
      if (active) {
        const time = getPlaybackTime();
        active.sections = {
          current: getSectionCursor(active.animation, section, progress, time, bpm, fps),
          next: undefined,
        };
        updateState();
      }
    },
    advance(timing: AdvanceTiming = "end"): boolean {
      if (!active) {
        return false;
      }
      const time = getRenderTime();
      const next = getNextSection(active.animation, active.sections, time, bpm, fps, timing);
      if (!next) {
        return false;
      }
      active.sections = {
        current: getCurrentPlayback(active.sections, time).current,
        next: timing === "now" ? { ...next, startedAt: getPlaybackTime() } : next,
      };
      updateState();
      return true;
    },
    updateAnimation(id: string, animation: Animation): void {
      if (active?.id === id) {
        const fit =
          active.fit && active.fit.section < animation.sections.length ? active.fit : null;
        active = {
          ...active,
          source: animation,
          animation: getFittedAnimation(animation, fit),
          fit,
          failed: false,
        };
        updateState();
      }
    },
    stop(): void {
      active = undefined;
      updateState();
    },
    setBpm(value: number): void {
      if (!active) {
        bpm = value;
        updateState();
        return;
      }
      const beat = (getPlaybackTime() - active.startedAt) / getBeatDuration();
      const time = getRenderTime();
      const position = getSectionPosition(active.animation, active.sections, time, bpm, fps);
      const isPending = active.sections.next !== undefined && active.sections.next.startedAt > time;
      const mode = active.animation.sections[position.index]?.mode;
      const scale = mode && "beats" in mode ? bpm / value : 1;
      bpm = value;
      active.startedAt = getPlaybackTime() - beat * getBeatDuration();
      active.sections = {
        current: { index: position.index, startedAt: time - position.time * scale },
        next: undefined,
      };
      if (isPending) {
        active.sections.next = getNextSection(
          active.animation,
          active.sections,
          time,
          bpm,
          fps,
          "end",
        );
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
