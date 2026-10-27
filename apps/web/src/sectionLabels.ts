import type { AnimationMode, Section } from "@led-matrix/core";

function getCountLabel(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

export function getLengthLabel(mode: AnimationMode): string {
  if ("ms" in mode) {
    return `${Math.round(mode.ms / 100) / 10}s`;
  }
  return "beats" in mode ? getCountLabel(mode.beats, "beat") : getCountLabel(mode.frames, "frame");
}

export function getSectionName(section: Section, index: number): string {
  return section.name ?? `Section ${index + 1}`;
}

export function getPositionLabel(mode: AnimationMode, progress: number): string {
  if ("beats" in mode) {
    return `${(progress * mode.beats).toFixed(1)} / ${mode.beats}`;
  }
  if ("frames" in mode) {
    return `${Math.floor(progress * mode.frames)} / ${mode.frames}`;
  }
  return `${((progress * mode.ms) / 1000).toFixed(1)} / ${(mode.ms / 1000).toFixed(1)}s`;
}
