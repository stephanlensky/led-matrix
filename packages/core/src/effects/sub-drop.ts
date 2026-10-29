import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { HEIGHT, WIDTH, setRgbaPixel } from "../frame.ts";
import { getNoise, getSmoothNoise, getSmoothNoise2d } from "./blood/shared.ts";

const TAU = Math.PI * 2;
const ATTACK = 0.015;
const ENVELOPE_SEED = 0x50b0;
const OVERTONE_SEED = 0x50b1;
const SPEED_SEED = 0x50b2;
const JITTER_SEED = 0x50b3;

function getAmplitude(progress: number, decay: number): number {
  if (progress < 0) {
    return 0;
  }
  const attack = Math.min(1, progress / ATTACK);
  return attack * (1 - Math.min(1, progress)) ** decay;
}

export const subDrop = defineEffect({
  id: "sub-drop",
  name: "Sub drop",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default("#ff1030"),
    height: z.number().min(0).max(31).default(28),
    decay: z.number().min(0.5).max(4).default(1.6),
    startWaves: z.number().min(0.25).max(8).default(3),
    endWaves: z.number().min(0.25).max(8).default(0.75),
    speed: z.number().min(0).max(16).default(6),
    chaos: z.number().min(0).max(1).default(0.6),
    lag: z.number().min(0).max(1).default(0.04),
    thickness: z.number().int().min(1).max(3).default(1),
  }),
  render(image, { params, beat, progress }) {
    const color = parseColor(params.color);
    const waves = params.startWaves * (params.endWaves / params.startWaves) ** progress;
    const drift = beat * params.speed + params.chaos * 2 * getSmoothNoise(SPEED_SEED, beat * 2);
    const overtone = params.chaos * 0.4 * getSmoothNoise(OVERTONE_SEED, beat * 4);
    const overtoneShift = getSmoothNoise(OVERTONE_SEED + 1, beat * 3);
    const jitterStep = Math.floor(beat * 24);
    let previousY: number | undefined;
    for (let x = 0; x < WIDTH; x++) {
      const distance = Math.abs(x + 0.5 - WIDTH / 2) / (WIDTH / 2);
      const amplitude = getAmplitude(progress - distance * params.lag, params.decay);
      const phase = ((x + 0.5) / WIDTH - 0.5) * waves - drift;
      const swell = 1 + params.chaos * (getSmoothNoise2d(ENVELOPE_SEED, x / 12, beat * 6) - 0.5);
      const jitter = params.chaos * 3 * (getNoise(JITTER_SEED, x, jitterStep) - 0.5);
      const wave =
        swell * Math.sin(TAU * phase) + overtone * Math.sin(TAU * (phase * 3 + overtoneShift));
      const offset = amplitude * (params.height * wave + jitter);
      const y = Math.min(HEIGHT - 1, Math.max(0, Math.round(HEIGHT / 2 - 0.5 - offset)));
      const top = Math.min(y, previousY ?? y);
      const bottom = Math.max(y, previousY ?? y);
      for (let row = top; row <= bottom + params.thickness - 1; row++) {
        setRgbaPixel(image, x, row, color);
      }
      previousY = y;
    }
  },
});
