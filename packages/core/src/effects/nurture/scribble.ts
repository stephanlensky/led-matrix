import { z } from "zod";
import { colorSchema } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import { HEIGHT, WIDTH } from "../../frame.ts";
import {
  type Ink,
  addInkDot,
  addInkPath,
  clamp,
  createInk,
  createScribble,
  drawInk,
  getCycle,
  getDrivenBeat,
  getScribblePoint,
  getScribblePoints,
  paperSchema,
  speedSchema,
} from "./shared.ts";

const SCRIBBLE_SEED = 0x5c21;
const MARGIN = 5;

export const scribbleParams = {
  ink: colorSchema.default("#ffffff"),
  paper: paperSchema.default("none"),
  mode: z.enum(["trail", "build"]).default("trail"),
  style: z.enum(["smooth", "jagged"]).default("smooth"),
  pens: z.number().int().min(1).max(3).default(1),
  tail: z.number().min(1).max(16).default(6),
  period: z.number().min(4).max(64).default(16),
  drive: z.number().min(0).max(1).default(0.6),
  complexity: z.number().int().min(3).max(12).default(8),
};

type ScribbleParams = {
  [K in keyof typeof scribbleParams]: z.output<(typeof scribbleParams)[K]>;
};

export function addScribbles(
  ink: Ink,
  params: ScribbleParams,
  beat: number,
  box = { x: MARGIN, y: MARGIN, width: WIDTH - MARGIN * 2, height: HEIGHT - MARGIN * 2 },
): void {
  const driven = getDrivenBeat(beat, params.drive);
  const isJagged = params.style === "jagged";
  const step = (isJagged ? 0.5 : 1 / 24) / params.period;
  for (let pen = 0; pen < params.pens; pen++) {
    const scribble = createScribble(hashPen(pen), box, params.complexity);
    const offset = pen / params.pens / 3;
    const to = driven / params.period + offset;
    const from =
      params.mode === "build"
        ? Math.floor(driven / params.period) + offset
        : to - params.tail / params.period;
    const elapsed = getCycle(driven / params.period) * params.period;
    const fade = params.mode === "build" ? 1 - clamp(elapsed - (params.period - 1)) : 1;
    const points = getScribblePoints(scribble, from, to, step, isJagged ? 3 : 0, hashPen(pen) + 1);
    if (params.mode === "trail") {
      const fadeStart = Math.floor(points.length * 0.35);
      addInkPath(ink, points.slice(0, fadeStart + 1), 0.45);
      addInkPath(ink, points.slice(fadeStart), 1);
    } else {
      addInkPath(ink, points, fade);
    }
    addInkDot(ink, getScribblePoint(scribble, to), 0.8, 1);
  }
}

function hashPen(pen: number): number {
  return SCRIBBLE_SEED + pen * 7919;
}

export const scribble = defineEffect({
  id: "scribble",
  name: "Scribble",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({ ...scribbleParams, speed: speedSchema }),
  render(image, { params, beat: musicBeat }) {
    const beat = musicBeat * params.speed;
    const ink = createInk();
    addScribbles(ink, params, beat);
    drawInk(image, ink, params.ink, params.paper);
  },
});
