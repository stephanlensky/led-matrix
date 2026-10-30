import { z } from "zod";
import { colorSchema, parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import { createRgbaImage } from "../../frame.ts";
import { TAU } from "../cat-duo.ts";
import {
  type Cube,
  drawCubes,
  drawGlitchedCat,
  drawGrid,
  drawRain,
  drawSky,
  getGlitch,
  getPulse,
} from "../cat-cyberspace.ts";
import { mix } from "../cat-model.ts";
import {
  BLACK,
  WHITE,
  drawNyan,
  drawRainbow,
  drawStars,
  fillBackground,
  getNyanFrame,
  nyanParams,
} from "./shared.ts";

const HORIZON = 40;
const CUBES: readonly Cube[] = [
  { x: 7, y: 6, size: 4, spin: 1, bob: 0 },
  { x: 33, y: 5, size: 4, spin: -1, bob: 0.5 },
  { x: 57, y: 7, size: 5, spin: 2, bob: 0.25 },
];

export const nyanCyberspace = defineEffect({
  id: "nyan-cyberspace",
  name: "Nyan cyberspace",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    ...nyanParams,
    neonColor: colorSchema.default("#00f0ff"),
    gridColor: colorSchema.default("#ff28c8"),
    codeColor: colorSchema.default("#30ff60"),
    every: z.number().min(0.25).max(4).default(1),
    sky: z.boolean().default(true),
    glitch: z.boolean().default(true),
  }),
  render(image, { params, beat }) {
    const pulse = getPulse(beat, params.every);
    const neon = parseColor(params.neonColor);
    const gridColor = parseColor(params.gridColor);
    fillBackground(image, BLACK);
    if (params.sky) {
      drawSky(image, gridColor, pulse.kick);
    }
    drawRain(image, beat, parseColor(params.codeColor), pulse.kick);
    drawGrid(image, beat, gridColor, pulse.kick, params.sky ? undefined : BLACK);
    drawCubes(image, beat, neon, pulse.kick, CUBES);
    const frame = getNyanFrame(beat, params.speed);
    drawStars(image, frame, {
      count: 8,
      bottom: HORIZON - 4,
      color: mix(neon, WHITE, 0.5),
    });
    const cat = createRgbaImage();
    const x = 21;
    const y = 16 + Math.round(2 * Math.sin((beat / 4) * TAU)) - Math.round(pulse.kick);
    drawRainbow(cat, x, y, frame);
    drawNyan(cat, params, x, y, frame);
    drawGlitchedCat(image, cat, neon, params.glitch ? getGlitch(pulse) : 0, pulse.index);
  },
});
