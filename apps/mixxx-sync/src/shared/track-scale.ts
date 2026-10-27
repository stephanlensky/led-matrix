import { type Beats, getBeat, getPosition } from "./beats.ts";

export const BEATS_PER_BAR = 4;
const TICK_STEPS = [4, 16, 64, 256];

export type Tick = {
  beat: number;
  position: number;
  isStrong: boolean;
};

export function getFraction(position: number, duration: number): number {
  return duration > 0 ? Math.min(Math.max(position / duration, 0), 1) : 0;
}

function getModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

export function getTicks(
  beats: Beats,
  duration: number,
  width: number,
  minSpacing: number,
): Tick[] {
  if (duration <= 0 || width <= 0) {
    return [];
  }
  const firstBeat = Math.ceil(getBeat(beats, 0));
  const lastBeat = Math.floor(getBeat(beats, duration));
  if (lastBeat <= firstBeat) {
    return [];
  }
  const beatWidth =
    (width * (getPosition(beats, lastBeat) - getPosition(beats, firstBeat))) /
    duration /
    (lastBeat - firstBeat);
  const step = TICK_STEPS.find((candidate) => candidate * beatWidth >= minSpacing);
  if (step === undefined) {
    return [];
  }
  const ticks: Tick[] = [];
  for (let beat = firstBeat + getModulo(-firstBeat, step); beat <= lastBeat; beat += step) {
    ticks.push({
      beat,
      position: getPosition(beats, beat),
      isStrong: getModulo(beat, step * BEATS_PER_BAR) === 0,
    });
  }
  return ticks;
}
