import { z } from "zod";
import { defineEffect } from "../effect.ts";
import type { Color, RgbaImage } from "../frame.ts";
import { HEIGHT, WIDTH } from "../frame.ts";
import { createRandom, hashSeed } from "../random.ts";

const BAR_COUNT = 7;
const TOP_HEIGHT = 43;
const MIDDLE_HEIGHT = 5;
const BLACK: Color = [0, 0, 0];

const TOP_COLORS: readonly Color[] = [
  [200, 200, 200],
  [210, 200, 0],
  [0, 200, 210],
  [0, 210, 40],
  [210, 0, 200],
  [220, 10, 20],
  [20, 30, 230],
];

const MIDDLE_COLORS: readonly Color[] = [
  [20, 30, 230],
  BLACK,
  [210, 0, 200],
  BLACK,
  [0, 200, 210],
  BLACK,
  [200, 200, 200],
];

const BOTTOM_COLORS: readonly { end: number; color: Color }[] = [
  { end: 1.25, color: [0, 40, 90] },
  { end: 2.5, color: [255, 255, 255] },
  { end: 3.75, color: [60, 0, 120] },
  { end: 5, color: BLACK },
  { end: 5.33, color: BLACK },
  { end: 5.67, color: [14, 14, 14] },
  { end: 6, color: [28, 28, 28] },
  { end: 7, color: BLACK },
];

function getBarColor(x: number, y: number): Color {
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) {
    return BLACK;
  }
  const bar = (x * BAR_COUNT) / WIDTH;
  if (y < TOP_HEIGHT) {
    return TOP_COLORS[Math.floor(bar)] ?? BLACK;
  }
  if (y < TOP_HEIGHT + MIDDLE_HEIGHT) {
    return MIDDLE_COLORS[Math.floor(bar)] ?? BLACK;
  }
  return BOTTOM_COLORS.find(({ end }) => bar < end)?.color ?? BLACK;
}

function getSmoothNoise(seed: number, position: number): number {
  const index = Math.floor(position);
  const fraction = position - index;
  const eased = fraction * fraction * (3 - 2 * fraction);
  const from = createRandom(hashSeed(seed, index))();
  const to = createRandom(hashSeed(seed, index + 1))();
  return from + (to - from) * eased;
}

type Drip = { x: number; width: number; depth: number };

function getDrips(random: () => number, count: number, minWidth: number, maxWidth: number): Drip[] {
  return Array.from({ length: count }, () => ({
    x: random() * WIDTH,
    width: minWidth + random() * (maxWidth - minWidth),
    depth: 0.4 + random() * 0.6,
  }));
}

function getDripAmount(drips: readonly Drip[], x: number): number {
  let amount = 0;
  for (const drip of drips) {
    const distance = (x - drip.x) / drip.width;
    amount = Math.max(amount, drip.depth * Math.exp(-distance * distance));
  }
  return amount;
}

type MeltProfile = { flow: Float32Array; drain: Float32Array };

function getMeltProfile(seed: number): MeltProfile {
  const random = createRandom(hashSeed(seed, 1));
  const flowDrips = getDrips(random, 14, 0.7, 2);
  const streaks = getDrips(random, 10, 0.4, 1);
  const flow = new Float32Array(WIDTH);
  const drain = new Float32Array(WIDTH);
  for (let x = 0; x < WIDTH; x++) {
    flow[x] = 0.15 + 0.25 * getSmoothNoise(seed, x / 7) + 0.75 * getDripAmount(flowDrips, x);
    drain[x] = 0.75 + 0.25 * getSmoothNoise(seed + 1, x / 10) - 0.55 * getDripAmount(streaks, x);
  }
  return { flow, drain };
}

const meltProfiles = new Map<number, MeltProfile>();

function getCachedMeltProfile(seed: number): MeltProfile {
  let profile = meltProfiles.get(seed);
  if (!profile) {
    profile = getMeltProfile(seed);
    meltProfiles.set(seed, profile);
  }
  return profile;
}

type Tear = { top: number; bottom: number; shift: number };

function getTears(step: number, count: number, maxShift: number): Tear[] {
  const random = createRandom(hashSeed(step, 2));
  return Array.from({ length: count }, () => {
    const top = Math.floor(random() * HEIGHT);
    return {
      top,
      bottom: top + 1 + Math.floor(random() * 3),
      shift: Math.round((random() * 2 - 1) * maxShift),
    };
  });
}

function getRowShift(tears: readonly Tear[], y: number): number {
  let shift = 0;
  for (const tear of tears) {
    if (y >= tear.top && y < tear.bottom) {
      shift += tear.shift;
    }
  }
  return shift;
}

export const smpteBars = defineEffect({
  id: "smpte-bars",
  name: "SMPTE bars",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    melt: z.number().min(0).max(1).default(0),
    glitch: z.number().min(0).max(1).default(0.2),
    scanlines: z.number().min(0).max(1).default(0.12),
    hum: z.number().min(0).max(1).default(0.1),
    seed: z.number().int().min(0).max(999).default(7),
  }),
  render(image: RgbaImage, { params, beat, progress }) {
    const melt = params.melt;
    const profile = getCachedMeltProfile(params.seed);
    const flow = 26 * Math.min(1, melt / 0.5) ** 1.2;
    const drain = Math.max(0, (melt - 0.45) / 0.55);
    const drop = 150 * drain ** 1.8;
    const stretch = 1 + 0.6 * drain;
    const sway = 2.5 * melt ** 1.5;
    const step = Math.floor(beat * 4);
    const beatPhase = beat - Math.floor(beat);
    const tearChance = params.glitch * (0.12 + 0.3 * melt);
    const hasTears = createRandom(hashSeed(step, params.seed, 3))() < tearChance;
    const tears = hasTears ? getTears(step, 1 + Math.floor(melt * 3), 2 + melt * 6) : [];
    const chroma = Math.round(params.glitch * melt * 2 * (1 - beatPhase));
    const humCenter = (progress * HEIGHT * 1.5) % (HEIGHT * 1.5);
    const fade = 1 - Math.max(0, (melt - 0.85) / 0.15);

    for (let y = 0; y < HEIGHT; y++) {
      const rowShift = getRowShift(tears, y);
      const scanline = y % 2 === 1 ? 1 - params.scanlines : 1;
      const humDistance = (y - humCenter) / 10;
      const humLight = 1 + params.hum * Math.exp(-humDistance * humDistance);
      const swayShift = sway * Math.sin(y * 0.21 + beat * 0.8);
      for (let x = 0; x < WIDTH; x++) {
        const meltedY = Math.floor((y - drop * (profile.drain[x] ?? 1)) / stretch);
        const flowedY = Math.floor(meltedY - flow * (profile.flow[x] ?? 0));
        const sourceY = flowedY >= 0 && flowedY < TOP_HEIGHT ? flowedY : meltedY;
        const sourceX = Math.round(x + rowShift + swayShift * (y / HEIGHT));
        const wrappedX = ((sourceX % WIDTH) + WIDTH) % WIDTH;
        const red = getBarColor((wrappedX + chroma + WIDTH) % WIDTH, sourceY)[0];
        const [, green] = getBarColor(wrappedX, sourceY);
        const blue = getBarColor((wrappedX - chroma + WIDTH) % WIDTH, sourceY)[2];
        const light = scanline * humLight * fade;
        const index = (y * WIDTH + x) * 4;
        image[index] = red * light;
        image[index + 1] = green * light;
        image[index + 2] = blue * light;
        image[index + 3] = 255;
      }
    }
  },
});
