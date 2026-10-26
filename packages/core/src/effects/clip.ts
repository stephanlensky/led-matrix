import { z } from "zod";
import { getClipDuration, getClipFrameIndex } from "../clip.ts";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { HEIGHT, RGBA_CHANNELS, WIDTH } from "../frame.ts";

export const clipTimings = ["native", "stretch"] as const;

export const clipDirections = ["forward", "reverse", "pingpong"] as const;

function getFraction(value: number): number {
  return value - Math.floor(value);
}

export const clip = defineEffect({
  id: "clip",
  name: "Clip",
  kind: "pixel",
  params: z.object({
    clip: z.string().default("").meta({ format: "clip" }),
    timing: z.enum(clipTimings).default("native"),
    speed: z.number().min(0.1).max(4).default(1),
    cycles: z.number().int().min(1).max(16).default(1),
    direction: z.enum(clipDirections).default("forward"),
    zoom: z.number().min(1).max(8).default(1),
    offsetX: z.number().min(-WIDTH).max(WIDTH).default(0),
    offsetY: z.number().min(-HEIGHT).max(HEIGHT).default(0),
    tint: colorSchema.default("#ffffff"),
  }),
  render(image, { params, time, progress, clips }) {
    const source = clips.getClip(params.clip);
    if (!source) {
      return;
    }
    const passes = params.direction === "pingpong" ? 2 : 1;
    const position = getFraction(
      params.timing === "native"
        ? (time * params.speed) / (getClipDuration(source) * passes)
        : progress * params.cycles,
    );
    const frame =
      source.frames[
        getClipFrameIndex(
          source,
          params.direction === "reverse"
            ? 1 - position
            : params.direction === "pingpong"
              ? 1 - Math.abs(1 - position * 2)
              : position,
        )
      ];
    if (!frame) {
      return;
    }
    const [red, green, blue] = parseColor(params.tint).map((channel) => channel / 255);
    for (let y = 0; y < HEIGHT; y++) {
      const sourceY = Math.floor(
        (y + 0.5 - HEIGHT / 2 - params.offsetY) / params.zoom + HEIGHT / 2,
      );
      if (sourceY < 0 || sourceY >= HEIGHT) {
        continue;
      }
      for (let x = 0; x < WIDTH; x++) {
        const sourceX = Math.floor(
          (x + 0.5 - WIDTH / 2 - params.offsetX) / params.zoom + WIDTH / 2,
        );
        if (sourceX < 0 || sourceX >= WIDTH) {
          continue;
        }
        const from = (sourceY * WIDTH + sourceX) * RGBA_CHANNELS;
        const to = (y * WIDTH + x) * RGBA_CHANNELS;
        image[to] = (frame[from] ?? 0) * (red ?? 1);
        image[to + 1] = (frame[from + 1] ?? 0) * (green ?? 1);
        image[to + 2] = (frame[from + 2] ?? 0) * (blue ?? 1);
        image[to + 3] = frame[from + 3] ?? 0;
      }
    }
  },
});
