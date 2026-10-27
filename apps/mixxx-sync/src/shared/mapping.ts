import { type StoredAnimation, animationIdSchema } from "@led-matrix/core";
import { z } from "zod";

export const cueSchema = z
  .object({
    beat: z.number(),
    end: z.number().optional(),
    animation: animationIdSchema.optional(),
    section: z.union([z.string(), z.int().min(0)]).optional(),
  })
  .refine(({ beat, end }) => end === undefined || end > beat, {
    path: ["end"],
    message: "End must be after the cue beat",
  });

export const cuesSchema = z
  .array(cueSchema)
  .min(1)
  .superRefine((cues, context) => {
    if (cues[0]?.animation === undefined) {
      context.addIssue({
        code: "custom",
        path: [0, "animation"],
        message: "First cue needs an animation",
      });
    }
    for (const [index, cue] of cues.entries()) {
      const previous = cues[index - 1];
      if (previous && cue.beat <= previous.beat) {
        context.addIssue({
          code: "custom",
          path: [index, "beat"],
          message: "Cue beats must increase",
        });
      }
    }
  });

export const mappingSchema = z.object({
  tracks: z.record(z.string(), cuesSchema),
});

export type Cue = z.infer<typeof cueSchema>;

export type MappingFile = z.infer<typeof mappingSchema>;

export type ResolvedCue = {
  beat: number;
  animationId: string;
  section: number;
  beats: number | undefined;
};

export type Mapping = ReadonlyMap<string, readonly ResolvedCue[]>;

function getSectionIndex(animation: StoredAnimation, section: Cue["section"]): number | undefined {
  if (section === undefined) {
    return 0;
  }
  if (typeof section === "number") {
    return section < animation.sections.length ? section : undefined;
  }
  const index = animation.sections.findIndex(({ name }) => name === section);
  return index === -1 ? undefined : index;
}

export function getResolvedMapping(
  file: MappingFile,
  animations: readonly StoredAnimation[],
): { mapping: Mapping; errors: string[] } {
  const animationsById = new Map(animations.map((animation) => [animation.id, animation]));
  const mapping = new Map<string, ResolvedCue[]>();
  const errors: string[] = [];
  for (const [location, cues] of Object.entries(file.tracks)) {
    const resolved: ResolvedCue[] = [];
    let animationId = "";
    for (const cue of cues) {
      animationId = cue.animation ?? animationId;
      const animation = animationsById.get(animationId);
      if (!animation) {
        errors.push(`${location} beat ${cue.beat}: animation "${animationId}" not found`);
        continue;
      }
      const section = getSectionIndex(animation, cue.section);
      if (section === undefined) {
        errors.push(
          `${location} beat ${cue.beat}: section ${JSON.stringify(cue.section)} not found in "${animationId}"`,
        );
        continue;
      }
      const beats = cue.end === undefined ? undefined : cue.end - cue.beat;
      resolved.push({ beat: cue.beat, animationId, section, beats });
    }
    if (resolved.length === cues.length) {
      mapping.set(location, resolved);
    }
  }
  return { mapping, errors };
}

export function getCue(cues: readonly ResolvedCue[], beat: number): ResolvedCue | undefined {
  let found: ResolvedCue | undefined;
  for (const cue of cues) {
    if (cue.beat > beat) {
      break;
    }
    found = cue;
  }
  return found;
}

export type MappingState = { mapping: MappingFile } | { error: string };

export const emptyMapping: MappingFile = { tracks: {} };
