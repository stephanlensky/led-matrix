import { z } from "zod";
import { type Animation, getAnimationLength } from "./animation.ts";

export const sectionFitSchema = z.object({
  section: z.int().min(0),
  beats: z.number().positive(),
});

export type SectionFit = z.infer<typeof sectionFitSchema>;

export type SectionCursor = { index: number; startedAt: number };

export type SectionPlayback = { current: SectionCursor; next: SectionCursor | undefined };

export type SectionPosition = { index: number; time: number; length: number };

export type AdvanceTiming = "end" | "now";

function getPosition(
  { sections }: Animation,
  cursor: SectionCursor,
  time: number,
  bpm: number,
  fps: number,
): SectionPosition {
  let index = Math.min(Math.max(cursor.index, 0), sections.length - 1);
  let elapsed = time - cursor.startedAt;
  for (;;) {
    const section = sections[index];
    if (!section) {
      throw new Error(`Missing section ${index}`);
    }
    const length = getAnimationLength(section.mode, bpm, fps);
    if (section.mode.type === "loop") {
      return { index, time: ((elapsed % length) + length) % length, length };
    }
    if (elapsed < length || index === sections.length - 1) {
      return { index, time: Math.min(Math.max(elapsed, 0), length), length };
    }
    elapsed -= length;
    index++;
  }
}

export function getSectionPosition(
  animation: Animation,
  { current, next }: SectionPlayback,
  time: number,
  bpm: number,
  fps: number,
): SectionPosition {
  const cursor = next && time >= next.startedAt ? next : current;
  return getPosition(animation, cursor, time, bpm, fps);
}

export function getCurrentPlayback(playback: SectionPlayback, time: number): SectionPlayback {
  return playback.next && time >= playback.next.startedAt
    ? { current: playback.next, next: undefined }
    : playback;
}

export function getSectionCursor(
  animation: Animation,
  index: number,
  progress: number,
  time: number,
  bpm: number,
  fps: number,
): SectionCursor {
  const section = animation.sections[index];
  if (!section) {
    throw new Error(`Missing section ${index}`);
  }
  return { index, startedAt: time - progress * getAnimationLength(section.mode, bpm, fps) };
}

export function getNextSection(
  animation: Animation,
  playback: SectionPlayback,
  time: number,
  bpm: number,
  fps: number,
  timing: AdvanceTiming,
): SectionCursor | undefined {
  const position = getSectionPosition(animation, playback, time, bpm, fps);
  if (position.index >= animation.sections.length - 1) {
    return undefined;
  }
  const isLoop = animation.sections[position.index]?.mode.type === "loop";
  const startedAt = timing === "end" && isLoop ? time - position.time + position.length : time;
  return { index: position.index + 1, startedAt };
}

export function getFittedAnimation(animation: Animation, fit: SectionFit | null): Animation {
  const section = fit && animation.sections[fit.section];
  if (!fit || !section) {
    return animation;
  }
  const sections = animation.sections.with(fit.section, {
    ...section,
    mode: { type: section.mode.type, beats: fit.beats },
  });
  return { ...animation, sections };
}

export type RenderPosition = { index: number; time: number };

export function getRenderPosition(
  source: Animation,
  fit: SectionFit | null,
  playback: SectionPlayback,
  time: number,
  bpm: number,
  fps: number,
): RenderPosition {
  const position = getSectionPosition(getFittedAnimation(source, fit), playback, time, bpm, fps);
  const mode = source.sections[position.index]?.mode;
  const scale = mode ? getAnimationLength(mode, bpm, fps) / position.length : 1;
  return { index: position.index, time: position.time * scale };
}
