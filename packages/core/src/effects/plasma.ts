import { z } from "zod";
import { getHsvColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { HEIGHT, WIDTH, setRgbaPixel } from "../frame.ts";

export const plasma = defineEffect({
  id: "plasma",
  name: "Plasma",
  kind: "pixel",
  params: z.object({
    cycles: z.number().int().min(1).max(32).default(1),
    scale: z.number().positive().max(4).default(1),
    hueShift: z.number().min(0).max(1).default(0),
    saturation: z.number().min(0).max(1).default(1),
    brightness: z.number().min(0).max(1).default(1),
  }),
  render(image, { params, progress }) {
    const phase = progress * params.cycles * Math.PI * 2;
    const frequency = (params.scale * Math.PI * 2) / WIDTH;
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const dx = x - WIDTH / 2;
        const dy = y - HEIGHT / 2;
        const value =
          Math.sin(x * frequency + phase) +
          Math.sin(y * frequency * 0.7 - phase) +
          Math.sin((x + y) * frequency * 0.5 + phase) +
          Math.sin(Math.hypot(dx, dy) * frequency - phase);
        const hue = value / 8 + params.hueShift + progress * params.cycles;
        setRgbaPixel(image, x, y, getHsvColor(hue, params.saturation, params.brightness));
      }
    }
  },
});
