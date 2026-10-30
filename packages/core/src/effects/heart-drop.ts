import { z } from "zod";
import { colorSchema, getShiftedHue, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { type Color, HEIGHT, WIDTH, fillRgbaImage, setRgbaPixel } from "../frame.ts";
import { easings } from "../keyframes.ts";
import { createRandom, getRandomBetween, hashSeed } from "../random.ts";
import { TAU, clamp, getSpan } from "./cat-duo.ts";
import { getCycle } from "./cat-dance.ts";
import { mix, scale } from "./cat-model.ts";
import { getOvershoot } from "./cat-wands.ts";
import { HEART_ASPECT, drawHeart } from "./heart.ts";
import {
  addDot,
  addGlow,
  addHeart,
  addHeartOutline,
  addLine,
  getHeartHomes,
  getHeartMask,
  getHeartPoint,
  getHitSeed,
  getPlacedPoint,
  sampleMask,
} from "./heart-curve.ts";
import { HEART_SEED } from "./heart-particles.ts";
import { getBeatKick } from "./heart-pulse.ts";

const WHITE: Color = [255, 255, 255];
const BLACK: Color = [0, 0, 0];
const GOLD: Color = [255, 200, 60];
const STAMP_SEED = hashSeed(HEART_SEED, 0xb1);
const CLAP_SEED = hashSeed(HEART_SEED, 0xb2);
const SLICE_SEED = hashSeed(HEART_SEED, 0xb3);
const FIREWORK_SEED = hashSeed(HEART_SEED, 0xb4);
const EXPLODE_SEED = hashSeed(HEART_SEED, 0xb5);

const mask = new Float32Array(WIDTH * HEIGHT);

function getAccents(color: Color): readonly Color[] {
  return [color, mix(color, WHITE, 0.45), getShiftedHue(color, 0.07), getShiftedHue(color, -0.07)];
}

const STAMP_HITS = 1.5;

export const heartStamp = defineEffect({
  id: "heart-stamp",
  name: "Heart stamps",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default("#ff2a6d"),
    rate: z.number().min(0.5).max(8).default(2),
    minSize: z.number().min(6).max(40).default(12),
    maxSize: z.number().min(6).max(50).default(30),
    outline: z.number().min(0).max(1).default(0.5),
    downbeat: z.boolean().default(true),
  }),
  render(image, { params, beat }) {
    fillRgbaImage(image, BLACK);
    const color = parseColor(params.color);
    const accents = getAccents(color);
    if (params.downbeat) {
      const age = getCycle(beat / 4) * 4;
      const amount = Math.exp(-age * 5);
      addHeartOutline(image, {
        x: WIDTH / 2,
        y: HEIGHT / 2 + 1,
        size: 52 + 10 * easings.easeOutCubic(clamp(age)),
        color: mix(color, WHITE, 0.6 * amount),
        amount,
        width: 3,
      });
    }
    const newest = Math.floor(beat * params.rate);
    for (let index = newest - Math.ceil(STAMP_HITS); index <= newest; index++) {
      const hits = beat * params.rate - index;
      if (hits < 0 || hits >= STAMP_HITS) {
        continue;
      }
      const random = createRandom(getHitSeed(STAMP_SEED, index / params.rate));
      const size =
        getRandomBetween(random, params.minSize, Math.max(params.minSize, params.maxSize)) *
        getOvershoot(clamp(hits * 5));
      const margin = size * 0.4;
      const x = getRandomBetween(random, margin, WIDTH - margin);
      const y = getRandomBetween(random, margin, HEIGHT - margin);
      const angle = getRandomBetween(random, -0.45, 0.45);
      const isOutline = random() < params.outline;
      const tone = mix(
        accents[Math.floor(random() * accents.length)] ?? color,
        WHITE,
        0.6 * Math.exp(-hits * 8),
      );
      const amount = hits < 0.5 ? 1 : Math.exp(-(hits - 0.5) * 7);
      if (amount < 0.05) {
        continue;
      }
      if (isOutline) {
        addHeartOutline(image, { x, y, size, angle, color: tone, amount, width: 2 });
        continue;
      }
      drawHeart(image, {
        x,
        y,
        size,
        angle,
        color: scale(tone, amount),
        outline: scale(mix(tone, WHITE, 0.5), amount),
      });
    }
  },
});

export const heartClap = defineEffect({
  id: "heart-clap",
  name: "Heart clap",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default("#ff2a6d"),
    every: z.number().min(0.25).max(4).default(1),
    gap: z.number().min(2).max(24).default(14),
    size: z.number().min(16).max(60).default(40),
    sparks: z.number().int().min(0).max(48).default(20),
    y: z.number().min(0).max(64).default(33),
  }),
  render(image, { params, beat }) {
    fillRgbaImage(image, BLACK);
    const color = parseColor(params.color);
    const { kick } = getBeatKick(beat, params.every);
    const cycle = getCycle(beat / params.every);
    const open =
      cycle < 0.3
        ? easings.easeOutCubic(cycle / 0.3)
        : 1 - easings.easeInCubic(getSpan(cycle, 0.55, 1));
    const shift = (params.gap / 2) * open;
    const tilt = 0.22 * open;
    const size = params.size * (1 + 0.06 * kick);
    getHeartMask(mask, { x: WIDTH / 2, y: params.y, size });
    const tip: [number, number] = [WIDTH / 2, params.y + size * HEART_ASPECT * 0.5];
    const fill = mix(color, WHITE, 0.5 * kick);
    const crack = mix(color, WHITE, 0.7);
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        let coverage = 0;
        let seam = 0;
        for (const side of [-1, 1]) {
          const angle = -side * tilt;
          const px = x + 0.5 - side * shift - tip[0];
          const py = y + 0.5 - tip[1];
          const sx = tip[0] + px * Math.cos(angle) - py * Math.sin(angle);
          const sy = tip[1] + px * Math.sin(angle) + py * Math.cos(angle);
          if ((sx - WIDTH / 2) * side < 0) {
            continue;
          }
          const covered = sampleMask(mask, sx, sy);
          coverage = Math.max(coverage, covered);
          seam = Math.max(seam, covered * clamp(1.6 - Math.abs(sx - WIDTH / 2)) * open);
        }
        if (coverage > 0) {
          setRgbaPixel(image, x, y, scale(mix(fill, crack, seam), coverage));
        }
      }
    }
    const age = cycle * params.every;
    if (age < 0.8) {
      const ring = 1 - age / 0.8;
      addHeartOutline(image, {
        x: WIDTH / 2,
        y: params.y,
        size: size * (1 + 1.2 * easings.easeOutCubic(age / 0.8)),
        color: mix(color, WHITE, 0.6),
        amount: ring ** 2,
        width: 2,
      });
    }
    const random = createRandom(
      getHitSeed(CLAP_SEED, Math.floor(beat / params.every) * params.every),
    );
    const top = params.y - size * HEART_ASPECT * 0.25;
    for (let spark = 0; spark < params.sparks; spark++) {
      const side = spark % 2 === 0 ? -1 : 1;
      const startY = getRandomBetween(random, top, tip[1] - 2);
      const speed = getRandomBetween(random, 18, 40);
      const lift = getRandomBetween(random, -14, 6);
      const life = getRandomBetween(random, 0.35, 0.7);
      if (age >= life) {
        continue;
      }
      const t = easings.easeOutQuad(age / life) * life;
      addDot(
        image,
        WIDTH / 2 + side * (shift + speed * t),
        startY + lift * t + 20 * t * t,
        mix(WHITE, color, age / life),
        1 - age / life,
      );
    }
  },
});

export const heartSlice = defineEffect({
  id: "heart-slice",
  name: "Heart slice",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default("#ff2a6d"),
    every: z.number().min(0.125).max(2).default(0.5),
    slices: z.number().int().min(3).max(16).default(7),
    shift: z.number().min(0).max(16).default(9),
    split: z.number().min(0).max(6).default(3),
    size: z.number().min(16).max(62).default(48),
    y: z.number().min(0).max(64).default(33),
  }),
  render(image, { params, beat }) {
    fillRgbaImage(image, BLACK);
    const color = parseColor(params.color);
    const { kick } = getBeatKick(beat, 1);
    const cycle = getCycle(beat / params.every);
    const hold = 1 - easings.easeOutCubic(getSpan(cycle, 0.4, 0.65));
    getHeartMask(mask, { x: WIDTH / 2, y: params.y, size: params.size * (1 + 0.05 * kick) });
    const random = createRandom(
      getHitSeed(SLICE_SEED, Math.floor(beat / params.every) * params.every),
    );
    const offsets = Array.from({ length: params.slices }, () => {
      const isMoving = random() < 0.65;
      return isMoving ? getRandomBetween(random, -1, 1) * params.shift * hold : 0;
    });
    const split = params.split * hold;
    const tone = mix(mix(color, WHITE, 0.12), WHITE, 0.5 * kick);
    const sliceHeight = HEIGHT / params.slices;
    for (let y = 0; y < HEIGHT; y++) {
      const slice = Math.floor(y / sliceHeight);
      const offset = offsets[slice] ?? 0;
      const isEdge = Math.floor((y + 1) / sliceHeight) !== slice && offset !== 0;
      const edge = isEdge ? 0.25 : 1;
      for (let x = 0; x < WIDTH; x++) {
        const sx = x + 0.5 - offset;
        const red = sampleMask(mask, sx - split, y + 0.5);
        const green = sampleMask(mask, sx, y + 0.5);
        const blue = sampleMask(mask, sx + split, y + 0.5);
        if (red + green + blue > 0) {
          setRgbaPixel(image, x, y, [
            tone[0] * red * edge,
            tone[1] * green * edge,
            tone[2] * blue * edge,
          ]);
        }
      }
    }
  },
});

const FIREWORK_LIFE = 1.8;
const FIREWORK_SPREAD = 0.6;

export const heartFireworks = defineEffect({
  id: "heart-fireworks",
  name: "Heart fireworks",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default("#ff2a6d"),
    every: z.number().min(0.5).max(4).default(1),
    sparks: z.number().int().min(12).max(64).default(34),
    size: z.number().min(10).max(44).default(28),
    gravity: z.number().min(0).max(20).default(6),
  }),
  render(image, { params, beat }) {
    fillRgbaImage(image, BLACK);
    const color = parseColor(params.color);
    const colors = [...getAccents(color), mix(color, GOLD, 0.7)];
    const rise = Math.min(0.75, params.every * 0.9);
    const newest = Math.floor((beat + rise) / params.every);
    const oldest = newest - Math.ceil((FIREWORK_LIFE + rise) / params.every);
    for (let index = oldest; index <= newest; index++) {
      const burstAt = index * params.every;
      const random = createRandom(getHitSeed(FIREWORK_SEED, burstAt));
      const x = getRandomBetween(random, 18, WIDTH - 18);
      const y = getRandomBetween(random, 18, 30);
      const tone = colors[Math.floor(random() * colors.length)] ?? color;
      const isDownbeat = getCycle(burstAt / 4) * 4 < 0.01;
      const size = params.size * (isDownbeat ? 1.3 : getRandomBetween(random, 0.75, 1));
      const age = beat - burstAt;
      if (age < 0) {
        const flight = 1 + age / rise;
        if (flight < 0) {
          continue;
        }
        const startX = x + getRandomBetween(random, -6, 6);
        for (let trail = 0; trail < 5; trail++) {
          const t = easings.easeOutQuad(clamp(flight - trail * 0.05));
          addDot(
            image,
            startX + (x - startX) * t,
            HEIGHT + 2 + (y - HEIGHT - 2) * t,
            trail === 0 ? WHITE : mix(tone, GOLD, 0.5),
            1 - trail / 5,
          );
        }
        continue;
      }
      if (age >= FIREWORK_LIFE) {
        continue;
      }
      if (age < 0.2) {
        addGlow(image, x, y, WHITE, 1 - age / 0.2, 7);
      }
      const fade = (1 - age / FIREWORK_LIFE) ** 1.4;
      const rings = isDownbeat ? [1, 0.5] : [1];
      for (const ring of rings) {
        for (let spark = 0; spark < params.sparks; spark++) {
          const sparkRandom = createRandom(hashSeed(FIREWORK_SEED, spark));
          const reach = size * ring * getRandomBetween(sparkRandom, 0.92, 1.08);
          const [px, py] = getHeartPoint(spark / params.sparks);
          const flicker =
            age > FIREWORK_LIFE * 0.5
              ? hashSeed(index, spark, Math.floor(beat * 12)) % 3 === 0
                ? 0.2
                : 1
              : 1;
          for (let trail = 0; trail < 3; trail++) {
            const t = age - trail * 0.05;
            if (t < 0) {
              continue;
            }
            const spread = easings.easeOutCubic(clamp(t / FIREWORK_SPREAD));
            addDot(
              image,
              x + px * reach * spread,
              y + py * reach * spread + 0.5 * params.gravity * t * t,
              mix(WHITE, ring === 1 ? tone : mix(tone, WHITE, 0.5), clamp(t * 6)),
              fade * flicker * (1 - trail * 0.35),
            );
          }
        }
      }
    }
  },
});

export const heartExplode = defineEffect({
  id: "heart-explode",
  name: "Heart explode",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default("#ff2a6d"),
    every: z.number().min(0.25).max(4).default(1),
    count: z.number().int().min(60).max(400).default(260),
    force: z.number().min(4).max(48).default(14),
    size: z.number().min(16).max(60).default(40),
    y: z.number().min(0).max(64).default(33),
  }),
  render(image, { params, beat }) {
    fillRgbaImage(image, BLACK);
    const color = parseColor(params.color);
    const accents = getAccents(color);
    const cycle = getCycle(beat / params.every);
    const burst =
      cycle < 0.45
        ? easings.easeOutCubic(cycle / 0.45)
        : 1 - easings.easeInCubic(getSpan(cycle, 0.45, 0.92));
    const whole = clamp(1 - burst * 6);
    if (whole > 0) {
      addHeart(image, {
        x: WIDTH / 2,
        y: params.y,
        size: params.size,
        color: scale(mix(color, WHITE, 0.3 * whole), whole),
      });
    }
    const random = createRandom(
      getHitSeed(EXPLODE_SEED, Math.floor(beat / params.every) * params.every),
    );
    const homes = getHeartHomes(params.count, EXPLODE_SEED);
    const flash = Math.exp(-cycle * params.every * 8);
    for (const [index, [hx, hy]] of homes.entries()) {
      const angle = Math.atan2(hy, hx) + getRandomBetween(random, -0.5, 0.5);
      const speed = getRandomBetween(random, 0.3, 1.2) * params.force;
      const spin = getRandomBetween(random, -0.6, 0.6) * burst;
      const x = WIDTH / 2 + hx * params.size + Math.cos(angle + spin) * speed * burst;
      const y = params.y + hy * params.size + Math.sin(angle + spin) * speed * burst;
      const tone = mix(accents[index % accents.length] ?? color, WHITE, 0.2 + flash * 0.6);
      addDot(image, x, y, tone, 1.3);
    }
    if (cycle * params.every < 0.4) {
      const ring = cycle * params.every;
      addHeartOutline(image, {
        x: WIDTH / 2,
        y: params.y,
        size: params.size * (1 + 2.2 * easings.easeOutCubic(ring / 0.4)),
        color: mix(color, WHITE, 0.6),
        amount: 1.5 * (1 - ring / 0.4) ** 2,
        width: 2,
      });
    }
  },
});

export const heartMarquee = defineEffect({
  id: "heart-marquee",
  name: "Heart marquee",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default("#ff2a6d"),
    every: z.number().min(0.25).max(4).default(1),
    bulbs: z.number().int().min(12).max(40).default(26),
    size: z.number().min(20).max(62).default(54),
    y: z.number().min(0).max(64).default(33),
  }),
  render(image, { params, beat }) {
    fillRgbaImage(image, BLACK);
    const color = parseColor(params.color);
    const { pulse, kick } = getBeatKick(beat, params.every);
    const step = Math.floor(pulse * 4);
    const direction = Math.floor(beat / 4) % 2 === 0 ? 1 : -1;
    const flash = Math.exp(-getCycle(beat / 4) * 12);
    const placement = { x: WIDTH / 2, y: params.y, size: params.size };
    for (let bulb = 0; bulb < params.bulbs; bulb++) {
      const [x, y] = getPlacedPoint(getHeartPoint(bulb / params.bulbs), placement);
      const isLit = (((bulb * direction - step) % 4) + 4) % 4 === 0;
      const level = Math.max(isLit ? 1 : 0.1, flash);
      const tone = mix(color, WHITE, isLit ? 0.3 : flash * 0.6);
      addGlow(image, x, y, tone, level * 0.8, 2.2);
      addDot(image, x, y, WHITE, level * 0.6);
    }
    const size = params.size * 0.36 * (1 + 0.15 * kick);
    drawHeart(image, {
      x: WIDTH / 2,
      y: params.y,
      size,
      color: mix(color, WHITE, 0.4 * kick),
      outline: mix(color, WHITE, 0.6),
    });
  },
});

export const heartLasers = defineEffect({
  id: "heart-lasers",
  name: "Heart lasers",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default("#ff2a6d"),
    every: z.number().min(0.125).max(2).default(0.5),
    points: z.number().int().min(8).max(32).default(16),
    size: z.number().min(20).max(56).default(40),
    y: z.number().min(0).max(64).default(28),
    cross: z.boolean().default(true),
  }),
  render(image, { params, beat }) {
    fillRgbaImage(image, BLACK);
    const color = parseColor(params.color);
    const lap = params.points * params.every;
    const lapBeat = getCycle(beat / lap) * lap;
    const current = Math.min(params.points - 1, Math.floor(lapBeat / params.every));
    const cycle = lapBeat / params.every - current;
    const placement = { x: WIDTH / 2, y: params.y, size: params.size };
    const targets = Array.from({ length: params.points }, (_, point) =>
      getPlacedPoint(getHeartPoint(point / params.points), placement),
    );
    const finish = Math.exp(-lapBeat * 2.5);
    addHeartOutline(image, {
      ...placement,
      color: mix(color, WHITE, 0.5),
      amount: finish * 1.2,
      width: 2,
    });
    const line = mix(color, WHITE, 0.1);
    for (let point = 0; point <= current; point++) {
      const target = targets[point] ?? [0, 0];
      const age = lapBeat - point * params.every;
      const previous = targets[point - 1];
      if (previous) {
        addLine(image, previous, target, line, 0.55 * clamp((age / params.every) * 3));
      }
      addGlow(image, target[0], target[1], color, 0.8, 2);
      addDot(image, target[0], target[1], WHITE, 0.8 + 0.6 * Math.exp(-age * 6));
    }
    if (current === params.points - 1) {
      addLine(
        image,
        targets[current] ?? [0, 0],
        targets[0] ?? [0, 0],
        line,
        0.55 * clamp(cycle * 3),
      );
    }
    const target = targets[current] ?? [0, 0];
    const strength = (1 - clamp(cycle / 0.6)) ** 2;
    const origins: readonly (readonly [number, number])[] = params.cross
      ? [
          [0, HEIGHT],
          [WIDTH, HEIGHT],
        ]
      : [current % 2 === 0 ? [0, HEIGHT] : [WIDTH, HEIGHT]];
    const beam = mix(color, WHITE, 0.3);
    for (const origin of origins) {
      addLine(image, origin, target, beam, strength * 1.2);
      addGlow(image, origin[0], origin[1], color, strength, 5);
    }
    addGlow(image, target[0], target[1], WHITE, strength, 3.5);
  },
});

export const heartWave = defineEffect({
  id: "heart-wave",
  name: "Heart wave",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default("#ff2a6d"),
    every: z.number().min(0.0625).max(1).default(0.25),
    count: z.number().int().min(3).max(7).default(5),
    size: z.number().min(6).max(16).default(11),
    height: z.number().min(4).max(30).default(16),
    y: z.number().min(0).max(64).default(46),
    together: z.boolean().default(true),
  }),
  render(image, { params, beat }) {
    fillRgbaImage(image, BLACK);
    const color = parseColor(params.color);
    const span = params.count - 1;
    const period = span * 2;
    const step = beat / params.every;
    const barBeat = getCycle(beat / 4) * 4;
    const group = params.together && barBeat < 1 ? Math.sin(Math.PI * barBeat) * 0.8 : 0;
    for (let heart = 0; heart < params.count; heart++) {
      let jump = group;
      for (let trigger = Math.floor(step) - 2; trigger <= Math.floor(step); trigger++) {
        const position = ((trigger % period) + period) % period;
        const index = position <= span ? position : period - position;
        const age = (step - trigger) / 2;
        if (index === heart && age >= 0 && age < 1) {
          jump = Math.max(jump, Math.sin(Math.PI * age));
        }
      }
      const tone = getShiftedHue(color, (heart - span / 2) * 0.05);
      drawHeart(image, {
        x: ((heart + 0.5) * WIDTH) / params.count,
        y: params.y - jump * params.height,
        size: params.size * (1 + 0.15 * jump),
        color: mix(tone, WHITE, 0.5 * jump),
        outline: mix(tone, WHITE, 0.5),
      });
    }
  },
});

export const heartFlip = defineEffect({
  id: "heart-flip",
  name: "Heart flip",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default("#ff2a6d"),
    backColor: colorSchema.default("#20e8ff"),
    every: z.number().min(0.25).max(4).default(1),
    size: z.number().min(16).max(56).default(40),
    y: z.number().min(0).max(64).default(34),
    hop: z.number().min(0).max(16).default(6),
  }),
  render(image, { params, beat }) {
    fillRgbaImage(image, BLACK);
    const pulse = beat / params.every;
    const flip = clamp(getCycle(pulse) / 0.4);
    const angle = (Math.floor(pulse) + getOvershoot(flip)) * Math.PI;
    const facing = Math.cos(angle);
    const squeeze = Math.max(0.04, Math.abs(facing));
    const motion = Math.sin(Math.PI * flip);
    const y = params.y - motion * params.hop;
    const tone = parseColor(facing >= 0 ? params.color : params.backColor);
    const shine = Math.sin(angle) * 0.5;
    getHeartMask(mask, { x: WIDTH / 2, y, size: params.size });
    for (let py = 0; py < HEIGHT; py++) {
      for (let px = 0; px < WIDTH; px++) {
        const local = (px + 0.5 - WIDTH / 2) / squeeze + WIDTH / 2;
        const coverage = sampleMask(mask, local, py + 0.5);
        if (coverage <= 0) {
          continue;
        }
        const across = (local - WIDTH / 2) / params.size;
        const band = Math.exp(-(((across - shine) / 0.12) ** 2)) * (1 - squeeze);
        const shade = mix(scale(tone, 0.55 + 0.45 * squeeze), WHITE, band * 0.7);
        setRgbaPixel(image, px, py, scale(shade, coverage));
      }
    }
    if (motion > 0.05) {
      const streak = mix(tone, WHITE, 0.5);
      const reach = (params.size / 2) * squeeze + 3;
      for (const side of [-1, 1]) {
        for (const offset of [-8, 0, 8]) {
          addLine(
            image,
            [WIDTH / 2 + side * reach, y + offset],
            [WIDTH / 2 + side * (reach + 7 * motion), y + offset],
            streak,
            motion,
          );
        }
      }
    }
  },
});

const WARP_SEED = hashSeed(HEART_SEED, 0xb6);

function getWarpPoint(angle: number, spread: number, depth: number): [number, number] {
  return [
    WIDTH / 2 + Math.cos(angle) * spread * (6 / depth),
    HEIGHT / 2 + Math.sin(angle) * spread * (6 / depth),
  ];
}

export const heartWarp = defineEffect({
  id: "heart-warp",
  name: "Heart warp",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default("#ff2a6d"),
    every: z.number().min(0.25).max(4).default(1),
    count: z.number().int().min(10).max(80).default(44),
    speed: z.number().min(0).max(2).multipleOf(0.5).default(1),
    surge: z.number().int().min(0).max(3).default(1),
  }),
  render(image, { params, beat }) {
    fillRgbaImage(image, BLACK);
    const color = parseColor(params.color);
    const accents = getAccents(color);
    const { kick } = getBeatKick(beat, params.every);
    const getTravel = (at: number): number => {
      const pulse = at / params.every;
      const surge = Math.floor(pulse) + easings.easeOutCubic(getCycle(pulse));
      return 0.25 * (params.speed * at + params.surge * surge);
    };
    const travel = getTravel(beat);
    const trail = travel - getTravel(beat - 0.08);
    const hearts = Array.from({ length: params.count }, (_, index) => {
      const random = createRandom(hashSeed(WARP_SEED, index));
      const angle = random() * TAU;
      const spread = getRandomBetween(random, 0.4, 1);
      const rate = random() < 0.5 ? 1 : 2;
      const depth = 1 - getCycle(travel * rate + random());
      return { index, angle, spread, rate, depth };
    }).toSorted((a, b) => b.depth - a.depth);
    for (const { index, angle, spread, rate, depth } of hearts) {
      if (depth < 0.08) {
        continue;
      }
      const amount = clamp((1 - depth) * 1.6);
      const tone = mix(accents[index % accents.length] ?? color, WHITE, 0.3 * kick);
      const [x, y] = getWarpPoint(angle, spread, depth);
      const behind = Math.min(1, depth + trail * rate);
      if (trail * rate > 0.01) {
        addLine(image, getWarpPoint(angle, spread, behind), [x, y], tone, amount * 0.6);
      }
      const size = Math.min(12, 1.1 / depth);
      if (size < 3) {
        addDot(image, x, y, tone, amount);
        continue;
      }
      drawHeart(image, { x, y, size, color: scale(tone, amount) });
    }
  },
});
