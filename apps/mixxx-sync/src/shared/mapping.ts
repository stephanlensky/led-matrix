import { type StoredAnimation, animationIdSchema, getPreset } from "@led-matrix/core";
import { z } from "zod";

export const cueSchema = z
  .object({
    beat: z.number(),
    end: z.number().optional(),
    animation: animationIdSchema.optional(),
    section: z.union([z.string(), z.int().min(0)]).optional(),
    preset: z.string().min(1).optional(),
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

export type SectionCue = {
  beat: number;
  animationId: string;
  section: number;
  preset: string | undefined;
  beats: number | undefined;
};

export type BlankCue = { beat: number; animationId: null };

export type ResolvedCue = SectionCue | BlankCue;

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

export type ExplicitCue = Cue & { animation: string };

export function getExplicitCues(cues: readonly Cue[]): ExplicitCue[] {
  let animation = "";
  let preset: string | undefined;
  return cues.map((cue) => {
    preset = cue.animation === undefined ? (cue.preset ?? preset) : cue.preset;
    animation = cue.animation ?? animation;
    const { preset: _preset, ...rest } = cue;
    return preset === undefined ? { ...rest, animation } : { ...rest, animation, preset };
  });
}

export function getResolvedCues(
  cues: readonly Cue[],
  animationsById: ReadonlyMap<string, StoredAnimation>,
): { cues: ResolvedCue[]; errors: string[] } {
  const resolved: ResolvedCue[] = [];
  const errors: string[] = [];
  for (const [index, cue] of getExplicitCues(cues).entries()) {
    const { animation: animationId, preset } = cue;
    const animation = animationsById.get(animationId);
    if (!animation) {
      errors.push(`beat ${cue.beat}: animation "${animationId}" not found`);
      continue;
    }
    const section = getSectionIndex(animation, cue.section);
    if (section === undefined) {
      errors.push(
        `beat ${cue.beat}: section ${JSON.stringify(cue.section)} not found in "${animationId}"`,
      );
      continue;
    }
    if (preset !== undefined && !getPreset(animation, preset)) {
      errors.push(`beat ${cue.beat}: preset "${preset}" not found in "${animationId}"`);
      continue;
    }
    const isOnce = animation.sections[section]?.mode.type === "once";
    const beats = cue.end === undefined || !isOnce ? undefined : cue.end - cue.beat;
    resolved.push({ beat: cue.beat, animationId, section, preset, beats });
    const next = cues[index + 1];
    if (cue.end !== undefined && (next === undefined || cue.end < next.beat)) {
      resolved.push({ beat: cue.end, animationId: null });
    }
  }
  return { cues: resolved, errors };
}

export function getResolvedMapping(
  file: MappingFile,
  animations: readonly StoredAnimation[],
): { mapping: Mapping; errors: string[] } {
  const animationsById = new Map(animations.map((animation) => [animation.id, animation]));
  const mapping = new Map<string, ResolvedCue[]>();
  const errors: string[] = [];
  for (const [location, cues] of Object.entries(file.tracks)) {
    const resolved = getResolvedCues(cues, animationsById);
    errors.push(...resolved.errors.map((error) => `${location} ${error}`));
    if (resolved.errors.length === 0) {
      mapping.set(location, resolved.cues);
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
