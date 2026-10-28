import {
  type Animation,
  type RenderPosition,
  type SectionFit,
  type StoredAnimation,
  getAnimationLength,
  getFittedAnimation,
  getOnceSections,
  type ParameterSelection,
  getParameterAnimation,
  getParameterSelection,
  getRenderPosition,
} from "@led-matrix/core";
import { type Beats, getBeat, getBpm } from "./beats.ts";
import type { CueStatus } from "./api.ts";
import { type Cue, type SectionCue, getResolvedCues } from "./mapping.ts";

export type SectionBoundary = { beat: number; section: number };

export type AnimationBlock = {
  index: number;
  animation: StoredAnimation;
  source: StoredAnimation;
  params: ParameterSelection;
  section: number;
  bpm: number;
  beat: number;
  end: number;
  stop: number;
  hasEnd: boolean;
  isLoop: boolean;
  isTrimmed: boolean;
  loops: number | undefined;
  offset: number;
  startSection: number;
  fit: SectionFit | null;
  boundaries: SectionBoundary[];
};

export type AnimationLane = { blocks: AnimationBlock[]; errors: string[] };

function getSectionBeats(animation: Animation, section: number, bpm: number, fps: number) {
  const mode = animation.sections[section]?.mode;
  return mode ? (getAnimationLength(mode, bpm, fps) * bpm) / 60_000 : 0;
}

function getBoundaries(
  animation: Animation,
  section: number,
  beat: number,
  end: number,
  bpm: number,
  fps: number,
): SectionBoundary[] {
  const boundaries: SectionBoundary[] = [{ beat, section }];
  let start = beat;
  for (let index = section; index < animation.sections.length - 1; index++) {
    if (animation.sections[index]?.mode.type === "loop") {
      break;
    }
    start += getSectionBeats(animation, index, bpm, fps);
    if (start >= end) {
      break;
    }
    boundaries.push({ beat: start, section: index + 1 });
  }
  return boundaries;
}

export function getNaturalBeats(
  animation: StoredAnimation,
  section: number,
  bpm: number,
  fps: number,
): number {
  const once = getOnceSections(animation, section);
  return once.length === 0
    ? getSectionBeats(animation, section, bpm, fps)
    : once.reduce((sum, index) => sum + getSectionBeats(animation, index, bpm, fps), 0);
}

export function getLoopCount(block: AnimationBlock, fps: number): number {
  const beats = getSectionBeats(block.animation, block.section, block.bpm, fps);
  return Math.max(Math.round((block.end - block.beat) / beats), 1);
}

export function getDropEnd(
  animation: StoredAnimation,
  section: number,
  beat: number,
  stop: number,
  bpm: number,
  fps: number,
): number {
  return Math.min(beat + getNaturalBeats(animation, section, bpm, fps), stop);
}

export function getAnimationLane(
  cues: readonly Cue[],
  animationsById: ReadonlyMap<string, StoredAnimation>,
  beats: Beats | undefined,
  duration: number,
  fps: number,
): AnimationLane {
  const resolved = getResolvedCues(cues, animationsById);
  if (!beats || resolved.errors.length > 0) {
    return { blocks: [], errors: resolved.errors };
  }
  const trackEnd = getBeat(beats, duration);
  const sectionCues = resolved.cues.filter((cue): cue is SectionCue => cue.animationId !== null);
  const blocks = sectionCues.flatMap((cue, index): AnimationBlock[] => {
    const source = animationsById.get(cue.animationId);
    if (!source) {
      return [];
    }
    const animation = getParameterAnimation(source, cue.params);
    const stop = Math.max(sectionCues[index + 1]?.beat ?? trackEnd, cue.beat);
    const cueEnd = cues[index]?.end;
    const loops = cues[index]?.loops;
    const hasEnd = cueEnd !== undefined && cueEnd < stop;
    const end = hasEnd ? cueEnd : stop;
    const bpm = getBpm(beats, cue.beat);
    const fit = cue.beats === undefined ? null : { section: cue.section, beats: cue.beats };
    const boundaries = getBoundaries(
      getFittedAnimation(animation, fit, bpm, fps),
      cue.section,
      cue.beat - cue.offset,
      end,
      bpm,
      fps,
    );
    const isLoop = animation.sections[cue.section]?.mode.type === "loop";
    const startSection =
      boundaries.findLast(({ beat }) => beat <= cue.beat)?.section ?? cue.section;
    return [
      {
        index,
        animation,
        source,
        params: getParameterSelection(source, cue.params),
        section: cue.section,
        bpm,
        beat: cue.beat,
        end,
        stop,
        hasEnd,
        isLoop,
        isTrimmed: !isLoop && cues[index]?.trim === true,
        loops,
        offset: cue.offset,
        startSection,
        fit,
        boundaries: boundaries.filter(({ beat }) => beat > cue.beat),
      },
    ];
  });
  return { blocks, errors: [] };
}

export function isSameRender(a: AnimationBlock, b: AnimationBlock): boolean {
  return (
    a.source === b.source &&
    JSON.stringify(a.params) === JSON.stringify(b.params) &&
    a.section === b.section &&
    a.bpm === b.bpm &&
    a.beat === b.beat &&
    a.end === b.end &&
    a.offset === b.offset &&
    a.fit?.section === b.fit?.section &&
    a.fit?.beats === b.fit?.beats
  );
}

export type CueKeys = { cues: readonly Cue[]; keys: number[] };

export function getCueKeys(previous: CueKeys | undefined, cues: readonly Cue[]): CueKeys {
  if (!previous) {
    return { cues, keys: cues.map((_cue, index) => index) };
  }
  if (previous.cues === cues) {
    return previous;
  }
  const keysByBeat = new Map(previous.cues.map((cue, index) => [cue.beat, previous.keys[index]]));
  const matched = cues.map((cue) => keysByBeat.get(cue.beat));
  const used = new Set(matched);
  const unused = previous.keys.filter((key) => !used.has(key));
  let nextKey = Math.max(-1, ...previous.keys) + 1;
  const keys = matched.map((key) => key ?? unused.shift() ?? nextKey++);
  return { cues, keys };
}

export function getBlockPosition(
  block: AnimationBlock,
  beat: number,
  fps: number,
): RenderPosition | undefined {
  if (beat < block.beat || beat >= block.end) {
    return undefined;
  }
  const time = ((beat - block.beat + block.offset) * 60_000) / block.bpm;
  const playback = { current: { index: block.section, startedAt: 0 }, next: undefined };
  return getRenderPosition(block.animation, block.fit, playback, time, block.bpm, fps);
}

export type LanePosition = { block: AnimationBlock; position: RenderPosition };

export function getLanePosition(
  blocks: readonly AnimationBlock[],
  beat: number,
  fps: number,
): LanePosition | undefined {
  const block = blocks.findLast((candidate) => candidate.beat <= beat);
  const position = block && getBlockPosition(block, beat, fps);
  return block && position ? { block, position } : undefined;
}

export type LiveBlock = { index: number; isBlank: boolean };

export function getLiveBlock(
  blocks: readonly AnimationBlock[],
  cue: CueStatus | undefined,
): LiveBlock | undefined {
  if (!cue) {
    return undefined;
  }
  const block =
    cue.animationId === null
      ? blocks.find(({ hasEnd, end }) => hasEnd && end === cue.beat)
      : blocks.find(({ beat, animation }) => beat === cue.beat && animation.id === cue.animationId);
  return block && { index: block.index, isBlank: cue.animationId === null };
}
