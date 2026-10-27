import { z } from "zod";
import { blendModes } from "./blend.ts";
import { getEffect } from "./effects/index.ts";
import { resolveParams } from "./keyframes.ts";
import {
  type Parameter,
  type ParameterSelection,
  getParameterReference,
  getParameterValues,
  getReferencedParams,
  parametersSchema,
} from "./parameters.ts";

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
    if (!getEffect(layer.effect)) {
      context.addIssue({
        code: "custom",
        path: ["effect"],
        message: `Unknown effect "${layer.effect}"`,
      });
    }
  });

export const sectionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  mode: animationModeSchema,
  layers: z.array(layerSchema).min(1),
});

export const FOLDER_SEPARATOR = "/";

export function getFolderPath(folder: string | undefined): string[] {
  return (folder ?? "")
    .split(FOLDER_SEPARATOR)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export const folderSchema = z
  .string()
  .max(200)
  .transform((folder) => getFolderPath(folder).join(FOLDER_SEPARATOR) || undefined)
  .optional();

type LayerIssue = { path: PropertyKey[]; message: string };

function getSelections(parameters: readonly Parameter[] | undefined): ParameterSelection[] {
  const selections = (parameters ?? []).flatMap(({ name, options }) =>
    options.map((option) => ({ [name]: option.name })),
  );
  return selections.length > 0 ? selections : [{}];
}

function getSelectionSuffix(selection: ParameterSelection): string {
  const [entry] = Object.entries(selection);
  return entry ? ` (${entry[0]} "${entry[1]}")` : "";
}

function getLayerIssues(
  layer: z.output<typeof layerSchema>,
  parameters: readonly Parameter[] | undefined,
): LayerIssue[] {
  const effect = getEffect(layer.effect);
  if (!effect) {
    return [];
  }
  const defaults = getParameterValues({ parameters }, undefined);
  const missing = Object.entries(layer.params).flatMap(([key, value]) => {
    const reference = getParameterReference(value);
    return reference === undefined || reference in defaults ? [] : [{ key, reference }];
  });
  const issues = new Map<string, LayerIssue>(
    missing.map(({ key, reference }) => [
      JSON.stringify([key]),
      { path: ["params", key], message: `Parameter value "${reference}" is not defined` },
    ]),
  );
  for (const selection of getSelections(parameters)) {
    const params = getReferencedParams(layer.params, getParameterValues({ parameters }, selection));
    for (const progress of [0, 1]) {
      for (const issue of effect.params.safeParse(resolveParams(params, progress)).error?.issues ??
        []) {
        if (missing.some(({ key }) => key === issue.path[0])) {
          continue;
        }
        const key = JSON.stringify(issue.path);
        if (!issues.has(key)) {
          issues.set(key, {
            path: ["params", ...issue.path],
            message: issue.message + getSelectionSuffix(selection),
          });
        }
      }
    }
  }
  return [...issues.values()];
}

export const animationObjectSchema = z
  .object({
    name: z.string().min(1).max(100),
    folder: folderSchema,
    parameters: parametersSchema.optional(),
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
  })
  .superRefine((animation, context) => {
    for (const [sectionIndex, section] of animation.sections.entries()) {
      for (const [layerIndex, layer] of section.layers.entries()) {
        for (const { path, message } of getLayerIssues(layer, animation.parameters)) {
          context.addIssue({
            code: "custom",
            path: ["sections", sectionIndex, "layers", layerIndex, ...path],
            message,
          });
        }
      }
    }
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
  animationObjectSchema.safeExtend({ id: animationIdSchema }),
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
