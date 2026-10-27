import { z } from "zod";
import { blendModes } from "./blend.ts";
import { getEffect } from "./effects/index.ts";
import { resolveParams } from "./keyframes.ts";

export const modeTypes = ["loop", "once"] as const;

const modeTypeSchema = z.enum(modeTypes);

export const animationModeSchema = z.union([
  z.object({ type: modeTypeSchema, beats: z.number().positive() }),
  z.object({ type: modeTypeSchema, frames: z.number().int().positive() }),
  z.object({ type: modeTypeSchema, ms: z.number().positive() }),
]);

export const layerSchema = z
  .object({
    effect: z.string(),
    params: z.record(z.string(), z.unknown()).default({}),
    blend: z.enum(blendModes).default("normal"),
    opacity: z.number().min(0).max(1).default(1),
    antialias: z.boolean().optional(),
  })
  .superRefine((layer, context) => {
    const effect = getEffect(layer.effect);
    if (!effect) {
      context.addIssue({
        code: "custom",
        path: ["effect"],
        message: `Unknown effect "${layer.effect}"`,
      });
      return;
    }
    const issues = new Map<string, z.core.$ZodIssue>();
    for (const progress of [0, 1]) {
      for (const issue of effect.params.safeParse(resolveParams(layer.params, progress)).error
        ?.issues ?? []) {
        issues.set(JSON.stringify([issue.path, issue.message]), issue);
      }
    }
    for (const issue of issues.values()) {
      context.addIssue({ code: "custom", path: ["params", ...issue.path], message: issue.message });
    }
  });

export const sectionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  mode: animationModeSchema,
  layers: z.array(layerSchema).min(1),
});

export const animationObjectSchema = z.object({
  name: z.string().min(1).max(100),
  sections: z
    .array(sectionSchema)
    .min(1)
    .superRefine((sections, context) => {
      const names = new Set<string>();
      for (const [index, { name }] of sections.entries()) {
        if (name === undefined) {
          continue;
        }
        if (names.has(name)) {
          context.addIssue({
            code: "custom",
            path: [index, "name"],
            message: `Duplicate section name "${name}"`,
          });
        }
        names.add(name);
      }
    }),
});

export const animationIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getMode(mode: unknown): unknown {
  return isRecord(mode) && mode["type"] === "duration" ? { ...mode, type: "once" } : mode;
}

export function getSectionedAnimation(value: unknown): unknown {
  if (!isRecord(value) || "sections" in value || !("layers" in value)) {
    return value;
  }
  const { mode, layers, ...rest } = value;
  return { ...rest, sections: [{ mode: getMode(mode), layers }] };
}

export const animationSchema = z.preprocess(getSectionedAnimation, animationObjectSchema);

export const storedAnimationSchema = z.preprocess(
  getSectionedAnimation,
  animationObjectSchema.extend({ id: animationIdSchema }),
);

export type AnimationMode = z.infer<typeof animationModeSchema>;

export type Layer = z.infer<typeof layerSchema>;

export type ModeType = (typeof modeTypes)[number];

export type Section = z.infer<typeof sectionSchema>;

export type Animation = z.infer<typeof animationObjectSchema>;

export type StoredAnimation = z.infer<typeof storedAnimationSchema>;

export type AnimationInput = z.input<typeof animationObjectSchema>;

export type AnimationTiming = {
  time: number;
  progress: number;
  beat: number;
};

export function getAnimationLength(mode: AnimationMode, bpm: number, fps: number): number {
  if ("ms" in mode) {
    return mode.ms;
  }
  return "beats" in mode ? (mode.beats * 60_000) / bpm : (mode.frames * 1000) / fps;
}

export function getAnimationTiming(
  mode: AnimationMode,
  elapsed: number,
  bpm: number,
  fps: number,
): AnimationTiming {
  const length = getAnimationLength(mode, bpm, fps);
  const time =
    mode.type === "loop"
      ? ((elapsed % length) + length) % length
      : Math.min(Math.max(elapsed, 0), length);
  return { time, progress: time / length, beat: (time * bpm) / 60_000 };
}
