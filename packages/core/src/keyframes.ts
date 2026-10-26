import { z } from "zod";
import { colorSchema, formatColor, parseColor } from "./color.ts";

export const easingNames = [
  "linear",
  "step",
  "easeInQuad",
  "easeOutQuad",
  "easeInOutQuad",
  "easeInCubic",
  "easeOutCubic",
  "easeInOutCubic",
  "easeInOutSine",
] as const;

export type Easing = (typeof easingNames)[number];

export const easings: Readonly<Record<Easing, (t: number) => number>> = {
  linear: (t: number) => t,
  step: (t: number) => (t < 1 ? 0 : 1),
  easeInQuad: (t: number) => t * t,
  easeOutQuad: (t: number) => t * (2 - t),
  easeInOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  easeInCubic: (t: number) => t ** 3,
  easeOutCubic: (t: number) => 1 - (1 - t) ** 3,
  easeInOutCubic: (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  easeInOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
};

export const keyframeSchema = z.object({
  at: z.number().min(0).max(1),
  value: z.union([z.number(), colorSchema]),
  easing: z.enum(easingNames).optional(),
});

export const keyframeTrackSchema = z.object({
  keyframes: z.array(keyframeSchema).min(1),
});

export type Keyframe = z.infer<typeof keyframeSchema>;

export type KeyframeTrack = z.infer<typeof keyframeTrackSchema>;

function interpolate(from: number | string, to: number | string, t: number): number | string {
  if (typeof from === "number" && typeof to === "number") {
    return from + (to - from) * t;
  }
  if (typeof from === "string" && typeof to === "string") {
    const fromColor = parseColor(from);
    const toColor = parseColor(to);
    return formatColor([
      fromColor[0] + (toColor[0] - fromColor[0]) * t,
      fromColor[1] + (toColor[1] - fromColor[1]) * t,
      fromColor[2] + (toColor[2] - fromColor[2]) * t,
    ]);
  }
  return t < 1 ? from : to;
}

export function getKeyframeValue(
  keyframes: readonly Keyframe[],
  progress: number,
): number | string {
  const sorted = keyframes.toSorted((a, b) => a.at - b.at);
  const first = sorted[0];
  if (!first) {
    throw new Error("Keyframe track is empty");
  }
  if (progress <= first.at) {
    return first.value;
  }
  for (let index = 0; index < sorted.length - 1; index++) {
    const from = sorted[index];
    const to = sorted[index + 1];
    if (from && to && progress < to.at) {
      const t = (progress - from.at) / (to.at - from.at);
      return interpolate(from.value, to.value, easings[from.easing ?? "linear"](t));
    }
  }
  return sorted.at(-1)?.value ?? first.value;
}

export function resolveParams(
  params: Readonly<Record<string, unknown>>,
  progress: number,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => {
      const track = keyframeTrackSchema.safeParse(value);
      return [key, track.success ? getKeyframeValue(track.data.keyframes, progress) : value];
    }),
  );
}
