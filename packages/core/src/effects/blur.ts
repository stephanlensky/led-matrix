import { z } from "zod";
import { defineEffect } from "../effect.ts";
import { HEIGHT, RGBA_CHANNELS, type RgbaImage, WIDTH } from "../frame.ts";

function blurLine(
  from: RgbaImage,
  to: RgbaImage,
  radius: number,
  length: number,
  getOffset: (position: number) => number,
): void {
  for (let channel = 0; channel < 3; channel++) {
    let sum = 0;
    for (let position = -radius; position <= radius; position++) {
      sum += from[getOffset(Math.min(Math.max(position, 0), length - 1)) + channel] ?? 0;
    }
    for (let position = 0; position < length; position++) {
      to[getOffset(position) + channel] = sum / (radius * 2 + 1);
      const added = Math.min(position + radius + 1, length - 1);
      const removed = Math.max(position - radius, 0);
      sum += (from[getOffset(added) + channel] ?? 0) - (from[getOffset(removed) + channel] ?? 0);
    }
  }
}

export const blur = defineEffect({
  id: "blur",
  name: "Blur",
  kind: "filter",
  isBeatOnly: true,
  params: z.object({
    radius: z.number().int().min(0).max(16).default(2),
    passes: z.number().int().min(1).max(3).default(2),
  }),
  render(image, { params, source }) {
    image.set(source);
    const buffer = new Uint8ClampedArray(image.length);
    for (let pass = 0; pass < params.passes; pass++) {
      for (let y = 0; y < HEIGHT; y++) {
        blurLine(image, buffer, params.radius, WIDTH, (x) => (y * WIDTH + x) * RGBA_CHANNELS);
      }
      for (let x = 0; x < WIDTH; x++) {
        blurLine(buffer, image, params.radius, HEIGHT, (y) => (y * WIDTH + x) * RGBA_CHANNELS);
      }
    }
  },
});
