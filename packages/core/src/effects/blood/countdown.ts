import { z } from "zod";
import { colorSchema, formatColor, parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import { fontNames } from "../../fonts/index.ts";
import { HEIGHT } from "../../frame.ts";
import { BLOOD_COLOR, getMixedColor } from "./shared.ts";
import { drawBloodText } from "./text.ts";

const FLASH_COLOR = [255, 200, 190] as const;

export const bloodCountdown = defineEffect({
  id: "blood-countdown",
  name: "Blood countdown",
  kind: "pixel",
  params: z.object({
    color: colorSchema.default(BLOOD_COLOR),
    from: z.number().int().min(1).max(99).default(8),
    beatsPerNumber: z.number().min(0.25).max(16).default(4),
    font: z.enum(fontNames).default("spleen-16x32"),
    offsetY: z.number().int().min(-HEIGHT).max(HEIGHT).default(-6),
  }),
  render(image, { params, beat }) {
    const index = Math.min(params.from - 1, Math.max(0, Math.floor(beat / params.beatsPerNumber)));
    const since = beat - index * params.beatsPerNumber;
    const growth = params.from > 1 ? index / (params.from - 1) : 1;
    const flash = Math.exp(-since * 5) * 0.7;
    drawBloodText(
      image,
      {
        text: String(params.from - index),
        font: params.font,
        color: formatColor(getMixedColor(parseColor(params.color), FLASH_COLOR, flash)),
        drips: Math.round(3 + growth * 13),
        dripBeats: Math.max(1, Math.round(4 - growth * 3)),
        dripLength: Math.round(4 + growth * 16),
        shake: growth > 0.8 ? 2 : growth > 0.5 ? 1 : 0,
        weight: 2,
        offsetY: params.offsetY,
      },
      beat,
    );
  },
});
