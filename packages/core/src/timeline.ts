import { z } from "zod";
import { type Animation, animationIdSchema } from "./animation.ts";
import { parameterSelectionSchema } from "./parameters.ts";
import {
  type RenderPosition,
  type SectionPosition,
  getFittedAnimation,
  getRenderPosition,
  getSectionPosition,
} from "./sections.ts";

export const timelineSectionCueSchema = z.object({
  beat: z.number(),
  animationId: animationIdSchema,
  section: z.int().min(0),
  params: parameterSelectionSchema.optional(),
  beats: z.number().positive().optional(),
  offset: z.number().min(0),
});

export const timelineBlankCueSchema = z.object({ beat: z.number(), animationId: z.null() });

export const timelineCueSchema = z.union([timelineSectionCueSchema, timelineBlankCueSchema]);

export const timelineIdSchema = z.string().min(1).max(256);

export type TimelineSectionCue = z.infer<typeof timelineSectionCueSchema>;

export type TimelineCue = z.infer<typeof timelineCueSchema>;

export function getTimelineCueIndex(cues: readonly { beat: number }[], beat: number): number {
  let low = 0;
  let high = cues.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (cues[middle]!.beat <= beat) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low - 1;
}

function getCuePlayback(cue: Pick<TimelineSectionCue, "section" | "beats" | "offset">) {
  return {
    fit: cue.beats === undefined ? null : { section: cue.section, beats: cue.beats },
    playback: { current: { index: cue.section, startedAt: 0 }, next: undefined },
  };
}

function getCueTime(cue: Pick<TimelineSectionCue, "offset">, beats: number, bpm: number): number {
  return ((beats + cue.offset) * 60_000) / bpm;
}

export function getCuePosition(
  animation: Animation,
  cue: Pick<TimelineSectionCue, "section" | "beats" | "offset">,
  beats: number,
  bpm: number,
  fps: number,
): RenderPosition {
  const { fit, playback } = getCuePlayback(cue);
  return getRenderPosition(animation, fit, playback, getCueTime(cue, beats, bpm), bpm, fps);
}

export function getCueSectionPosition(
  animation: Animation,
  cue: Pick<TimelineSectionCue, "section" | "beats" | "offset">,
  beats: number,
  bpm: number,
  fps: number,
): SectionPosition {
  const { fit, playback } = getCuePlayback(cue);
  return getSectionPosition(
    getFittedAnimation(animation, fit, bpm, fps),
    playback,
    getCueTime(cue, beats, bpm),
    bpm,
    fps,
  );
}
