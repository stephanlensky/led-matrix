import { z } from "zod";
import { FRESH_BLOOD_COLOR, colorSchema, parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import { HEIGHT, WIDTH, setRgbaPixel } from "../../frame.ts";
import { getScaledColor } from "./shared.ts";

const HEAD_X = WIDTH - 9;
const BASELINE = 38;
const SUBSAMPLES = 6;
const GRID = 8;

const WAVES = [
  { at: 0.12, width: 0.045, height: 0.14 },
  { at: 0.3, width: 0.02, height: -0.18 },
  { at: 0.36, width: 0.025, height: 1 },
  { at: 0.42, width: 0.025, height: -0.35 },
  { at: 0.72, width: 0.07, height: 0.28 },
] as const;

function getWave(phase: number): number {
  return WAVES.reduce(
    (sum, wave) => sum + wave.height * Math.exp(-(((phase - wave.at) / wave.width) ** 2)),
    0,
  );
}

export const bloodHeartbeat = defineEffect({
  id: "blood-heartbeat",
  name: "Heartbeat monitor",
  kind: "pixel",
  params: z.object({
    color: colorSchema.default(FRESH_BLOOD_COLOR),
    interval: z.number().min(0.25).max(8).default(1),
    previousInterval: z.number().min(0.25).max(8).optional(),
    flatline: z.boolean().default(false),
    beatsPerScreen: z.number().min(1).max(16).default(4),
    amplitude: z.number().min(4).max(30).default(20),
    glow: z.number().min(0).max(1).default(0.3),
    background: z.boolean().default(false),
  }),
  render(image, { params, beat, cycle }) {
    const color = parseColor(params.color);
    const pixelsPerBeat = WIDTH / params.beatsPerScreen;
    const isFirstCycle = cycle === 0;
    const getInterval = (time: number) =>
      time < 0 && isFirstCycle ? (params.previousInterval ?? params.interval) : params.interval;
    const getValue = (time: number) => {
      if (params.flatline && (time >= 0 || !isFirstCycle)) {
        return 0;
      }
      const interval = getInterval(time);
      const start = Math.floor(time / interval) * interval;
      const duration = Math.min(0.5, interval * 0.8);
      const phase = (time - start) / duration;
      return phase < 1 ? getWave(phase) : 0;
    };

    const interval = getInterval(beat);
    const sinceBeat = beat - Math.floor(beat / interval) * interval;
    const isFlat = params.flatline;
    const glow = isFlat
      ? 0
      : params.glow * Math.min(1.5, Math.sqrt(1 / interval)) * Math.exp(-sinceBeat * 6);
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const isGrid = x % GRID === 0 || y % GRID === 0;
        const shade = params.background
          ? (isGrid ? 0.07 : 0.015) * (isFlat ? 0.5 : 1) + glow * 0.35
          : 0;
        setRgbaPixel(image, x, y, getScaledColor(color, shade));
      }
    }

    const maxAge = HEAD_X / pixelsPerBeat;
    for (let x = 0; x <= HEAD_X; x++) {
      const age = (HEAD_X - x) / pixelsPerBeat;
      let top = Number.POSITIVE_INFINITY;
      let bottom = Number.NEGATIVE_INFINITY;
      for (let sample = 0; sample <= SUBSAMPLES; sample++) {
        const time = beat - age - sample / SUBSAMPLES / pixelsPerBeat;
        const y = BASELINE - getValue(time) * params.amplitude;
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
      const fade = 1 - 0.75 * (age / maxAge);
      for (let y = Math.round(top); y <= Math.round(bottom); y++) {
        setRgbaPixel(image, x, y, getScaledColor(color, fade * 1.2));
      }
      setRgbaPixel(image, x, Math.round(top) - 1, getScaledColor(color, fade * 0.3));
      setRgbaPixel(image, x, Math.round(bottom) + 1, getScaledColor(color, fade * 0.3));
    }
    const headY = Math.round(BASELINE - getValue(beat) * params.amplitude);
    for (let offsetY = -1; offsetY <= 1; offsetY++) {
      for (let offsetX = -1; offsetX <= 1; offsetX++) {
        const isCenter = offsetX === 0 && offsetY === 0;
        setRgbaPixel(
          image,
          HEAD_X + offsetX,
          headY + offsetY,
          isCenter ? [255, 220, 220] : getScaledColor(color, 1.3),
        );
      }
    }
  },
});
