import { z } from "zod";
import { blendModes } from "./blend.ts";
import { getEffect } from "./effects/index.ts";
import { resolveParams } from "./keyframes.ts";

export const animationModeSchema = z.union([
  z.object({ type: z.literal("loop"), beats: z.number().positive() }),
  z.object({ type: z.literal("loop"), frames: z.number().int().positive() }),
  z.object({ type: z.literal("duration"), ms: z.number().positive() }),
]);

export const layerSchema = z
  .object({
    effect: z.string(),
    params: z.record(z.string(), z.unknown()).default({}),
    blend: z.enum(blendModes).default("normal"),
    opacity: z.number().min(0).max(1).default(1),
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

export const animationSchema = z.object({
  name: z.string().min(1).max(100),
  mode: animationModeSchema,
  layers: z.array(layerSchema).min(1),
});

export type AnimationMode = z.infer<typeof animationModeSchema>;

export type Layer = z.infer<typeof layerSchema>;

export type Animation = z.infer<typeof animationSchema>;

export type AnimationInput = z.input<typeof animationSchema>;

export type AnimationTiming = {
  time: number;
  progress: number;
  beat: number;
};

export function getAnimationLength(mode: AnimationMode, bpm: number, fps: number): number {
  if (mode.type === "duration") {
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
