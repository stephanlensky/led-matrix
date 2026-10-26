import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { fillRgbaImage } from "../frame.ts";

export const strobe = defineEffect({
  id: "strobe",
  name: "Strobe",
  kind: "pixel",
  params: z.object({
    color: colorSchema.default("#ffffff"),
    flashesPerBeat: z.number().positive().max(16).default(1),
    duty: z.number().min(0).max(1).default(0.25),
  }),
  render(image, { params, beat }) {
    const phase = (beat * params.flashesPerBeat) % 1;
    if (phase < params.duty) {
      fillRgbaImage(image, parseColor(params.color));
    }
  },
});
