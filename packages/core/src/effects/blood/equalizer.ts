import { z } from "zod";
import { colorSchema, parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import {
  type Equalizer,
  drawEqualizer,
  drawEqualizerSpray,
  equalizerStyles,
} from "../equalizer.ts";
import { BLOOD_COLOR } from "./shared.ts";

export const bloodEqualizer = defineEffect({
  id: "blood-equalizer",
  name: "Blood equalizer",
  kind: "pixel",
  params: z.object({
    color: colorSchema.default(BLOOD_COLOR),
    bars: z.number().int().min(4).max(16).default(8),
    style: z.enum(equalizerStyles).default("bottom"),
    spray: z.number().int().min(0).max(16).default(4),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const equalizer: Equalizer = { ...params, texture: 1, getColor: () => color };
    drawEqualizer(image, beat, equalizer);
    drawEqualizerSpray(image, beat, params.spray, equalizer);
  },
});
