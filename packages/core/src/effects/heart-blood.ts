import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { type Color, HEIGHT, type RgbaImage, WIDTH, setRgbaPixel } from "../frame.ts";
import { easings } from "../keyframes.ts";
import { createRandom, getRandomBetween, hashSeed } from "../random.ts";
import {
  DRIED_COLOR,
  type Point,
  drawDot,
  drawDrip,
  drawStreak,
  fillImage,
  getBallisticPosition,
  getNoise,
  getSmoothNoise,
  getSmoothNoise2d,
  getSplatShape,
} from "./blood/shared.ts";
import { TAU, clamp } from "./cat-duo.ts";
import { getCycle } from "./cat-dance.ts";
import { mix, scale } from "./cat-model.ts";
import { blendPixel, drawHeart, getHeartSize } from "./heart.ts";
import { HEART_SEED } from "./heart-particles.ts";
import { getLubDub, getTrace } from "./heart-patterns.ts";

const WHITE: Color = [255, 255, 255];
const BLEED_SEED = hashSeed(HEART_SEED, 0xb1);
const MELT_SEED = hashSeed(HEART_SEED, 0xb2);
const ARROW_SEED = hashSeed(HEART_SEED, 0xb3);
const RAIN_SEED = hashSeed(HEART_SEED, 0xb4);
const BURST_SEED = hashSeed(HEART_SEED, 0xb5);
const FLATLINE_SEED = hashSeed(HEART_SEED, 0xb6);
const GRAVITY = 160;
const HEART_HEIGHT = 0.99;

const colorParams = {
  color: colorSchema.default("#ff2a6d"),
  bloodColor: colorSchema.default("#c00014"),
  backgroundColor: colorSchema.default("#100003"),
};

function getHeartCover(dx: number, dy: number, size: number): number {
  return clamp((size - getHeartSize(dx, dy)) * 0.6 + 0.5);
}

function getPool(x: number, depth: number, beat: number, kick: number): number {
  const ripple = Math.sin(x * 0.4 + beat * Math.PI * 0.5) * (0.5 + kick);
  return HEIGHT - depth - Math.round(getSmoothNoise(BLEED_SEED, x / 7) * 2 + ripple);
}

function drawPool(image: RgbaImage, color: Color, depth: number, beat: number, kick = 0): void {
  if (depth <= 0) {
    return;
  }
  for (let x = 0; x < WIDTH; x++) {
    const top = getPool(x, depth, beat, kick);
    for (let y = top; y < HEIGHT; y++) {
      const shade = (y === top ? 0.9 : 0.5) + 0.2 * getNoise(BLEED_SEED, x, y);
      setRgbaPixel(image, x, y, scale(color, shade));
    }
  }
}

function drawSplat(
  image: RgbaImage,
  [x, y]: Point,
  radius: number,
  squash: number,
  color: Color,
  amount: number,
  seed: number,
): void {
  const shape = getSplatShape(createRandom(seed), radius);
  const reach = Math.ceil(radius * 3);
  for (let py = Math.floor(y - reach); py <= y + reach; py++) {
    for (let px = Math.floor(x - reach); px <= x + reach; px++) {
      const dx = px + 0.5 - x;
      const dy = (py + 0.5 - y) / squash;
      const distance = Math.hypot(dx, dy);
      const edge = shape(Math.atan2(dy, dx)) - distance;
      if (edge > 0) {
        blendPixel(image, px, py, scale(color, 0.75 + 0.25 * clamp(edge / 2)), amount);
      }
    }
  }
}

function drawSpray(
  image: RgbaImage,
  origin: Point,
  age: number,
  color: Color,
  { count, seed, angle, spread }: { count: number; seed: number; angle: number; spread: number },
): void {
  const random = createRandom(seed);
  for (let particle = 0; particle < count; particle++) {
    const direction = angle + getRandomBetween(random, -spread, spread);
    const speed = getRandomBetween(random, 30, 75);
    const delay = random() * 0.12;
    const size = random() < 0.25 ? 2 : 1;
    const shade = getRandomBetween(random, 0.8, 1.3);
    const time = age - delay;
    if (time < 0) {
      continue;
    }
    const velocity: Point = [Math.cos(direction) * speed, Math.sin(direction) * speed];
    const head = getBallisticPosition(origin, velocity, GRAVITY, time);
    if (head[1] > HEIGHT + 2) {
      continue;
    }
    const tail = getBallisticPosition(origin, velocity, GRAVITY, Math.max(0, time - 0.05));
    drawStreak(image, tail, head, scale(color, shade));
    drawDot(image, head, size, scale(color, shade));
  }
}

function getHeartBottoms(centerY: number, size: number): number[] {
  return Array.from({ length: WIDTH }, (_, x) => {
    for (let y = HEIGHT - 1; y >= 0; y--) {
      if (getHeartCover(x + 0.5 - WIDTH / 2, y + 0.5 - centerY, size) >= 0.5) {
        return y;
      }
    }
    return -1;
  });
}

export const heartBleed = defineEffect({
  id: "heart-bleed",
  name: "Bleeding heart",
  kind: "pixel",
  params: z.object({
    ...colorParams,
    every: z.number().min(0.25).max(4).default(1),
    size: z.number().min(10).max(56).default(36),
    stain: z.number().min(0).max(1).default(0.55),
    drips: z.number().int().min(0).max(12).default(6),
    pool: z.number().int().min(0).max(12).default(4),
    skip: z.number().int().min(0).max(8).default(4),
    y: z.number().min(0).max(64).default(28),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const blood = parseColor(params.bloodColor);
    const pulse = beat / params.every;
    const index = Math.floor(pulse);
    const isSkipped = params.skip > 0 && ((index % params.skip) + params.skip) % params.skip === 0;
    const flutter = isSkipped ? 0.25 * Math.abs(Math.sin(getCycle(pulse) * TAU * 3)) : 1;
    const thump = getLubDub(getCycle(pulse)) * flutter;
    const size = params.size * (1 + 0.12 * thump);
    const top = params.y - (size * HEART_HEIGHT) / 2;
    const height = size * HEART_HEIGHT;
    fillImage(image, scale(parseColor(params.backgroundColor), 1 + 0.5 * thump));
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const dx = x + 0.5 - WIDTH / 2;
        const dy = y + 0.5 - params.y;
        const cover = getHeartCover(dx, dy, size);
        if (cover <= 0) {
          continue;
        }
        const level = (y - top) / height;
        const seep = 1 - params.stain + (getSmoothNoise(BLEED_SEED, x / 2.5) - 0.5) * 0.35;
        const stain = clamp((level - seep) * 4);
        const rim = clamp((size - getHeartSize(dx, dy)) / 3);
        const tone = mix(mix(color, WHITE, 0.25 * thump), scale(blood, 0.9 + 0.3 * thump), stain);
        blendPixel(image, x, y, scale(tone, 0.6 + 0.4 * rim), cover);
      }
    }
    drawHeart(image, {
      x: WIDTH / 2 - size * 0.24,
      y: params.y - size * 0.22,
      size: size * 0.14,
      color: mix(color, WHITE, 0.6),
      amount: 0.8,
      angle: -0.5,
    });
    const bottoms = getHeartBottoms(params.y, params.size);
    for (let drip = 0; drip < params.drips; drip++) {
      const random = createRandom(hashSeed(BLEED_SEED, drip));
      const spread = params.size * 0.32;
      const x = Math.round(WIDTH / 2 + ((drip + random()) / params.drips - 0.5) * 2 * spread);
      const bottom = bottoms[x] ?? -1;
      if (bottom < 0) {
        continue;
      }
      drawDrip(image, {
        x,
        top: bottom + 1,
        width: random() < 0.35 ? 2 : 1,
        length: Math.round(getRandomBetween(random, 3, 8)),
        cycle: getCycle(beat / (random() < 0.5 ? 4 : 8) + random()),
        trail: 0.4,
        color: blood,
      });
    }
    drawPool(image, blood, params.pool, beat, thump);
  },
});

const CRACK_DEPTH = 2.5;

function getCrack(y: number): number {
  const step = Math.floor(y / 3);
  const fraction = y / 3 - step;
  const corners = [0, 1, -0.6, 0.8, -1, 0.5, -0.4, 1, -0.8, 0.3, -0.5, 0.9, -1, 0.4];
  const from = corners[((step % corners.length) + corners.length) % corners.length] ?? 0;
  const to = corners[(((step + 1) % corners.length) + corners.length) % corners.length] ?? 0;
  return (from + (to - from) * fraction) * CRACK_DEPTH;
}

export const heartBreak = defineEffect({
  id: "heart-break",
  name: "Heartbreak",
  kind: "pixel",
  params: z.object({
    ...colorParams,
    beats: z.number().int().min(4).max(32).default(8),
    size: z.number().min(16).max(56).default(40),
    gap: z.number().min(0).max(16).default(7),
    y: z.number().min(0).max(64).default(30),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const blood = parseColor(params.bloodColor);
    const background = parseColor(params.backgroundColor);
    const time = getCycle(beat / params.beats) * params.beats;
    const crackAt = params.beats / 2;
    const since = time - crackAt;
    const crack = clamp(since / 0.25);
    const close = easings.easeInCubic(clamp((time - (params.beats - 0.6)) / 0.6));
    const open = easings.easeOutCubic(clamp((since - 0.25) / 1.5)) * (1 - close);
    const separation = open * params.gap;
    const tilt = open * 0.18;
    const drop = open * 3;
    const thump = since < 0 ? getLubDub(getCycle(time)) : 0;
    const flash = since >= 0 ? Math.exp(-since * 8) * (1 - close) : 0;
    const size = params.size * (1 + 0.1 * thump);
    const top = params.y - (size * HEART_HEIGHT) / 2;
    const crackBottom = top + size * HEART_HEIGHT * crack;
    const pivot: Point = [WIDTH / 2, params.y + (size * HEART_HEIGHT) / 2];
    const sorrow = open * 0.45;
    fillImage(image, mix(background, blood, 0.4 * flash));
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        for (const side of [-1, 1] as const) {
          const offsetX = x + 0.5 - pivot[0] - side * separation;
          const offsetY = y + 0.5 - pivot[1] - drop;
          const angle = -side * tilt;
          const localX = offsetX * Math.cos(angle) - offsetY * Math.sin(angle);
          const localY = offsetX * Math.sin(angle) + offsetY * Math.cos(angle) + pivot[1];
          const dx = localX;
          const dy = localY - params.y;
          const cover = getHeartCover(dx, dy, size);
          if (cover <= 0) {
            continue;
          }
          const fromCrack = (localX - getCrack(localY)) * side;
          const isCracked = localY <= crackBottom && crack > 0;
          if (isCracked && fromCrack < 0) {
            continue;
          }
          if (!isCracked && side === 1 && localX < 0) {
            continue;
          }
          if (!isCracked && side === -1 && localX >= 0) {
            continue;
          }
          const rim = clamp((size - getHeartSize(dx, dy)) / 3);
          const base = mix(mix(color, WHITE, 0.25 * thump + 0.5 * flash), blood, sorrow);
          let tone = scale(base, 0.6 + 0.4 * rim);
          if (isCracked && fromCrack < 1.2) {
            tone = open > 0.05 ? blood : scale(blood, 0.5);
          }
          blendPixel(image, x, y, tone, cover);
        }
      }
    }
    if (open <= 0.05) {
      return;
    }
    for (let drip = 0; drip < 4; drip++) {
      const side = drip % 2 === 0 ? -1 : 1;
      const localY = top + size * HEART_HEIGHT * (0.35 + drip * 0.14);
      const localX = getCrack(localY) + side;
      const offsetY = localY - pivot[1];
      const angle = side * tilt;
      const x = localX * Math.cos(angle) - offsetY * Math.sin(angle) + pivot[0] + side * separation;
      const y = localX * Math.sin(angle) + offsetY * Math.cos(angle) + pivot[1] + drop;
      const cycle = (since - 0.6 - drip * 0.35) / 2.4;
      if (cycle < 0 || cycle >= 1) {
        continue;
      }
      drawDrip(image, {
        x: Math.round(x),
        top: Math.round(y),
        width: 1,
        length: 5 + drip,
        cycle,
        trail: 0.4,
        color: blood,
      });
    }
  },
});

export const heartMelt = defineEffect({
  id: "heart-melt",
  name: "Melting heart",
  kind: "pixel",
  params: z.object({
    ...colorParams,
    every: z.number().min(0.25).max(4).default(1),
    speed: z.number().min(0).max(2).default(0.5),
    ratio: z.number().min(1.3).max(3).default(1.7),
    melt: z.number().min(0).max(1).default(0.7),
    y: z.number().min(0).max(64).default(24),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const blood = parseColor(params.bloodColor);
    const background = parseColor(params.backgroundColor);
    const pulse = beat / params.every;
    const kick = Math.exp(-getCycle(pulse) * 6);
    const step = Math.floor(pulse) + easings.easeOutCubic(getCycle(pulse));
    const phase = step * params.speed * params.every;
    const logRatio = Math.log(params.ratio);
    for (let x = 0; x < WIDTH; x++) {
      const strand = getSmoothNoise(MELT_SEED, x / 2.2) * 0.7 + getNoise(MELT_SEED, x) * 0.3;
      const sway = 0.75 + 0.25 * Math.sin(beat * 0.4 + strand * TAU);
      const length = params.melt * (6 + 34 * strand ** 2) * sway;
      for (let y = 0; y < HEIGHT; y++) {
        const fall = clamp((y - 6) / (HEIGHT - 6)) ** 1.6;
        const shift = length * fall;
        const dx = x + 0.5 - WIDTH / 2;
        const dy = y + 0.5 - params.y - shift;
        const band = Math.log(Math.max(1e-3, getHeartSize(dx, dy))) / logRatio - phase;
        const fraction = getCycle(band);
        const bandPixels = Math.max(1e-3, Math.hypot(dx, dy) * logRatio);
        const edge = clamp((Math.min(fraction, 1 - fraction) * bandPixels) / 1.2);
        const isLit = Math.floor(band) % 2 === 0;
        const rot = clamp(shift / 10);
        const tone = mix(mix(color, WHITE, 0.35 * kick), scale(blood, 1 + 0.3 * kick), rot);
        const dark = mix(background, scale(blood, 0.35), rot * 0.6);
        const [own, other] = isLit ? [tone, dark] : [dark, tone];
        const near = mix(own, other, 0.5);
        setRgbaPixel(
          image,
          x,
          y,
          mix(near, mix(other, own, 0.5 + edge * 0.5), clamp(bandPixels / 2)),
        );
      }
    }
  },
});

function getFlatlineTrace(beat: number, beats: number): { level: number; thump: number } {
  const time = ((beat % beats) + beats) % beats;
  const progress = time / beats;
  const loop = Math.floor(beat / beats);
  if (progress < 0.5) {
    return { level: getTrace(time), thump: getLubDub(getCycle(time)) };
  }
  if (progress < 0.75) {
    const racing = beats * 0.5 + (time - beats * 0.5) * 2;
    const jitter = (getSmoothNoise(hashSeed(FLATLINE_SEED, loop), racing) - 0.5) * 0.4;
    return {
      level: getTrace(racing + jitter) * 0.85,
      thump: getLubDub(getCycle(racing + jitter)) * 0.8,
    };
  }
  if (progress < 0.85) {
    const fade = 1 - (progress - 0.75) / 0.1;
    const chaos =
      Math.sin(time * TAU * 4.3) * 0.5 +
      Math.sin(time * TAU * 7.1 + 1) * 0.3 +
      (getSmoothNoise(hashSeed(FLATLINE_SEED, loop, 1), time * 12) - 0.5) * 0.6;
    return { level: chaos * 0.6 * fade, thump: Math.abs(chaos) * 0.3 * fade };
  }
  return { level: 0, thump: 0 };
}

export const heartFlatline = defineEffect({
  id: "heart-flatline",
  name: "Flatline",
  kind: "pixel",
  params: z.object({
    ...colorParams,
    traceColor: colorSchema.default("#ffb6d5"),
    beats: z.number().int().min(8).max(64).default(16),
    sweep: z.number().min(1).max(8).default(2),
    size: z.number().min(0).max(50).default(28),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const blood = parseColor(params.bloodColor);
    const background = parseColor(params.backgroundColor);
    const time = getCycle(beat / params.beats) * params.beats;
    const progress = time / params.beats;
    const dying = clamp((progress - 0.45) / 0.4);
    const shock = Math.exp(-time * 5);
    const { thump } = getFlatlineTrace(beat, params.beats);
    const trace = mix(parseColor(params.traceColor), blood, dying);
    const gridColor = mix(mix(background, color, 0.18), scale(blood, 0.4), dying);
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const isLine = x % 8 === 4 || y % 8 === 4;
        setRgbaPixel(image, x, y, mix(isLine ? gridColor : background, WHITE, 0.6 * shock));
      }
    }
    if (params.size > 0) {
      const size = params.size * (1 + 0.16 * thump - 0.12 * dying);
      const tone = mix(color, scale(blood, 0.7), dying);
      drawHeart(image, {
        x: WIDTH / 2,
        y: 24,
        size,
        color: mix(scale(tone, 0.8), mix(tone, WHITE, 0.25), thump),
        outline: mix(mix(color, WHITE, 0.5 + 0.3 * thump), scale(blood, 0.5), dying),
      });
      if (dying < 0.5) {
        drawHeart(image, {
          x: WIDTH / 2 - size * 0.24,
          y: 24 - size * 0.22,
          size: size * 0.16,
          color: mix(color, WHITE, 0.7),
          amount: 1 - dying * 2,
          angle: -0.5,
        });
      }
      const bottom = Math.round(24 + (size * HEART_HEIGHT) / 2);
      for (let drip = 0; drip < 3; drip++) {
        const cycle = (progress - 0.6 - drip * 0.08) / 0.4;
        if (cycle < 0 || cycle >= 1) {
          continue;
        }
        drawDrip(image, {
          x: WIDTH / 2 - 3 + drip * 3 - (drip === 1 ? 1 : 0),
          top: bottom - 2 - (drip === 1 ? 0 : 3),
          width: 1,
          length: 4 + drip * 2,
          cycle,
          trail: 0.3,
          color: blood,
        });
      }
    }
    const baseline = 52;
    const head = getCycle(beat / params.sweep) * WIDTH;
    const beatsPerPixel = params.sweep / WIDTH;
    let previous: number | undefined;
    for (let x = 0; x < WIDTH; x++) {
      const behind = getCycle((head - x - 0.5) / WIDTH) * WIDTH;
      const { level: value } = getFlatlineTrace(beat - behind * beatsPerPixel, params.beats);
      const level = Math.round(baseline - value * 16);
      const fade = clamp(1.15 - behind / WIDTH);
      const isStart = previous === undefined || behind > WIDTH - 2;
      const top = isStart ? level : Math.min(previous ?? level, level);
      const bottom = isStart ? level : Math.max(previous ?? level, level);
      for (let y = top; y <= bottom; y++) {
        blendPixel(image, x, y, mix(trace, WHITE, behind < 3 ? 0.6 : 0), fade);
      }
      previous = level;
    }
  },
});

const ARROW_ANGLE = -0.32;
const ARROW_HALF = 26;
const FLIGHT = 0.3;

function drawArrow(
  image: RgbaImage,
  [x, y]: Point,
  color: Color,
  feather: Color,
  isHidden: (x: number, y: number) => boolean,
): void {
  const [cos, sin] = [Math.cos(ARROW_ANGLE), Math.sin(ARROW_ANGLE)];
  for (let along = -ARROW_HALF; along <= ARROW_HALF; along += 0.5) {
    const px = Math.round(x + cos * along);
    const py = Math.round(y + sin * along);
    if (!isHidden(px, py)) {
      setRgbaPixel(image, px, py, color);
    }
  }
  const tip: Point = [x + cos * (ARROW_HALF + 4), y + sin * (ARROW_HALF + 4)];
  for (let back = 0; back <= 4; back += 0.5) {
    const width = back * 0.7;
    for (let across = -width; across <= width; across += 0.5) {
      setRgbaPixel(
        image,
        Math.round(tip[0] - cos * back - sin * across),
        Math.round(tip[1] - sin * back + cos * across),
        mix(color, WHITE, 0.5),
      );
    }
  }
  for (let offset = 0; offset < 3; offset++) {
    const along = -ARROW_HALF + offset * 2.5;
    for (let reach = 1; reach <= 3; reach++) {
      for (const side of [-1, 1]) {
        const back = along - reach * 0.9;
        setRgbaPixel(
          image,
          Math.round(x + cos * back - sin * reach * side),
          Math.round(y + sin * back + cos * reach * side),
          feather,
        );
      }
    }
  }
}

export const heartArrow = defineEffect({
  id: "heart-arrow",
  name: "Cupid's arrow",
  kind: "pixel",
  params: z.object({
    ...colorParams,
    arrowColor: colorSchema.default("#ffd27a"),
    featherColor: colorSchema.default("#ffffff"),
    every: z.number().min(0.25).max(4).default(1),
    beats: z.number().int().min(2).max(16).default(4),
    size: z.number().min(16).max(50).default(34),
    spray: z.number().int().min(0).max(80).default(36),
    y: z.number().min(0).max(64).default(30),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const blood = parseColor(params.bloodColor);
    const arrow = parseColor(params.arrowColor);
    const feather = parseColor(params.featherColor);
    const loop = Math.floor(beat / params.beats);
    const time = getCycle(beat / params.beats) * params.beats;
    const heal = clamp((time - (params.beats - 1)) / (1 - FLIGHT));
    const isFlying = time > params.beats - FLIGHT;
    const shake = Math.sin(time * 70) * 2.5 * Math.exp(-time * 6);
    const center: Point = [WIDTH / 2 + shake, params.y];
    const thump = getLubDub(getCycle(beat / params.every));
    const size = params.size * (1 + 0.1 * thump);
    const random = createRandom(hashSeed(ARROW_SEED, loop));
    const wound: Point = [center[0] - 4 + random() * 3, center[1] + 1 + random() * 3];
    const stain = (2 + 12 * easings.easeOutCubic(clamp(time / (params.beats * 0.7)))) * (1 - heal);
    fillImage(image, scale(parseColor(params.backgroundColor), 1 + 0.6 * thump));
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const dx = x + 0.5 - center[0];
        const dy = y + 0.5 - center[1];
        const cover = getHeartCover(dx, dy, size);
        if (cover <= 0) {
          continue;
        }
        const noise = getSmoothNoise(hashSeed(ARROW_SEED, loop, y), x / 2) * 4;
        const bleed = clamp((stain + noise - Math.hypot(x - wound[0], (y - wound[1]) * 0.8)) / 3);
        const rim = clamp((size - getHeartSize(dx, dy)) / 3);
        const tone = mix(mix(color, WHITE, 0.3 * thump), scale(blood, 0.9 + 0.3 * thump), bleed);
        blendPixel(image, x, y, scale(tone, 0.6 + 0.4 * rim), cover);
      }
    }
    const isInside = (x: number, y: number) =>
      getHeartCover(x + 0.5 - center[0], y + 0.5 - center[1], size) > 0.5;
    const stuck: Point = [center[0] + 2, center[1] - 1];
    if (heal < 1) {
      drawArrow(image, stuck, scale(arrow, 1 - heal), scale(feather, 1 - heal), isInside);
    }
    if (isFlying) {
      const flight = (time - (params.beats - FLIGHT)) / FLIGHT;
      const distance = (1 - flight) * 70;
      const flying: Point = [
        stuck[0] - Math.cos(ARROW_ANGLE) * distance,
        stuck[1] - Math.sin(ARROW_ANGLE) * distance,
      ];
      drawArrow(image, flying, arrow, feather, () => false);
    }
    const bottoms = getHeartBottoms(params.y, params.size);
    for (let drip = 0; drip < 3; drip++) {
      const x = Math.round(wound[0] - 3 + drip * 3);
      const cycle = (time - 0.3 - drip * 0.5) / (params.beats - 0.5);
      const bottom = bottoms[x] ?? -1;
      if (cycle < 0 || cycle >= 1 || bottom < 0 || heal > 0) {
        continue;
      }
      drawDrip(image, {
        x,
        top: bottom + 1,
        width: drip === 1 ? 2 : 1,
        length: 4 + drip * 2,
        cycle,
        trail: 0.4,
        color: blood,
      });
    }
    if (time < 1.6) {
      drawSpray(image, wound, time, mix(blood, WHITE, 0.1), {
        count: params.spray,
        seed: hashSeed(ARROW_SEED, loop, 2),
        angle: Math.PI + ARROW_ANGLE - 0.5,
        spread: 0.7,
      });
    }
  },
});

const RAIN_FALL = 1.4;
const RAIN_STAIN = 4;

export const heartRain = defineEffect({
  id: "heart-rain",
  name: "Heart rain",
  kind: "pixel",
  params: z.object({
    ...colorParams,
    every: z.number().min(0.25).max(4).default(1),
    count: z.number().int().min(1).max(6).default(2),
    pool: z.number().int().min(0).max(12).default(3),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const blood = parseColor(params.bloodColor);
    const pulse = beat / params.every;
    const newest = Math.floor(pulse);
    const floor = HEIGHT - params.pool - 1;
    fillImage(image, parseColor(params.backgroundColor));
    const life = RAIN_FALL + RAIN_STAIN;
    for (let index = newest - Math.ceil(life); index <= newest; index++) {
      for (let heart = 0; heart < params.count; heart++) {
        const random = createRandom(hashSeed(RAIN_SEED, index, heart));
        const x = Math.round(getRandomBetween(random, 6, WIDTH - 6));
        const size = getRandomBetween(random, 7, 12);
        const age = pulse - index - heart / params.count - random() * 0.3;
        const fall = RAIN_FALL * getRandomBetween(random, 0.8, 1.1);
        if (age < 0 || age > fall + RAIN_STAIN) {
          continue;
        }
        if (age < fall) {
          const progress = age / fall;
          const y = -8 + (floor - size * 0.4 + 8) * easings.easeInQuad(progress);
          drawHeart(image, {
            x,
            y,
            size,
            color: mix(color, blood, progress ** 2),
            angle: Math.sin(age * 5 + random() * TAU) * 0.3,
          });
          continue;
        }
        const since = age - fall;
        const dry = clamp(since / RAIN_STAIN);
        const splat = mix(scale(blood, 1.1), DRIED_COLOR, dry * 0.8);
        drawSplat(
          image,
          [x, floor - 0.5],
          size * 0.18 * easings.easeOutCubic(clamp(since * 8)),
          0.45,
          splat,
          1 - dry ** 3,
          hashSeed(RAIN_SEED, index, heart, 3),
        );
        if (since < 0.8) {
          drawSpray(image, [x, floor - 1], since, blood, {
            count: 8,
            seed: hashSeed(RAIN_SEED, index, heart, 4),
            angle: -Math.PI / 2,
            spread: 1.1,
          });
        }
      }
    }
    drawPool(image, blood, params.pool, beat);
  },
});

const BURST_SWELL = 0.15;

export const heartBurst = defineEffect({
  id: "heart-burst",
  name: "Heart grid burst",
  kind: "pixel",
  params: z.object({
    ...colorParams,
    every: z.number().min(0.25).max(4).default(1),
    beats: z.number().int().min(4).max(64).default(16),
    spacing: z.number().int().min(8).max(32).default(16),
    size: z.number().min(0.2).max(1).default(0.6),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const blood = parseColor(params.bloodColor);
    const background = parseColor(params.backgroundColor);
    const loop = Math.floor(beat / params.beats);
    const time = getCycle(beat / params.beats) * params.beats;
    const reset = clamp(time - (params.beats - 1));
    const columns = Math.ceil(WIDTH / params.spacing);
    const cells = columns * columns;
    const random = createRandom(hashSeed(BURST_SEED, loop));
    const order = Array.from({ length: cells }, (_, cell) => ({ cell, key: random() }))
      .toSorted((a, b) => a.key - b.key)
      .map(({ cell }) => cell);
    const span = params.beats - 3;
    fillImage(image, background);
    for (const [rank, cell] of order.entries()) {
      const row = Math.floor(cell / columns);
      const column = cell % columns;
      const x = (column + 0.5) * params.spacing;
      const y = (row + 0.5) * params.spacing;
      const burstAt = Math.floor((rank * span) / cells) + (rank % 2) * 0.5;
      const since = time - burstAt;
      const seed = hashSeed(BURST_SEED, loop, cell);
      const offset = Math.hypot(x - WIDTH / 2, y - HEIGHT / 2) / 48;
      const kick = Math.exp(-getCycle(beat / params.every - offset) * 5);
      const fear = clamp(time / span) * 0.4;
      if (since < 0) {
        const swell = since > -BURST_SWELL ? 1 + (since + BURST_SWELL) * 3 : 1;
        drawHeart(image, {
          x: x + (getNoise(seed, Math.floor(beat * 8)) - 0.5) * fear * 3,
          y,
          size: params.spacing * params.size * (1 + 0.4 * kick) * swell,
          color: mix(mix(mix(background, color, 0.7), mix(color, WHITE, 0.35), kick), blood, fear),
        });
        continue;
      }
      const dry = clamp(since / 6);
      const tone = mix(scale(blood, 1.15), DRIED_COLOR, dry * 0.7);
      drawSplat(
        image,
        [x, y],
        params.spacing * 0.2 * easings.easeOutCubic(clamp(since * 6)),
        1,
        tone,
        1 - reset,
        seed,
      );
      const drip = createRandom(hashSeed(seed, 5));
      drawDrip(image, {
        x: Math.round(x + getRandomBetween(drip, -2, 2)),
        top: Math.round(y + 2),
        width: 1,
        length: Math.round(getRandomBetween(drip, 3, params.spacing * 0.5)),
        cycle: Math.min(0.64, since / 4),
        trail: 0,
        color: scale(tone, 1 - reset),
      });
      if (since < 0.9) {
        drawSpray(image, [x, y], since, blood, {
          count: 14,
          seed: hashSeed(seed, 6),
          angle: -Math.PI / 2,
          spread: Math.PI,
        });
      }
    }
  },
});

const DRIPS_SEED = hashSeed(HEART_SEED, 0xb7);

function getLevel(source: Uint8ClampedArray, x: number, y: number): number {
  const offset = (y * WIDTH + x) * 4;
  return Math.max(source[offset] ?? 0, source[offset + 1] ?? 0, source[offset + 2] ?? 0) / 255;
}

function getSourceColor(source: Uint8ClampedArray, x: number, y: number): Color {
  const offset = (y * WIDTH + x) * 4;
  return [source[offset] ?? 0, source[offset + 1] ?? 0, source[offset + 2] ?? 0];
}

export const bloodDrips = defineEffect({
  id: "blood-drips",
  name: "Blood drips",
  kind: "filter",
  params: z.object({
    color: colorSchema.default("#c00014"),
    count: z.number().int().min(0).max(48).default(10),
    length: z.number().int().min(2).max(32).default(9),
    beats: z.number().int().min(1).max(32).default(4),
    threshold: z.number().min(0).max(1).default(0.4),
    trail: z.number().min(0).max(1).default(0.15),
    tint: z.number().min(0).max(1).default(0.4),
    pool: z.number().int().min(0).max(12).default(0),
  }),
  render(image, { params, beat, source }) {
    image.set(source);
    const drips = new Uint8ClampedArray(source.length);
    const color = parseColor(params.color);
    for (let drip = 0; drip < params.count; drip++) {
      const random = createRandom(hashSeed(DRIPS_SEED, drip));
      const x = Math.floor(((drip + getRandomBetween(random, 0.1, 0.9)) / params.count) * WIDTH);
      const start = Math.floor(getRandomBetween(random, 0, HEIGHT * 0.6));
      const width = random() < 0.3 ? 2 : 1;
      const length = Math.round(params.length * getRandomBetween(random, 0.5, 1));
      const period = params.beats * (random() < 0.5 ? 1 : 2);
      const phase = random();
      let edge = -1;
      for (let y = start; y < HEIGHT - 2; y++) {
        const isShape = getLevel(source, x, y) > params.threshold;
        if (isShape && getLevel(source, x, y + 1) <= params.threshold) {
          edge = y;
          break;
        }
      }
      if (edge < 0) {
        continue;
      }
      drawDrip(drips, {
        x,
        top: edge + 1,
        width,
        length,
        cycle: getCycle(beat / period + phase),
        trail: params.trail,
        color: mix(getSourceColor(source, x, edge), color, params.tint),
      });
    }
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const offset = (y * WIDTH + x) * 4;
        if ((drips[offset + 3] ?? 0) > 0 && getLevel(source, x, y) <= params.threshold) {
          image.set(drips.subarray(offset, offset + 4), offset);
        }
      }
    }
    drawPool(image, color, params.pool, beat);
  },
});

const CORRUPT_SEED = hashSeed(HEART_SEED, 0xb8);
const VEIN_SEED = hashSeed(HEART_SEED, 0xb9);
const LOVE_PINK: Color = [255, 42, 109];
const VEIN_COLOR: Color = [70, 0, 24];
const SPLAT_LIFE = 8;
const RAIN_DROPS = 10;

const corruptStyles = ["rotten", "glitch", "raw", "void"] as const;

type CorruptStyle = (typeof corruptStyles)[number];

type CorruptPixel = {
  x: number;
  y: number;
  dx: number;
  dy: number;
  rim: number;
};

type CorruptFrame = {
  color: Color;
  blood: Color;
  thump: number;
  kick: number;
  isLoveFlicker: boolean;
};

function getVein(x: number, y: number, width: number): boolean {
  return Math.abs(getSmoothNoise2d(VEIN_SEED, x / 7, y / 7) - 0.5) < width;
}

function getCorruptFill(
  style: CorruptStyle,
  { x, y, dx, dy, rim }: CorruptPixel,
  { color, blood, thump, kick, isLoveFlicker }: CorruptFrame,
  size: number,
): Color {
  if (style === "rotten") {
    const blotch = clamp(getSmoothNoise2d(CORRUPT_SEED, x / 5, y / 5) * 1.6 - 0.3);
    const rot = getSmoothNoise2d(hashSeed(CORRUPT_SEED, 1), x / 3, y / 3);
    let tone = mix(color, DRIED_COLOR, blotch);
    if (rot > 0.72) {
      tone = scale(DRIED_COLOR, 0.4);
    }
    if (getVein(x, y, 0.035)) {
      tone = mix([10, 0, 0], mix(color, WHITE, 0.2), thump);
    }
    return scale(tone, (0.45 + 0.55 * rim) * (0.85 + 0.35 * thump));
  }
  if (style === "raw") {
    const wet = clamp(1 - Math.hypot(dx + size * 0.2, dy + size * 0.2) / (size * 0.13));
    const sheen = clamp(1 - Math.hypot(dx - size * 0.18, dy + size * 0.05) / (size * 0.06));
    let tone = scale(color, (0.4 + 0.6 * rim) * (0.85 + 0.3 * thump));
    if (getVein(x, y, 0.025 + 0.03 * thump)) {
      tone = mix(tone, VEIN_COLOR, 0.75);
    }
    return mix(tone, mix(color, WHITE, 0.55), Math.max(wet, sheen * 0.7) ** 1.5);
  }
  if (style === "void") {
    const glow = clamp(1 - rim * 1.6);
    return mix([0, 0, 0], scale(blood, 1 + 0.6 * thump), glow ** 1.5);
  }
  const base = isLoveFlicker ? LOVE_PINK : color;
  const band = getNoise(CORRUPT_SEED, Math.floor(y / 2), Math.floor(kick * 6));
  const tone = band < 0.12 * kick ? mix(base, WHITE, 0.5) : base;
  return scale(tone, (0.55 + 0.45 * rim) * (0.85 + 0.35 * thump));
}

function getSliceOffset(y: number, beat: number, kick: number): number {
  const index = Math.floor(beat);
  const slice = Math.floor(y / (2 + Math.floor(getNoise(CORRUPT_SEED, index, 7) * 4)));
  const noise = getNoise(CORRUPT_SEED, index, slice);
  return noise > 0.45 ? Math.round((noise - 0.72) * 30 * kick) : 0;
}

function drawFallingDrops(image: RgbaImage, beat: number, color: Color): void {
  for (let drop = 0; drop < RAIN_DROPS; drop++) {
    const random = createRandom(hashSeed(CORRUPT_SEED, 3, drop));
    const period = getRandomBetween(random, 1.5, 3);
    const cycle = getCycle(beat / period + random());
    const x = Math.round(getRandomBetween(random, 1, WIDTH - 2));
    const y = cycle ** 1.6 * (HEIGHT + 12) - 6;
    drawStreak(image, [x, y - 4], [x, y], scale(color, 0.8));
    drawDot(image, [x, y], 1, color);
  }
}

function drawBackgroundSplats(image: RgbaImage, beat: number, color: Color): void {
  const newest = Math.floor(beat);
  for (let index = newest - SPLAT_LIFE; index <= newest; index++) {
    const age = beat - index;
    if (age < 0 || age > SPLAT_LIFE) {
      continue;
    }
    const random = createRandom(hashSeed(CORRUPT_SEED, 4, index));
    const side = random() < 0.5 ? -1 : 1;
    const x = WIDTH / 2 + side * getRandomBetween(random, 14, 30);
    const y = getRandomBetween(random, 4, HEIGHT - 8);
    drawSplat(
      image,
      [x, y],
      getRandomBetween(random, 1.5, 3) * easings.easeOutCubic(clamp(age * 5 - 0.6)),
      1,
      mix(scale(color, 1.1), DRIED_COLOR, age / SPLAT_LIFE),
      1 - (age / SPLAT_LIFE) ** 2,
      hashSeed(CORRUPT_SEED, 5, index),
    );
  }
}

function drawVoidRipples(
  image: RgbaImage,
  centerY: number,
  pulse: number,
  background: Color,
  blood: Color,
): void {
  const push = Math.floor(pulse) + easings.easeOutCubic(getCycle(pulse));
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const size = getHeartSize(x + 0.5 - WIDTH / 2, y + 0.5 - centerY);
      const wave = getCycle(size / 14 - push);
      const ring = clamp((Math.abs(wave - 0.5) - 0.3) * 6);
      const fade = clamp(1.4 - size / 70);
      setRgbaPixel(image, x, y, mix(background, scale(blood, 0.7), ring * fade));
    }
  }
}

export const heartCorrupt = defineEffect({
  id: "heart-corrupt",
  name: "Corrupted heart",
  kind: "pixel",
  params: z.object({
    color: colorSchema.default("#d0001c"),
    bloodColor: colorSchema.default("#8a0303"),
    backgroundColor: colorSchema.default("#080000"),
    style: z.enum(corruptStyles).default("rotten"),
    every: z.number().min(0.25).max(4).default(1),
    size: z.number().min(10).max(56).default(36),
    border: z.number().min(0).max(4).default(1.5),
    drips: z.number().int().min(0).max(16).default(7),
    pool: z.number().int().min(0).max(12).default(3),
    y: z.number().min(0).max(64).default(28),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const blood = parseColor(params.bloodColor);
    const background = parseColor(params.backgroundColor);
    const style = params.style;
    const pulse = beat / params.every;
    const cycle = getCycle(pulse);
    const isSkipped = style === "rotten" && Math.floor(pulse) % 3 === 2;
    const thump = getLubDub(cycle) * (isSkipped ? 0.3 : 1);
    const kick = Math.exp(-cycle * 5);
    const size = params.size * (1 + 0.12 * thump);
    const outer = size + params.border * 2.2;
    const frame: CorruptFrame = {
      color,
      blood,
      thump,
      kick,
      isLoveFlicker: getNoise(CORRUPT_SEED, Math.floor(beat * 8)) < 0.05,
    };
    if (style === "void") {
      drawVoidRipples(image, params.y, pulse, background, blood);
    } else {
      const flash = style === "glitch" ? 0 : 0.35 * thump;
      fillImage(image, mix(background, scale(blood, 0.5), flash));
    }
    if (style === "rotten") {
      drawFallingDrops(image, beat, blood);
    }
    if (style === "raw") {
      drawBackgroundSplats(image, pulse, blood);
    }
    const border = style === "void" ? scale(color, 0.9 + 0.4 * thump) : scale(blood, 0.8);
    for (let y = 0; y < HEIGHT; y++) {
      const offset = style === "glitch" ? getSliceOffset(y, pulse, kick) : 0;
      const isDropped =
        style === "glitch" && getNoise(CORRUPT_SEED, 9, Math.floor(beat * 6), y) < 0.04;
      for (let x = 0; x < WIDTH; x++) {
        const dx = x - offset + 0.5 - WIDTH / 2;
        const dy = y + 0.5 - params.y;
        const edge = getHeartCover(dx, dy, outer);
        if (edge <= 0 || isDropped) {
          continue;
        }
        const grain = 0.75 + 0.35 * getNoise(CORRUPT_SEED, 2, x, y);
        blendPixel(image, x, y, scale(border, grain), edge);
        const cover = getHeartCover(dx, dy, size);
        if (cover <= 0) {
          continue;
        }
        const rim = clamp((size - getHeartSize(dx, dy)) / 4);
        const pixel = { x: x - offset, y, dx, dy, rim };
        blendPixel(image, x, y, getCorruptFill(style, pixel, frame, size), cover);
      }
      if (style === "glitch" && offset !== 0) {
        for (let x = 0; x < WIDTH; x++) {
          const ghost = getHeartCover(x + 0.5 - WIDTH / 2, y + 0.5 - params.y, size);
          if (
            ghost > 0.5 &&
            getHeartCover(x - offset + 0.5 - WIDTH / 2, y + 0.5 - params.y, outer) <= 0
          ) {
            blendPixel(image, x, y, scale(blood, 0.5), 0.6);
          }
        }
      }
    }
    if (style === "glitch") {
      for (let speck = 0; speck < 24; speck++) {
        const random = createRandom(hashSeed(CORRUPT_SEED, 6, Math.floor(beat * 10), speck));
        const x = Math.floor(random() * WIDTH);
        const y = Math.floor(random() * HEIGHT);
        blendPixel(image, x, y, random() < 0.2 ? WHITE : color, kick * 0.8 + 0.2);
      }
    }
    if (style === "raw" && cycle < 0.9) {
      const top: Point = [WIDTH / 2 + size * 0.12, params.y - (size * HEART_HEIGHT) / 2 + 2];
      drawSpray(image, top, cycle * params.every, mix(color, WHITE, 0.1), {
        count: 22,
        seed: hashSeed(CORRUPT_SEED, 7, Math.floor(pulse) % 4),
        angle: -Math.PI / 2,
        spread: 0.45,
      });
    }
    const bottoms = getHeartBottoms(params.y, outer);
    const dripColor = style === "void" ? color : blood;
    for (let drip = 0; drip < params.drips; drip++) {
      const random = createRandom(hashSeed(CORRUPT_SEED, 8, drip));
      const spread = outer * 0.36;
      const x = Math.round(WIDTH / 2 + ((drip + random()) / params.drips - 0.5) * 2 * spread);
      const bottom = bottoms[x] ?? -1;
      if (bottom < 0) {
        continue;
      }
      drawDrip(image, {
        x,
        top: bottom + 1,
        width: random() < 0.4 ? 2 : 1,
        length: Math.round(getRandomBetween(random, 4, 11)),
        cycle: getCycle(beat / (random() < 0.5 ? 2 : 4) + random()),
        trail: 0.3,
        color: dripColor,
      });
    }
    drawPool(image, dripColor, params.pool, beat, thump);
  },
});
