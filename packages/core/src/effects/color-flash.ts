import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { fillRgbaImage } from "../frame.ts";
import { easingNames, easings } from "../keyframes.ts";
import { getVisibleFlash } from "./flash.ts";
import { getPalette, getPaletteColor, mixColors, paletteParams } from "./palette.ts";

export const colorFlash = defineEffect({
  id: "color-flash",
  name: "Color flash",
  kind: "pixel",
  params: z.object({
    ...paletteParams,
    flashesPerBeat: z.number().positive().max(16).default(1),
    duty: z.number().min(0).max(1).default(1),
    fade: z.number().min(0).max(1).default(0),
    background: colorSchema.default("#000000"),
  }),
  render(image, { params, beat, bpm, fps }) {
    const flash = getVisibleFlash(beat, params.flashesPerBeat, params.duty, bpm, fps);
    const background = parseColor(params.background);
    if (!flash) {
      fillRgbaImage(image, background);
      return;
    }
    const { index, progress } = flash;
    const color = getPaletteColor(getPalette(params), index);
    const intensity = 1 - params.fade * progress;
    fillRgbaImage(image, mixColors(background, color, intensity));
  },
});

export const colorFade = defineEffect({
  id: "color-fade",
  name: "Color fade",
  kind: "pixel",
  params: z.object({
    ...paletteParams,
    beatsPerColor: z.number().positive().max(64).default(4),
    duration: z.number().min(0.05).max(1).default(1),
    easing: z.enum(easingNames).default("easeInOutSine"),
  }),
  render(image, { params, beat }) {
    const position = beat / params.beatsPerColor;
    const step = Math.floor(position);
    const amount = easings[params.easing](Math.min((position - step) / params.duration, 1));
    const palette = getPalette(params);
    fillRgbaImage(
      image,
      mixColors(getPaletteColor(palette, step), getPaletteColor(palette, step + 1), amount),
    );
  },
});
