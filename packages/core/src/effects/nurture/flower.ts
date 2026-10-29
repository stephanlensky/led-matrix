import { z } from "zod";
import { colorSchema } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import { easings } from "../../keyframes.ts";
import {
  type Point,
  TAU,
  addInkDot,
  addInkPath,
  clamp,
  createInk,
  drawInk,
  getCycle,
  getDrivenBeat,
  paperSchema,
  speedSchema,
} from "./shared.ts";

const LOOP_BEATS = 16;
const STEM_END = 2;
const PETALS_END = 12;
const ERASE_START = 14.5;
const CENTER: Point = [34, 28];
const REVOLUTIONS = 4;
const PETALS = 5;
const SAMPLES_PER_BEAT = 48;

type TimedPoint = { beat: number; point: Point };

function getStemPoint(t: number): Point {
  const [startX, startY] = [24, 66];
  const [controlX, controlY] = [18, 44];
  const [endX, endY] = CENTER;
  const u = 1 - t;
  return [
    u * u * startX + 2 * u * t * controlX + t * t * endX,
    u * u * startY + 2 * u * t * controlY + t * t * endY,
  ];
}

function getPetalPoint(t: number): Point {
  const angle = t * REVOLUTIONS * TAU;
  const shrink = 1 - 0.45 * t;
  const petal = Math.abs(Math.sin((PETALS * angle) / 2 + t * 2.2));
  const radius = 23 * shrink * (0.22 + 0.78 * petal) * (1 + 0.12 * Math.sin(angle * 0.7));
  const turn = angle + t * 1.4;
  return [CENTER[0] + Math.cos(turn) * radius, CENTER[1] + Math.sin(turn) * radius * 0.82];
}

function createFlowerPath(): TimedPoint[] {
  const path: TimedPoint[] = [];
  const stemSamples = STEM_END * SAMPLES_PER_BEAT;
  for (let index = 0; index <= stemSamples; index++) {
    const t = index / stemSamples;
    path.push({ beat: t * STEM_END, point: getStemPoint(easings.easeInOutSine(t)) });
  }
  const petalSamples = (PETALS_END - STEM_END) * SAMPLES_PER_BEAT;
  for (let index = 1; index <= petalSamples; index++) {
    const t = index / petalSamples;
    path.push({ beat: STEM_END + t * (PETALS_END - STEM_END), point: getPetalPoint(t) });
  }
  return path;
}

const flowerPath = createFlowerPath();

export const scribbleFlower = defineEffect({
  id: "scribble-flower",
  name: "Scribble flower",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    speed: speedSchema,
    ink: colorSchema.default("#000000"),
    paper: paperSchema.default("#ffffff"),
    drive: z.number().min(0).max(1).default(0.5),
    pulse: z.number().min(0).max(0.2).default(0.06),
  }),
  render(image, { params, beat: musicBeat }) {
    const beat = musicBeat * params.speed;
    const elapsed = getCycle(beat / LOOP_BEATS) * LOOP_BEATS;
    const head = getDrivenBeat(elapsed, params.drive);
    const tail = easings.easeInOutCubic(
      clamp((elapsed - ERASE_START) / (LOOP_BEATS - ERASE_START)),
    );
    const tailBeat = tail * PETALS_END;
    const kick = elapsed > PETALS_END ? Math.exp(-getCycle(beat) * 5) * params.pulse : 0;
    const scalePoint = ([x, y]: Point): Point => [
      CENTER[0] + (x - CENTER[0]) * (1 + kick),
      CENTER[1] + (y - CENTER[1]) * (1 + kick),
    ];
    const points = flowerPath
      .filter(({ beat: at }) => at <= head && at >= tailBeat)
      .map(({ point }) => scalePoint(point));
    const ink = createInk();
    addInkPath(ink, points);
    const pen = points.at(-1);
    if (pen && head < PETALS_END) {
      addInkDot(ink, pen, 0.8);
    }
    drawInk(image, ink, params.ink, params.paper);
  },
});
