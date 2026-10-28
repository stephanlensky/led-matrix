import {
  type AdvanceTiming,
  type Animation,
  type Frame,
  type PlaybackState,
  type Renderer,
  type SectionFit,
  type SectionPlayback,
  type SectionState,
  type TimelineCue,
  type TimelineState,
  createFrame,
  getCurrentPlayback,
  getFittedAnimation,
  type ParameterSelection,
  getParameterAnimation,
  getParameterSelection,
  getNextSection,
  getRenderPosition,
  getSectionCursor,
  getSectionPosition,
  getCuePosition,
  getCueSectionPosition,
  getTimelineCueIndex,
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

export type PlayOptions = {
  beat?: number | undefined;
  section?: number | undefined;
  beats?: number | undefined;
  params?: ParameterSelection | undefined;
};

export type ClockOptions = {
  beat: number;
  bpm?: number | undefined;
  paused?: boolean | undefined;
};

export type TimelineOptions = ClockOptions & {
  id: string;
  cues: readonly TimelineCue[];
  keepCurrent?: boolean | undefined;
};

type TimelineEntry = {
  cue: TimelineCue;
  document: Animation | undefined;
  params: ParameterSelection;
  source: Animation | undefined;
  failed: boolean;
};

type TimelinePosition = { index: number; entry: TimelineEntry | undefined; beat: number };

function getTimelineEntry(cue: TimelineCue, document: Animation | undefined): TimelineEntry {
  if (cue.animationId === null || !document) {
    return { cue, document: undefined, params: {}, source: undefined, failed: false };
  }
  const params = getParameterSelection(document, cue.params ?? {});
  return { cue, document, params, source: getParameterAnimation(document, params), failed: false };
}

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
        document: Animation;
        params: ParameterSelection;
        source: Animation;
        animation: Animation;
        fit: SectionFit | null;
        startedAt: number;
        sections: SectionPlayback;
        reportedSection: number;
        failed: boolean;
      }
    | undefined;
  let timeline:
    | { id: string; entries: TimelineEntry[]; startedAt: number; reported: string }
    | undefined;
  let pausedAt: number | undefined;
  let bpm = initialBpm;
  let timer: ReturnType<typeof setInterval> | undefined;

  function getPlaybackTime(): number {
    return pausedAt ?? getTime();
  }

  function getTimelinePosition(time: number): TimelinePosition | undefined {
    if (!timeline) {
      return undefined;
    }
    const beat = (time - timeline.startedAt) / getBeatDuration();
    const index = getTimelineCueIndex(
      timeline.entries.map(({ cue }) => cue),
      beat,
    );
    return { index, entry: timeline.entries[index], beat };
  }

  function getTimelineKey(time: number): string {
    const position = getTimelinePosition(time);
    const entry = position?.entry;
    if (!position || !entry?.source || entry.cue.animationId === null) {
      return String(position?.index);
    }
    const { cue } = entry;
    const { index } = getCueSectionPosition(entry.source, cue, position.beat - cue.beat, bpm, fps);
    return `${position.index}:${index}`;
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

  function getActiveState(): PlaybackState {
    return {
      animationId: active?.id ?? null,
      params: active?.params ?? {},
      bpm,
      fps,
      beat: getBeat(),
      section: getSection(),
      fit: active?.fit ?? null,
      paused: pausedAt !== undefined,
      timeline: null,
    };
  }

  function getState(): PlaybackState {
    const position = getTimelinePosition(getPlaybackTime());
    if (!timeline || !position) {
      return getActiveState();
    }
    const { index, entry, beat } = position;
    const timelineState: TimelineState = { id: timeline.id, cue: index === -1 ? null : index };
    if (!entry) {
      return { ...getActiveState(), beat, timeline: timelineState };
    }
    const { cue, source, params } = entry;
    if (cue.animationId === null || !source) {
      return {
        animationId: null,
        params: {},
        bpm,
        fps,
        beat,
        section: null,
        fit: null,
        paused: pausedAt !== undefined,
        timeline: timelineState,
      };
    }
    const section = getCueSectionPosition(source, cue, beat - cue.beat, bpm, fps);
    return {
      animationId: cue.animationId,
      params,
      bpm,
      fps,
      beat,
      section: { index: section.index, time: section.time, next: null },
      fit: cue.beats === undefined ? null : { section: cue.section, beats: cue.beats },
      paused: pausedAt !== undefined,
      timeline: timelineState,
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

  function renderTimelineFrame(entry: TimelineEntry, beat: number): Frame {
    const { cue, source } = entry;
    if (cue.animationId === null || !source) {
      return createFrame();
    }
    try {
      const { index, time, cycle } = getCuePosition(source, cue, beat - cue.beat, bpm, fps);
      return renderer.render(source, time, bpm, index, cycle);
    } catch (error) {
      if (!entry.failed) {
        entry.failed = true;
        onError?.(error);
      }
      return createFrame();
    }
  }

  function renderFrame(): Frame {
    const renderTime = getRenderTime();
    const position = getTimelinePosition(renderTime);
    if (position?.entry) {
      return renderTimelineFrame(position.entry, position.beat);
    }
    if (!active) {
      return createFrame();
    }
    try {
      const { index, time, cycle } = getRenderPosition(
        active.source,
        active.fit,
        active.sections,
        renderTime,
        bpm,
        fps,
      );
      return renderer.render(active.source, time, bpm, index, cycle);
    } catch (error) {
      if (!active.failed) {
        active.failed = true;
        onError?.(error);
      }
      return createFrame();
    }
  }

  function updateSections(): void {
    const time = getPlaybackTime();
    if (timeline) {
      const key = getTimelineKey(time);
      if (key !== timeline.reported) {
        timeline.reported = key;
        updateState();
      }
    }
    if (!active) {
      return;
    }
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

  function shiftActive(offset: number): void {
    if (active) {
      shiftSections(offset);
      active.startedAt += offset;
    }
  }

  function setPaused(paused: boolean): void {
    if (paused && pausedAt === undefined) {
      pausedAt = getTime();
    } else if (!paused && pausedAt !== undefined) {
      const offset = getTime() - pausedAt;
      shiftActive(offset);
      if (timeline) {
        timeline.startedAt += offset;
      }
      pausedAt = undefined;
    }
  }

  function setClockBeat(beat: number): void {
    const time = getPlaybackTime();
    if (timeline) {
      const startedAt = time - beat * getBeatDuration();
      shiftActive(startedAt - timeline.startedAt);
      timeline.startedAt = startedAt;
    } else if (active) {
      shiftActive(time - beat * getBeatDuration() - active.startedAt);
    }
  }

  function setClockBpm(value: number): void {
    const time = getPlaybackTime();
    const timelineBeat = timeline && (time - timeline.startedAt) / getBeatDuration();
    if (active) {
      const beat = (time - active.startedAt) / getBeatDuration();
      const renderTime = getRenderTime();
      const position = getSectionPosition(active.animation, active.sections, renderTime, bpm, fps);
      const isPending =
        active.sections.next !== undefined && active.sections.next.startedAt > renderTime;
      const mode = active.animation.sections[position.index]?.mode;
      const scale = mode && "beats" in mode ? bpm / value : 1;
      bpm = value;
      active.animation = getFittedAnimation(active.source, active.fit, bpm, fps);
      active.startedAt = time - beat * getBeatDuration();
      active.sections = {
        current: { index: position.index, startedAt: renderTime - position.time * scale },
        next: undefined,
      };
      if (isPending) {
        active.sections.next = getNextSection(
          active.animation,
          active.sections,
          renderTime,
          bpm,
          fps,
          "end",
        );
      }
    }
    bpm = value;
    if (timeline && timelineBeat !== undefined) {
      timeline.startedAt = time - timelineBeat * getBeatDuration();
    }
  }

  function getHeldActive(time: number): typeof active {
    const position = getTimelinePosition(time);
    if (!position || !position.entry) {
      return active;
    }
    const { cue, document, params, source } = position.entry;
    if (cue.animationId === null || !document || !source) {
      return undefined;
    }
    const fit = cue.beats === undefined ? null : { section: cue.section, beats: cue.beats };
    const startedAt = time - (position.beat - cue.beat + cue.offset) * getBeatDuration();
    return {
      id: cue.animationId,
      document,
      params,
      source,
      animation: getFittedAnimation(source, fit, bpm, fps),
      fit,
      startedAt,
      sections: { current: { index: cue.section, startedAt }, next: undefined },
      reportedSection: cue.section,
      failed: false,
    };
  }

  function setSource(document: Animation, selection: ParameterSelection): void {
    if (!active) {
      return;
    }
    const fit = active.fit && active.fit.section < document.sections.length ? active.fit : null;
    const params = getParameterSelection(document, selection);
    const source = getParameterAnimation(document, params);
    active = {
      ...active,
      document,
      params,
      source,
      animation: getFittedAnimation(source, fit, bpm, fps),
      fit,
      failed: false,
    };
    updateState();
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
    isLoaded: () => active !== undefined || timeline !== undefined,
    hasTimeline: () => timeline !== undefined,
    loadTimeline(
      { id, cues, beat, bpm: requestedBpm, paused = false, keepCurrent = false }: TimelineOptions,
      documents: ReadonlyMap<string, Animation>,
    ): void {
      active = keepCurrent ? getHeldActive(getPlaybackTime()) : undefined;
      timeline = undefined;
      if (requestedBpm !== undefined) {
        setClockBpm(requestedBpm);
      }
      setPaused(paused);
      const time = getPlaybackTime();
      if (active) {
        const drift = beat - (time - active.startedAt) / getBeatDuration();
        shiftActive(-(drift - Math.round(drift)) * getBeatDuration());
      }
      const entries = cues
        .toSorted((a, b) => a.beat - b.beat)
        .map((cue) =>
          getTimelineEntry(
            cue,
            cue.animationId === null ? undefined : documents.get(cue.animationId),
          ),
        );
      timeline = { id, entries, startedAt: time - beat * getBeatDuration(), reported: "" };
      timeline.reported = getTimelineKey(time);
      updateState();
    },
    setClock({ beat, bpm: requestedBpm, paused }: ClockOptions): void {
      if (requestedBpm !== undefined) {
        setClockBpm(requestedBpm);
      }
      if (paused !== undefined) {
        setPaused(paused);
      }
      setClockBeat(beat);
      updateState();
    },
    play(
      id: string,
      animation: Animation,
      { beat = 0, section = 0, beats, params }: PlayOptions = {},
    ): void {
      const startedAt = getTime() - beat * getBeatDuration();
      const fit = beats === undefined ? null : { section, beats };
      const selection = getParameterSelection(animation, params);
      const source = getParameterAnimation(animation, selection);
      timeline = undefined;
      pausedAt = undefined;
      active = {
        id,
        document: animation,
        params: selection,
        source,
        animation: getFittedAnimation(source, fit, bpm, fps),
        fit,
        startedAt,
        sections: { current: { index: section, startedAt }, next: undefined },
        reportedSection: section,
        failed: false,
      };
      updateState();
    },
    setBeat(beat: number): void {
      if (active || timeline) {
        setClockBeat(beat);
        updateState();
      }
    },
    pause(): void {
      if ((active || timeline) && pausedAt === undefined) {
        setPaused(true);
        updateState();
      }
    },
    resume(): void {
      if (pausedAt !== undefined) {
        setPaused(false);
        updateState();
      }
    },
    seek(section: number, progress: number): void {
      if (active && !timeline) {
        const time = getPlaybackTime();
        active.sections = {
          current: getSectionCursor(active.animation, section, progress, time, bpm, fps),
          next: undefined,
        };
        updateState();
      }
    },
    advance(timing: AdvanceTiming = "end"): boolean {
      if (!active || timeline) {
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
        setSource(animation, active.params);
      }
      if (timeline?.entries.some(({ cue }) => cue.animationId === id)) {
        timeline.entries = timeline.entries.map((entry) =>
          entry.cue.animationId === id ? getTimelineEntry(entry.cue, animation) : entry,
        );
        updateState();
      }
    },
    removeAnimation(id: string): void {
      if (active?.id === id) {
        active = undefined;
      }
      if (timeline) {
        timeline.entries = timeline.entries.map((entry) =>
          entry.cue.animationId === id ? getTimelineEntry(entry.cue, undefined) : entry,
        );
      }
      if (!active && !timeline) {
        pausedAt = undefined;
      }
      updateState();
    },
    setParams(params: ParameterSelection): void {
      if (active && !timeline) {
        setSource(active.document, { ...active.params, ...params });
      }
    },
    stop(): void {
      active = undefined;
      timeline = undefined;
      pausedAt = undefined;
      updateState();
    },
    setBpm(value: number): void {
      setClockBpm(value);
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
