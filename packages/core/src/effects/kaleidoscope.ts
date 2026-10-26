import { z } from "zod";
import { defineEffect } from "../effect.ts";
import { HEIGHT, WIDTH } from "../frame.ts";
import { createRgba, getReflected, samplingModes, sampleImage, setRgba } from "../sample.ts";

export const kaleidoscope = defineEffect({
  id: "kaleidoscope",
  name: "Kaleidoscope",
  kind: "filter",
  params: z.object({
    segments: z.number().int().min(2).max(16).default(6),
    rotations: z.number().int().min(-8).max(8).default(1),
    zoom: z.number().min(0.25).max(4).default(1),
    sampling: z.enum(samplingModes).default("bilinear"),
  }),
  render(image, { params, progress, source }) {
    const segment = (Math.PI * 2) / params.segments;
    const rotation = progress * params.rotations * Math.PI * 2;
    const color = createRgba();
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const dx = x + 0.5 - WIDTH / 2;
        const dy = y + 0.5 - HEIGHT / 2;
        const radius = Math.hypot(dx, dy) / params.zoom;
        const angle = Math.atan2(dy, dx) - rotation;
        const index = Math.floor(angle / segment);
        const local = angle - index * segment;
        const folded = (index % 2 === 0 ? local : segment - local) + rotation;
        sampleImage(
          source,
          getReflected(WIDTH / 2 + radius * Math.cos(folded), WIDTH),
          getReflected(HEIGHT / 2 + radius * Math.sin(folded), HEIGHT),
          params.sampling,
          color,
        );
        setRgba(image, x, y, color);
      }
    }
  },
});
