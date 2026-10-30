import { z } from "zod";
import { colorSchema, getShiftedHue, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { type Color, HEIGHT, type RgbaImage, WIDTH, fillRgbaImage } from "../frame.ts";
import { easings } from "../keyframes.ts";
import { createRandom, getRandomBetween, hashSeed } from "../random.ts";
import { TAU, clamp, getSpan } from "./cat-duo.ts";
import { getCycle } from "./cat-dance.ts";
import { mix, scale } from "./cat-model.ts";
import { drawHeart, getHeartSize } from "./heart.ts";
import {
  type Point,
  addDot,
  addGlow,
  addHeart,
  addHeartOutline,
  addLine,
  addPixel,
  addSprite,
  getHeartHomes,
  getHeartMask,
  getHeartPoint,
  getHitSeed,
  getPlacedPoint,
} from "./heart-curve.ts";
import { HEART_SEED, drawSparkles } from "./heart-particles.ts";
import { getBeatKick } from "./heart-pulse.ts";

const WHITE: Color = [255, 255, 255];
const BLACK: Color = [0, 0, 0];
const EMBER: Color = [255, 190, 110];
const TRACE_SEED = hashSeed(HEART_SEED, 0xa1);
const CONSTELLATION_SEED = hashSeed(HEART_SEED, 0xa2);
const DUST_SEED = hashSeed(HEART_SEED, 0xa3);

const TRACE_END = 0.62;
const SPARK_LIFE = 1.6;

function addSparkBurst(
  image: RgbaImage,
  [x, y]: Point,
  age: number,
  colors: readonly Color[],
  { count, speed, seed }: { count: number; speed: number; seed: number },
): void {
  if (age < 0 || age >= SPARK_LIFE) {
    return;
  }
  const random = createRandom(seed);
  for (let spark = 0; spark < count; spark++) {
    const angle = random() * TAU;
    const velocity = speed * getRandomBetween(random, 0.4, 1);
    const travel = velocity * easings.easeOutCubic(clamp(age / SPARK_LIFE));
    const fall = 3 * age * age;
    const color = colors[spark % colors.length] ?? WHITE;
    addDot(
      image,
      x + Math.cos(angle) * travel,
      y + Math.sin(angle) * travel + fall,
      mix(WHITE, color, clamp(age * 3)),
      (1 - age / SPARK_LIFE) ** 1.5,
    );
  }
}

export const heartTrace = defineEffect({
  id: "heart-trace",
  name: "Heart trace",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default("#ff2a6d"),
    beats: z.number().min(1).max(32).default(8),
    size: z.number().min(10).max(62).default(46),
    y: z.number().min(0).max(64).default(33),
    tail: z.number().min(0.05).max(1).default(0.3),
    sparkles: z.boolean().default(true),
  }),
  render(image, { params, beat }) {
    fillRgbaImage(image, BLACK);
    const color = parseColor(params.color);
    const phase = getCycle(beat / params.beats);
    const since = (phase - TRACE_END) * params.beats;
    const head = 0.5 * easings.easeInOutSine(clamp(phase / TRACE_END));
    const fade = easings.easeInQuad(getSpan(phase, TRACE_END, 0.96));
    const flash = since >= 0 ? Math.exp(-since * 2) : 0;
    const placement = { x: WIDTH / 2, y: params.y, size: params.size };
    const tail = Math.max(0.01, 0.5 * params.tail);
    addHeartOutline(image, {
      ...placement,
      color: mix(color, WHITE, 0.1),
      getAmount: (position) => {
        if (since >= 0) {
          return (0.4 + 0.6 * flash) * (1 - fade);
        }
        const along = Math.min(position, 1 - position);
        return along > head ? 0 : 0.4 + 0.6 * Math.exp(((along - head) / tail) * 3);
      },
    });
    if (since >= 0) {
      addHeartOutline(image, { ...placement, color: WHITE, amount: 0.6 * flash });
      const tip = getPlacedPoint(getHeartPoint(0.5), placement);
      addGlow(image, tip[0], tip[1], WHITE, flash, 5);
      addSparkBurst(image, tip, since, [color, mix(color, WHITE, 0.5)], {
        count: 16,
        speed: 14,
        seed: getHitSeed(TRACE_SEED, Math.floor(beat / params.beats) * params.beats),
      });
    } else {
      for (const position of [head, 1 - head]) {
        const [x, y] = getPlacedPoint(getHeartPoint(position), placement);
        addGlow(image, x, y, color, 0.7, 4);
        addGlow(image, x, y, WHITE, 1, 2.2);
      }
    }
    if (params.sparkles) {
      drawSparkles(image, beat / 2, [mix(color, WHITE, 0.4)], 0.5, { count: 6 });
    }
  },
});

function addStar(image: RgbaImage, [x, y]: Point, color: Color, amount: number): void {
  const [px, py] = [Math.floor(x), Math.floor(y)];
  addPixel(image, px, py, WHITE, amount);
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    addPixel(image, px + dx, py + dy, color, amount * 0.45);
  }
}

export const heartConstellation = defineEffect({
  id: "heart-constellation",
  name: "Heart constellation",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default("#ff2a6d"),
    beats: z.number().min(2).max(32).default(16),
    stars: z.number().int().min(0).max(80).default(36),
    points: z.number().int().min(3).max(12).default(7),
    size: z.number().min(16).max(62).default(48),
    y: z.number().min(0).max(64).default(33),
  }),
  render(image, { params, beat }) {
    fillRgbaImage(image, BLACK);
    const color = parseColor(params.color);
    const sky = createRandom(CONSTELLATION_SEED);
    for (let star = 0; star < params.stars; star++) {
      const x = Math.floor(sky() * WIDTH);
      const y = Math.floor(sky() * HEIGHT);
      const rate = getRandomBetween(sky, 0.15, 0.4);
      const twinkle = 0.5 + 0.5 * Math.sin(beat * rate * TAU + sky() * TAU);
      const tone = mix(WHITE, color, sky() * 0.5);
      addPixel(image, x, y, tone, 0.12 + 0.6 * twinkle ** 4);
    }
    const phase = getCycle(beat / params.beats);
    const cycleStart = Math.floor(beat / params.beats) * params.beats;
    const random = createRandom(getHitSeed(CONSTELLATION_SEED, cycleStart));
    const placement = { x: WIDTH / 2, y: params.y, size: params.size };
    const count = params.points * 2;
    const points = Array.from({ length: count }, (_, index): Point => {
      const isAnchor = index % params.points === 0;
      const shift = isAnchor ? 0 : getRandomBetween(random, -0.25, 0.25) / count;
      const [x, y] = getPlacedPoint(getHeartPoint(index / count + shift), placement);
      const jitter = isAnchor ? 0 : 0.8;
      return [
        x + getRandomBetween(random, -jitter, jitter),
        y + getRandomBetween(random, -jitter, jitter),
      ];
    });
    const fade = 1 - easings.easeInQuad(getSpan(phase, 0.82, 1));
    const drawn = getSpan(phase, 0.12, 0.62) * count;
    const pulse = getSpan(phase, 0.62, 0.82) * count;
    const line = mix(color, WHITE, 0.15);
    for (const [index, start] of points.entries()) {
      const end = points[(index + 1) % count] ?? start;
      const progress = clamp(drawn - index);
      if (progress <= 0) {
        continue;
      }
      const tip: Point = [
        start[0] + (end[0] - start[0]) * progress,
        start[1] + (end[1] - start[1]) * progress,
      ];
      const glow = Math.exp(-Math.abs(pulse - index - 0.5) * 1.5) * (pulse > 0 ? 1 : 0);
      addLine(image, start, tip, line, (0.65 + 0.35 * glow) * fade);
      if (progress < 1) {
        addGlow(image, tip[0], tip[1], WHITE, 0.9, 2);
      }
    }
    for (const [index, point] of points.entries()) {
      const appear = getSpan(phase, (0.12 * index) / count, (0.12 * index) / count + 0.04);
      const twinkle = 0.75 + 0.25 * Math.sin(beat * 2 + index * 1.7);
      addStar(image, point, color, appear * twinkle * (0.35 + 0.65 * fade));
    }
    const shootAt = getRandomBetween(random, 0.15, 0.7) * params.beats;
    const shootAge = beat - cycleStart - shootAt;
    if (shootAge >= 0 && shootAge < 1) {
      const startX = getRandomBetween(random, 30, 70);
      const startY = getRandomBetween(random, -4, 12);
      for (let trail = 0; trail < 8; trail++) {
        const t = shootAge - trail * 0.025;
        if (t >= 0) {
          addDot(image, startX - t * 40, startY + t * 22, WHITE, (1 - shootAge) * (1 - trail / 8));
        }
      }
    }
  },
});

export const heartDust = defineEffect({
  id: "heart-dust",
  name: "Heart dust",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default("#ff2a6d"),
    beats: z.number().min(2).max(32).default(8),
    every: z.number().min(0.25).max(4).default(1),
    count: z.number().int().min(40).max(400).default(220),
    size: z.number().min(16).max(62).default(44),
    y: z.number().min(0).max(64).default(33),
  }),
  render(image, { params, beat }) {
    fillRgbaImage(image, BLACK);
    const color = parseColor(params.color);
    const phase = getCycle(beat / params.beats);
    const cycleStart = Math.floor(beat / params.beats) * params.beats;
    const { kick } = getBeatKick(beat, params.every);
    const homes = getHeartHomes(params.count, DUST_SEED, 0.4);
    const colors = [color, mix(color, WHITE, 0.35), getShiftedHue(color, 0.04)];
    const cycleSeed = getHitSeed(DUST_SEED, cycleStart);
    const breath = 1 + 0.03 * Math.sin(beat * 0.5);
    for (const [index, [hx, hy]] of homes.entries()) {
      const random = createRandom(hashSeed(cycleSeed, index));
      const angle = random() * TAU;
      const distance = getRandomBetween(random, 18, 48);
      const gather = easings.easeOutCubic(getSpan(phase, random() * 0.18, 0.3 + random() * 0.18));
      const leaveAt = 0.62 + random() * 0.16;
      const leave = getSpan(phase, leaveAt, leaveAt + 0.22);
      const push = 1 + 0.06 * kick * (1 - leave);
      const homeX = WIDTH / 2 + hx * params.size * breath * push;
      const homeY = params.y + hy * params.size * breath * push;
      const sway = Math.sin(leave * 5 + random() * TAU) * 5 * leave;
      const x = homeX + Math.cos(angle) * distance * (1 - gather) + sway;
      const y = homeY + Math.sin(angle) * distance * (1 - gather) - 20 * easings.easeInQuad(leave);
      const shimmer = 0.75 + 0.25 * Math.sin(beat * 3 + random() * TAU);
      const tone = mix(
        mix(colors[index % colors.length] ?? color, WHITE, 0.4 * kick),
        EMBER,
        leave * 0.6,
      );
      addDot(image, x, y, tone, clamp(gather * 2) * (1 - leave) * shimmer);
    }
  },
});

export const heartOrbit = defineEffect({
  id: "heart-orbit",
  name: "Heart orbit",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default("#ff2a6d"),
    partnerColor: colorSchema.default("#20e8ff"),
    beats: z.number().min(2).max(32).default(16),
    every: z.number().min(0.25).max(4).default(1),
    size: z.number().min(8).max(40).default(24),
    radius: z.number().min(0).max(24).default(16),
    sparkles: z.boolean().default(true),
  }),
  render(image, { params, beat }) {
    fillRgbaImage(image, BLACK);
    const turn = (beat / params.beats) * TAU;
    const distance = params.radius * (0.55 + 0.45 * Math.cos(2 * turn));
    const partners = [
      { color: parseColor(params.color), side: 0, offset: 0 },
      { color: parseColor(params.partnerColor), side: Math.PI, offset: params.every / 2 },
    ];
    for (const { color, side, offset } of partners) {
      const { kick } = getBeatKick(beat - offset, params.every);
      const angle = turn + side;
      addHeart(image, {
        x: WIDTH / 2 + Math.cos(angle) * distance,
        y: HEIGHT / 2 + Math.sin(angle) * distance * 0.7,
        size: params.size * (1 + 0.1 * kick),
        color: scale(mix(color, WHITE, 0.25 * kick), 0.6 + 0.15 * kick),
        outline: mix(color, WHITE, 0.45),
        angle: 0.2 * Math.sin(angle * 2),
      });
    }
    if (params.sparkles) {
      drawSparkles(
        image,
        beat / 2,
        partners.map(({ color }) => mix(color, WHITE, 0.4)),
        0.6,
        { count: 8, bottom: HEIGHT - 4 },
      );
    }
  },
});

export const heartHalo = defineEffect({
  id: "heart-halo",
  name: "Heart halo",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default("#ff2a6d"),
    every: z.number().min(0.25).max(4).default(1),
    rays: z.number().int().min(4).max(24).default(10),
    spin: z.number().min(-0.25).max(0.25).default(0.03),
    pulse: z.number().min(0).max(1).default(0.35),
    size: z.number().min(10).max(50).default(26),
    length: z.number().min(6).max(48).default(30),
    y: z.number().min(0).max(64).default(33),
  }),
  render(image, { params, beat }) {
    fillRgbaImage(image, BLACK);
    const color = parseColor(params.color);
    const { kick } = getBeatKick(beat, params.every);
    const boost = params.pulse * kick;
    const size = params.size * (1 + 0.08 * boost);
    const rotation = beat * params.spin * TAU;
    const ray = mix(color, WHITE, 0.35);
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const dx = x + 0.5 - WIDTH / 2;
        const dy = y + 0.5 - params.y;
        const outside = (getHeartSize(dx, dy) - size) / 2;
        if (outside <= 0.5) {
          continue;
        }
        const angle = Math.atan2(dy, dx) - rotation;
        const long = Math.max(0, Math.cos(params.rays * angle)) ** 18;
        const short = Math.max(0, Math.cos(params.rays * angle + Math.PI)) ** 28;
        const reach = params.length * (1 + 0.4 * boost);
        const falloff = (length: number): number => clamp(1 - outside / length) ** 1.6;
        const light = long * falloff(reach) + short * falloff(reach * 0.5) * 0.8;
        addPixel(image, x, y, ray, light * (0.55 + 0.45 * boost) * clamp(outside));
      }
    }
    drawSparkles(image, beat / 2, [mix(color, WHITE, 0.4)], 0.6, { count: 6 });
    drawHeart(image, {
      x: WIDTH / 2,
      y: params.y,
      size,
      color: mix(color, WHITE, 0.2 * boost),
      outline: mix(color, WHITE, 0.5 + 0.3 * boost),
    });
    drawHeart(image, {
      x: WIDTH / 2 - size * 0.24,
      y: params.y - size * 0.22,
      size: size * 0.16,
      color: mix(color, WHITE, 0.7),
      angle: -0.5,
    });
  },
});

const THREAD_STEPS = 160;

export const heartThread = defineEffect({
  id: "heart-thread",
  name: "Heart thread",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default("#ff2a6d"),
    beats: z.number().min(1).max(32).default(8),
    size: z.number().min(16).max(62).default(46),
    y: z.number().min(0).max(64).default(33),
  }),
  render(image, { params, beat }) {
    fillRgbaImage(image, BLACK);
    const color = parseColor(params.color);
    const phase = getCycle(beat / params.beats);
    const tie =
      phase < 0.5
        ? easings.easeInOutCubic(getSpan(phase, 0.08, 0.45))
        : 1 - easings.easeInOutCubic(getSpan(phase, 0.72, 0.98));
    const placement = { x: WIDTH / 2, y: params.y, size: params.size };
    const line = mix(color, WHITE, 0.15);
    const glintStep = Math.round(getCycle(beat / 4) * THREAD_STEPS);
    let previous: Point | undefined;
    for (let step = 0; step <= THREAD_STEPS; step++) {
      const along = step / THREAD_STEPS;
      const local = easings.easeInOutSine(clamp(tie * 1.6 - Math.abs(along - 0.5) * 1.2));
      const wave = Math.sin(along * TAU * 1.5 - beat * 0.8) * 4 * (1 - local);
      const loose: Point = [-3 + along * (WIDTH + 6), params.y + wave];
      const tied = getPlacedPoint(getHeartPoint(0.5 + along), placement);
      const point: Point = [
        loose[0] + (tied[0] - loose[0]) * local,
        loose[1] + (tied[1] - loose[1]) * local,
      ];
      if (previous) {
        addLine(image, previous, point, line, 0.9);
      }
      if (step === glintStep) {
        addGlow(image, point[0], point[1], WHITE, 0.9, 2.5);
      }
      previous = point;
    }
    const knot = phase >= 0.45 ? Math.exp(-(phase - 0.45) * params.beats * 2) : 0;
    if (knot > 0.01) {
      const [x, y] = getPlacedPoint(getHeartPoint(0.5), placement);
      addGlow(image, x, y, WHITE, knot, 5);
      addHeartOutline(image, { ...placement, color: WHITE, amount: 0.5 * knot });
    }
  },
});

const SNOW_SEED = hashSeed(HEART_SEED, 0xa4);
const SNOW_SPRITES = [
  ["#.#", "###", ".#."],
  [".#.#.", "#####", ".###.", "..#.."],
  [".##.##.", "#######", "#######", ".#####.", "..###..", "...#..."],
] as const;
const SNOW_FALL_BEATS = [16, 8, 4] as const;
const SNOW_LEVELS = [0.4, 0.7, 1] as const;

export const heartSnow = defineEffect({
  id: "heart-snow",
  name: "Heart snow",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default("#ff2a6d"),
    count: z.number().int().min(6).max(80).default(34),
    speed: z.number().int().min(1).max(4).default(1),
    every: z.number().min(0.25).max(4).default(1),
    pulse: z.number().min(0).max(1).default(0.3),
  }),
  render(image, { params, beat }) {
    fillRgbaImage(image, BLACK);
    const color = parseColor(params.color);
    const colors = [color, mix(color, WHITE, 0.4), getShiftedHue(color, 0.05)];
    const { kick } = getBeatKick(beat, params.every);
    for (let flake = 0; flake < params.count; flake++) {
      const random = createRandom(hashSeed(SNOW_SEED, flake));
      const layer = flake % 5 < 2 ? 0 : flake % 5 < 4 ? 1 : 2;
      const fall = (SNOW_FALL_BEATS[layer] ?? 4) / params.speed;
      const sprite = SNOW_SPRITES[layer] ?? SNOW_SPRITES[0];
      const y = -8 + getCycle(beat / fall + random()) * (HEIGHT + 16);
      const sway = Math.sin(beat * 0.6 * (1 + layer * 0.3) + random() * TAU) * (1 + layer);
      const x = random() * WIDTH + sway;
      const glow = layer === 2 ? params.pulse * kick : 0;
      const tone = mix(colors[flake % colors.length] ?? color, WHITE, glow * 0.6);
      addSprite(image, sprite, [x, y], tone, SNOW_LEVELS[layer] ?? 1);
    }
  },
});

const eclipseShadow = new Float32Array(WIDTH * HEIGHT);
const eclipseHeart = new Float32Array(WIDTH * HEIGHT);

export const heartEclipse = defineEffect({
  id: "heart-eclipse",
  name: "Heart eclipse",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default("#ff2a6d"),
    beats: z.number().min(4).max(32).default(16),
    size: z.number().min(16).max(56).default(38),
    y: z.number().min(0).max(64).default(33),
  }),
  render(image, { params, beat }) {
    fillRgbaImage(image, BLACK);
    const color = parseColor(params.color);
    const phase = getCycle(beat / params.beats);
    const travel = phase * 2 - 1;
    const shift = Math.sign(travel) * Math.abs(travel) ** 2.2 * params.size * 1.3;
    const cover = clamp(1 - Math.abs(shift) / params.size);
    const placement = { x: WIDTH / 2, y: params.y, size: params.size };
    getHeartMask(eclipseHeart, placement);
    getHeartMask(eclipseShadow, { ...placement, x: WIDTH / 2 + shift, size: params.size * 0.94 });
    const lit = mix(color, WHITE, 0.2 + 0.5 * cover ** 4);
    const ray = mix(color, WHITE, 0.5);
    const rotation = beat * 0.02 * TAU;
    const corona = cover ** 3;
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const pixel = y * WIDTH + x;
        const heart = eclipseHeart[pixel] ?? 0;
        if (heart > 0) {
          addPixel(image, x, y, lit, heart * (1 - (eclipseShadow[pixel] ?? 0)));
          continue;
        }
        if (corona < 0.01) {
          continue;
        }
        const dx = x + 0.5 - WIDTH / 2;
        const dy = y + 0.5 - params.y;
        const outside = (getHeartSize(dx, dy) - params.size) / 2;
        const angle = Math.atan2(dy, dx) - rotation;
        const beam =
          Math.max(0, Math.cos(7 * angle)) ** 12 +
          0.5 * Math.max(0, Math.cos(11 * angle + 1)) ** 16;
        const reach = 6 + 18 * corona;
        addPixel(
          image,
          x,
          y,
          ray,
          beam * corona * clamp(1 - outside / reach) ** 1.5 * clamp(outside),
        );
      }
    }
    const glint = Math.exp(-(((Math.abs(travel) - 0.2) / 0.05) ** 2));
    if (glint > 0.01) {
      const [x, y] = getPlacedPoint(getHeartPoint(travel > 0 ? 0.88 : 0.12), placement);
      addGlow(image, x, y, WHITE, glint * 1.3, 6);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        addLine(image, [x, y], [x + dx * 9 * glint, y + dy * 9 * glint], WHITE, glint);
      }
    }
  },
});

export const heartMandala = defineEffect({
  id: "heart-mandala",
  name: "Heart mandala",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default("#ff2a6d"),
    beats: z.number().min(4).max(32).default(16),
    petals: z.number().int().min(4).max(12).default(8),
    size: z.number().min(6).max(24).default(13),
    radius: z.number().min(6).max(24).default(12),
  }),
  render(image, { params, beat }) {
    fillRgbaImage(image, BLACK);
    const color = parseColor(params.color);
    const phase = getCycle(beat / params.beats);
    const fade = easings.easeInQuad(getSpan(phase, 0.82, 1));
    const spin = beat * 0.02 * TAU;
    const beam = getCycle(beat / 4) * TAU;
    const rings = [
      {
        radius: params.radius,
        size: params.size,
        turn: spin,
        isOutward: false,
        tone: color,
        start: 0,
      },
      {
        radius: params.radius * 1.9,
        size: params.size * 0.8,
        turn: -spin + Math.PI / params.petals,
        isOutward: true,
        tone: mix(getShiftedHue(color, 0.08), WHITE, 0.2),
        start: 0.22,
      },
    ];
    for (const ring of rings) {
      for (let petal = 0; petal < params.petals; petal++) {
        const angle = ring.turn + (petal / params.petals) * TAU;
        const appear = getSpan(
          phase,
          ring.start + (0.25 * petal) / params.petals,
          ring.start + (0.25 * (petal + 1)) / params.petals,
        );
        if (appear <= 0) {
          continue;
        }
        const gap = Math.abs(getCycle((angle - beam) / TAU + 0.5) - 0.5) * TAU;
        const highlight = Math.exp(-gap * gap * 3);
        addHeartOutline(image, {
          x: WIDTH / 2 + Math.cos(angle) * ring.radius,
          y: HEIGHT / 2 + Math.sin(angle) * ring.radius,
          size: ring.size * (1 - fade * 0.5),
          angle: angle + (ring.isOutward ? -Math.PI / 2 : Math.PI / 2),
          color: mix(ring.tone, WHITE, 0.5 * highlight),
          amount: (0.75 + 0.5 * highlight) * (1 - fade),
          getAmount: (position) => (position <= appear ? 1 : 0),
        });
      }
    }
    drawHeart(image, {
      x: WIDTH / 2,
      y: HEIGHT / 2,
      size: 7 + 1.5 * Math.sin((beat * Math.PI) / 2),
      color: mix(color, WHITE, 0.3),
      amount: clamp(phase * 8) * (1 - fade),
    });
  },
});

const NEON_SEED = hashSeed(HEART_SEED, 0xa5);
const NEON_SEGMENTS = 6;

export const heartNeon = defineEffect({
  id: "heart-neon",
  name: "Neon heart",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default("#ff2a6d"),
    innerColor: colorSchema.default("#20e8ff"),
    every: z.number().min(0.25).max(4).default(1),
    flicker: z.number().min(0).max(1).default(0.5),
    size: z.number().min(20).max(62).default(52),
    y: z.number().min(0).max(64).default(33),
  }),
  render(image, { params, beat }) {
    fillRgbaImage(image, BLACK);
    const color = parseColor(params.color);
    const inner = parseColor(params.innerColor);
    const { kick } = getBeatKick(beat, params.every);
    const stepSeed = getHitSeed(NEON_SEED, Math.floor(beat * 8) / 8);
    const getLevel = (tube: number, position: number): number => {
      const segment = Math.floor(position * NEON_SEGMENTS);
      const roll = createRandom(hashSeed(stepSeed, tube, segment))();
      return roll < params.flicker * 0.07 ? 0.08 : roll < params.flicker * 0.13 ? 0.5 : 1;
    };
    const tubes = [
      { tube: 0, size: params.size, tone: color, amount: 1 },
      { tube: 1, size: params.size * 0.5, tone: inner, amount: 0.35 + 0.65 * kick },
    ];
    for (const { tube, size, tone, amount } of tubes) {
      const placement = { x: WIDTH / 2, y: params.y, size };
      const getAmount = (position: number): number => getLevel(tube, position);
      addHeartOutline(image, { ...placement, color: tone, amount, width: 2, getAmount });
      addHeartOutline(image, {
        ...placement,
        size: size - 1,
        color: mix(tone, WHITE, 0.7),
        amount: amount * 0.55,
        getAmount,
      });
    }
  },
});
