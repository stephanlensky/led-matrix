import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { fillRgbaImage } from "../frame.ts";
import { getVisibleFlash } from "./flash.ts";

export const strobe = defineEffect({
  id: "strobe",
  name: "Strobe",
  kind: "pixel",
  params: z.object({
    color: colorSchema.default("#ffffff"),
    flashesPerBeat: z.number().positive().max(16).default(1),
    duty: z.number().min(0).max(1).default(0.25),
    reverse: z.boolean().default(false),
  }),
  render(image, { params, beat, bpm, fps }) {
    if (getVisibleFlash(beat, params.flashesPerBeat, params.duty, bpm, fps, params.reverse)) {
      fillRgbaImage(image, parseColor(params.color));
    }
  },
});
