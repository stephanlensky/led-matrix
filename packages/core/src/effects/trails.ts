import { z } from "zod";
import { defineEffect } from "../effect.ts";
import { RGBA_CHANNELS } from "../frame.ts";

export const trails = defineEffect({
  id: "trails",
  name: "Trails",
  kind: "filter",
  params: z.object({
    decay: z.number().min(0).max(0.99).default(0.85),
  }),
  render(image, { params, source, previous }) {
    for (let offset = 0; offset < source.length; offset += RGBA_CHANNELS) {
      for (let channel = 0; channel < 3; channel++) {
        image[offset + channel] = Math.max(
          source[offset + channel] ?? 0,
          (previous[offset + channel] ?? 0) * params.decay,
        );
      }
      image[offset + 3] = 255;
    }
  },
});
