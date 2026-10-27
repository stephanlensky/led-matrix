import {
  type RenderPosition,
  type SectionFit,
  type StoredAnimation,
  getAnimationLength,
  getRenderPosition,
} from "@led-matrix/core";
import { type Beats, getBeat, getBpm } from "./beats.ts";
import type { CueStatus } from "./api.ts";
import { type Cue, type SectionCue, getResolvedCues } from "./mapping.ts";

export type SectionBoundary = { beat: number; section: number };

export type AnimationBlock = {
  index: number;
  animation: StoredAnimation;
  section: number;
  bpm: number;
  beat: number;
  end: number;
  stop: number;
  hasEnd: boolean;
  fit: SectionFit | null;
  boundaries: SectionBoundary[];
};

export type AnimationLane = { blocks: AnimationBlock[]; errors: string[] };

function getSectionBeats(animation: StoredAnimation, section: number, bpm: number, fps: number) {
  const mode = animation.sections[section]?.mode;
  return mode ? (getAnimationLength(mode, bpm, fps) * bpm) / 60_000 : 0;
}

function getBoundaries(
  animation: StoredAnimation,
  section: number,
  beat: number,
  end: number,
  bpm: number,
  fps: number,
): SectionBoundary[] {
  const boundaries: SectionBoundary[] = [];
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

export function getFitEnd(
  animation: StoredAnimation,
  section: number,
  beat: number,
  stop: number,
  bpm: number,
  fps: number,
): number | undefined {
  const isOnce = animation.sections[section]?.mode.type === "once";
  return isOnce && getSectionBeats(animation, section, bpm, fps) > stop - beat ? stop : undefined;
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
    const animation = animationsById.get(cue.animationId);
    if (!animation) {
      return [];
    }
    const stop = Math.max(sectionCues[index + 1]?.beat ?? trackEnd, cue.beat);
    const cueEnd = cues[index]?.end;
    const hasEnd = cueEnd !== undefined && cueEnd < stop;
    const end = hasEnd ? cueEnd : stop;
    const bpm = getBpm(beats, cue.beat);
    const fit = cue.beats === undefined ? null : { section: cue.section, beats: cue.beats };
    return [
      {
        index,
        animation,
        section: cue.section,
        bpm,
        beat: cue.beat,
        end,
        stop,
        hasEnd,
        fit,
        boundaries:
          cueEnd === undefined
            ? getBoundaries(animation, cue.section, cue.beat, end, bpm, fps)
            : [],
      },
    ];
  });
  return { blocks, errors: [] };
}

export function isSameRender(a: AnimationBlock, b: AnimationBlock): boolean {
  return (
    a.animation === b.animation &&
    a.section === b.section &&
    a.bpm === b.bpm &&
    a.beat === b.beat &&
    a.end === b.end &&
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
  const time = ((beat - block.beat) * 60_000) / block.bpm;
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
