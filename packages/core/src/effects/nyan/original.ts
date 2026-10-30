import { z } from "zod";
import { parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import { HEIGHT } from "../../frame.ts";
import {
  NYAN_HEIGHT,
  drawNyan,
  drawRainbow,
  drawStars,
  fillBackground,
  getNyanFrame,
  nyanParams,
} from "./shared.ts";

export const nyanCat = defineEffect({
  id: "nyan-cat",
  name: "Nyan cat",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    ...nyanParams,
    size: z.number().int().min(1).max(2).default(1),
    stars: z.number().int().min(0).max(40).default(14),
  }),
  render(image, { params, beat }) {
    fillBackground(image, parseColor(params.background));
    const frame = getNyanFrame(beat, params.speed);
    const scale = params.size;
    const x = scale === 1 ? 21 : -3;
    const y = Math.round((HEIGHT - NYAN_HEIGHT * scale) / 2) + (scale === 1 ? 1 : 0);
    drawStars(image, frame, { count: params.stars, scale });
    drawRainbow(image, x, y, frame, { scale });
    drawNyan(image, params, x, y, frame, { scale });
  },
});
