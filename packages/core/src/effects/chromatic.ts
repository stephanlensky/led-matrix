import { z } from "zod";
import { defineEffect } from "../effect.ts";
import { HEIGHT, RGBA_CHANNELS, WIDTH } from "../frame.ts";
import { createRgba, sampleImage } from "../sample.ts";

export const chromatic = defineEffect({
  id: "chromatic",
  name: "Chromatic offset",
  kind: "filter",
  params: z.object({
    offset: z.number().min(0).max(8).default(1.5),
    angle: z.number().min(0).max(360).default(0),
    pulse: z.number().min(0).max(4).default(0),
  }),
  render(image, { params, beat, source }) {
    const distance = params.offset * (1 + params.pulse * (1 - (beat % 1)));
    const angle = (params.angle * Math.PI) / 180;
    const shiftX = Math.cos(angle) * distance;
    const shiftY = Math.sin(angle) * distance;
    const color = createRgba();
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const offset = (y * WIDTH + x) * RGBA_CHANNELS;
        image[offset] = sampleImage(
          source,
          x + 0.5 - shiftX,
          y + 0.5 - shiftY,
          "bilinear",
          color,
        )[0];
        image[offset + 1] = source[offset + 1] ?? 0;
        image[offset + 2] = sampleImage(
          source,
          x + 0.5 + shiftX,
          y + 0.5 + shiftY,
          "bilinear",
          color,
        )[2];
        image[offset + 3] = 255;
      }
    }
  },
});
