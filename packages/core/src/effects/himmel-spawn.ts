import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { type Color, HEIGHT, WIDTH, setRgbaPixel } from "../frame.ts";
import { easings } from "../keyframes.ts";
import {
  type Raster,
  compose,
  compositeRaster,
  createRaster,
  fillRasterCircle,
  getRotation,
} from "../mesh.ts";
import { createRandom, getRandomBetween, hashSeed } from "../random.ts";
import { TAU, clamp, getSpawnVisibility, toRadians } from "./cat-duo.ts";
import { getCycle } from "./cat-dance.ts";
import { mix } from "./cat-model.ts";
import { getOvershoot } from "./cat-wands.ts";
import { drawHero } from "./frieren-model.ts";
import { hunterMoveFrames } from "./hunter-dance.ts";

const PARTICLE_SEED = 0x41e;
const SPARK_SEED = 0x41f;
const CHARGE_START = 1.5;
const BURST = 8;
const LANDED = 12;
const SPIN_TURNS = 3;
const REST_ARM = 20;
const WHITE: Color = [255, 255, 255];

function getSpan(beat: number, start: number, end: number): number {
  return clamp((beat - start) / (end - start));
}

function getScaled([r, g, b]: Color, amount: number): Color {
  return [r * amount, g * amount, b * amount];
}

function getArm(side: number, degrees: number) {
  return getRotation(0, 0, toRadians(side * degrees));
}

function drawChargeParticles(
  raster: Raster,
  centerX: number,
  centerY: number,
  beat: number,
  color: Color,
): void {
  const charge = getSpan(beat, CHARGE_START, BURST);
  if (charge <= 0 || charge >= 1) {
    return;
  }
  const count = Math.round(6 + 26 * charge);
  for (let particle = 0; particle < count; particle++) {
    const random = createRandom(hashSeed(PARTICLE_SEED, particle));
    const angle = random() * TAU;
    const start = getRandomBetween(random, 24, 40);
    const cycle = getCycle(beat / getRandomBetween(random, 1.2, 2) + random());
    const fade = Math.sin(cycle * Math.PI) * Math.min(1, charge * 3);
    for (let trail = 0; trail < 3; trail++) {
      const distance = start * (1 - easings.easeInQuad(clamp(cycle - trail * 0.04)));
      fillRasterCircle(
        raster,
        centerX + Math.cos(angle) * distance,
        centerY + Math.sin(angle) * distance,
        trail === 0 ? 0.7 : 0.5,
        getScaled(trail === 0 ? mix(color, WHITE, 0.4) : color, fade * (1 - trail * 0.3)),
      );
    }
  }
}

function drawOrb(raster: Raster, x: number, y: number, beat: number, color: Color): void {
  const grow = easings.easeInQuad(getSpan(beat, 3, BURST - 0.5));
  const implode = easings.easeInCubic(getSpan(beat, BURST - 0.5, BURST));
  if (grow <= 0 || implode >= 1) {
    return;
  }
  const throb = Math.exp(-getCycle(beat) * 6);
  const radius = (1 + 4 * grow + 0.8 * throb * grow) * (1 - implode);
  fillRasterCircle(raster, x, y, radius + 1, getScaled(color, 0.9));
  fillRasterCircle(raster, x, y, radius, mix(color, WHITE, 0.5 + 0.3 * throb));
  fillRasterCircle(raster, x, y, radius * 0.5, WHITE);
}

function drawBurstRing(raster: Raster, x: number, y: number, beat: number, color: Color): void {
  const life = getSpan(beat, BURST, BURST + 2);
  if (life <= 0 || life >= 1) {
    return;
  }
  const radius = 3 + 34 * easings.easeOutCubic(life);
  const fade = (1 - life) ** 1.5;
  const dots = 32;
  for (let dot = 0; dot < dots; dot++) {
    const angle = (dot / dots) * TAU + life;
    fillRasterCircle(
      raster,
      x + Math.cos(angle) * radius,
      y + Math.sin(angle) * radius,
      0.6 + 0.5 * fade,
      getScaled(mix(color, WHITE, 0.5 * fade), fade),
    );
  }
}

function drawSparks(raster: Raster, x: number, y: number, beat: number, color: Color): void {
  const life = getSpan(beat, BURST, LANDED);
  if (life <= 0 || life >= 1) {
    return;
  }
  for (let spark = 0; spark < 18; spark++) {
    const random = createRandom(hashSeed(SPARK_SEED, spark));
    const angle = random() * TAU;
    const speed = getRandomBetween(random, 10, 30);
    const delay = getRandomBetween(random, 0, 0.15);
    const age = clamp((life - delay) / 0.5);
    if (age <= 0 || age >= 1) {
      continue;
    }
    const distance = speed * easings.easeOutCubic(age);
    const twinkle = 0.6 + 0.4 * Math.sin(beat * 9 + spark);
    fillRasterCircle(
      raster,
      x + Math.cos(angle) * distance,
      y + Math.sin(angle) * distance + age * age * 6,
      0.6,
      getScaled(mix(color, WHITE, 0.6), (1 - age) * twinkle),
    );
  }
}

function drawFlash(image: Uint8ClampedArray, beat: number, color: Color): void {
  const life = getSpan(beat, BURST, BURST + 0.6);
  if (life <= 0 || life >= 1) {
    return;
  }
  const flash = getScaled(mix(color, WHITE, 0.5), (1 - life) ** 3);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      setRgbaPixel(image, x, y, flash);
    }
  }
}

function getArmSpread(beat: number): number {
  const open = easings.easeOutCubic(getSpan(beat, BURST, BURST + 1));
  const settle = easings.easeInOutSine(getSpan(beat, LANDED - 1.5, LANDED));
  return REST_ARM + 60 * open * (1 - settle);
}

export const himmelSpawn = defineEffect({
  id: "himmel-spawn",
  name: "Himmel spawn",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default("#2646b4"),
    size: z.number().min(8).max(24).default(18),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const glow = mix(color, WHITE, 0.35);
    const rest = hunterMoveFrames.sway(0, { x: WIDTH / 2, phase: 0, side: -1 }, params.size);
    const centerX = rest.x;
    const centerY = rest.y - params.size * 0.35;
    drawFlash(image, beat, color);
    const raster = createRaster();
    drawChargeParticles(raster, centerX, centerY, beat, glow);
    drawOrb(raster, centerX, centerY, beat, color);
    drawBurstRing(raster, centerX, centerY, beat, glow);
    drawSparks(raster, centerX, centerY, beat, color);
    const spawn = getSpan(beat, BURST, BURST + 2.5);
    if (getSpawnVisibility(spawn)) {
      const spin = easings.easeOutCubic(getSpan(beat, BURST, LANDED));
      const grow = getOvershoot(getSpan(beat, BURST, BURST + 1.5));
      const spread = getArmSpread(beat);
      const float = (1 - easings.easeInOutSine(getSpan(beat, BURST, LANDED))) * -3;
      drawHero(raster, "himmel", {
        ...rest,
        y: rest.y + float,
        size: params.size * (0.3 + 0.7 * grow),
        rotate: compose(rest.rotate, getRotation(0, -TAU * SPIN_TURNS * (1 - spin), 0)),
        flash: 1 - easings.easeOutCubic(clamp(spawn * 1.6)),
        pose: {
          ...rest.pose,
          cape: rest.pose.hair,
          skirt: rest.pose.hips,
          leftArm: getArm(-1, spread),
          rightArm: getArm(1, spread),
        },
      });
    }
    compositeRaster(raster, image);
  },
});
