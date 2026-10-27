import { type Beats, getBeat, getPosition } from "./beats.ts";
import type { MixxxCue } from "./library.ts";
import type { Cue } from "./mapping.ts";
import { BEATS_PER_BAR } from "./track-scale.ts";

export const MIN_CUE_BEATS = 1;
export const SNAP_DISTANCE = 8;

export type BeatRange = { min: number; max: number };

export type LaneScale = { beats: Beats; duration: number; width: number };

export type Snap = { beat: number; target: number | undefined; distance: number };

export function getTrackRange(beats: Beats, duration: number): BeatRange {
  return { min: Math.floor(getBeat(beats, 0)), max: getBeat(beats, duration) };
}

export function getClampedBeat(beat: number, { min, max }: BeatRange): number {
  return Math.min(Math.max(beat, min), Math.max(min, max));
}

function getStartMin(cues: readonly Cue[], index: number, track: BeatRange): number {
  const previous = cues[index - 1];
  const cue = cues[index];
  if (!previous) {
    return Math.min(track.min, cue?.beat ?? track.min);
  }
  const min = Math.max(previous.end ?? -Infinity, previous.beat + MIN_CUE_BEATS);
  return Math.min(min, cue?.beat ?? min);
}

function getNextBeat(cues: readonly Cue[], index: number, track: BeatRange): number {
  return cues[index + 1]?.beat ?? track.max;
}

export function getMoveRange(cues: readonly Cue[], index: number, track: BeatRange): BeatRange {
  const cue = cues[index];
  const length = cue?.end === undefined ? MIN_CUE_BEATS : cue.end - cue.beat;
  return { min: getStartMin(cues, index, track), max: getNextBeat(cues, index, track) - length };
}

export function getStartRange(cues: readonly Cue[], index: number, track: BeatRange): BeatRange {
  const end = cues[index]?.end ?? getNextBeat(cues, index, track);
  return { min: getStartMin(cues, index, track), max: end - MIN_CUE_BEATS };
}

export function getEndRange(cues: readonly Cue[], index: number, track: BeatRange): BeatRange {
  return {
    min: (cues[index]?.beat ?? track.min) + MIN_CUE_BEATS,
    max: getNextBeat(cues, index, track),
  };
}

export function getNudgedBeat(
  cues: readonly Cue[],
  index: number,
  delta: number,
  track: BeatRange,
): number | undefined {
  const cue = cues[index];
  return cue && getClampedBeat(cue.beat + delta, getMoveRange(cues, index, track));
}

export function getDropRange(track: BeatRange): BeatRange {
  return { min: track.min, max: track.max - MIN_CUE_BEATS };
}

export function getSnapTargets(
  cues: readonly Cue[],
  exclude: number | undefined,
  mixxxCues: readonly MixxxCue[],
  beats: Beats,
): number[] {
  const targets = cues.flatMap((cue, index) =>
    index === exclude ? [] : cue.end === undefined ? [cue.beat] : [cue.beat, cue.end],
  );
  for (const cue of mixxxCues) {
    for (const position of [cue.start, cue.end]) {
      if (position !== undefined) {
        targets.push(getBeat(beats, position));
      }
    }
  }
  return targets;
}

function getX({ beats, duration, width }: LaneScale, beat: number): number {
  return duration > 0 ? (getPosition(beats, beat) / duration) * width : 0;
}

export function getSnap(
  beat: number,
  targets: readonly number[],
  scale: LaneScale,
  distance = SNAP_DISTANCE,
): Snap {
  const x = getX(scale, beat);
  let best: Snap | undefined;
  for (const target of targets) {
    const targetDistance = Math.abs(getX(scale, target) - x);
    if (targetDistance <= distance && (!best || targetDistance < best.distance)) {
      best = { beat: target, target, distance: targetDistance };
    }
  }
  if (best) {
    return best;
  }
  const bar = Math.round(beat / BEATS_PER_BAR) * BEATS_PER_BAR;
  const barDistance = Math.abs(getX(scale, bar) - x);
  if (barDistance <= distance / 2 && Math.abs(bar - beat) <= 1) {
    return { beat: bar, target: bar, distance: barDistance };
  }
  const whole = Math.round(beat);
  return { beat: whole, target: undefined, distance: Math.abs(getX(scale, whole) - x) };
}

export function getMoveSnap(
  beat: number,
  length: number | undefined,
  targets: readonly number[],
  scale: LaneScale,
): Snap {
  const start = getSnap(beat, targets, scale);
  if (length === undefined) {
    return start;
  }
  const end = getSnap(beat + length, targets, scale);
  if (end.target !== undefined && (start.target === undefined || end.distance < start.distance)) {
    return { ...end, beat: end.beat - length };
  }
  return start;
}
