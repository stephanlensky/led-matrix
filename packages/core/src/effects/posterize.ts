import { z } from "zod";
import { defineEffect } from "../effect.ts";
import { RGBA_CHANNELS } from "../frame.ts";

export const posterize = defineEffect({
  id: "posterize",
  name: "Posterize",
  kind: "filter",
  isBeatOnly: true,
  params: z.object({
    levels: z.number().int().min(2).max(16).default(4),
  }),
  render(image, { params, source }) {
    const steps = params.levels - 1;
    for (let offset = 0; offset < source.length; offset += RGBA_CHANNELS) {
      for (let channel = 0; channel < 3; channel++) {
        image[offset + channel] =
          (Math.round(((source[offset + channel] ?? 0) / 255) * steps) / steps) * 255;
      }
      image[offset + 3] = 255;
    }
  },
});
