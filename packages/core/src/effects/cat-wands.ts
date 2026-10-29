import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { type Color, HEIGHT, type RgbaImage, WIDTH } from "../frame.ts";
import { easings } from "../keyframes.ts";
import {
  type Raster,
  type Vector,
  addEllipsoid,
  createMesh,
  createRaster,
  getRotation,
  resolveRaster,
} from "../mesh.ts";
import { createRandom, getRandomBetween, hashSeed } from "../random.ts";
import { TAU, clamp, furParams, getCoats, toRadians } from "./cat-duo.ts";
import { getCycle } from "./cat-dance.ts";
import {
  type CatPlacement,
  type CatPose,
  type Coat,
  drawCat,
  drawCatProp,
  getCatPoint,
  mix,
  scale,
  setMixedColor,
  setScaledColor,
} from "./cat-model.ts";

type WandPart = "stick" | "tip";

type Wizard = { x: number; side: number; coat: Coat; magic: Color };

const PUSHES = [5, -2, 7, 1, -4, 3, -7, -1];
const STAND = getRotation(toRadians(-62), 0, 0);
const UNSTAND = toRadians(62);
const VIEW_PITCH = toRadians(8);
const VIEW_YAW = toRadians(58);
const PAW_Y = -0.92;
const WAND_LENGTH = 0.42;
const SPARK_SEED = 0x3a9d;
const SPARK_COUNT = 14;
const WHITE: Color = [255, 255, 255];
const STICK: Color = [120, 70, 34];

function getWandTip(paw: number): Vector {
  return [paw * 0.3, PAW_Y - WAND_LENGTH - 0.08, 0.35];
}

function getWandMesh(paw: number) {
  const mesh = createMesh<WandPart>();
  const steps = 4;
  for (let step = 0; step <= steps; step++) {
    const y = PAW_Y + 0.1 - (WAND_LENGTH * step) / steps;
    addEllipsoid(mesh, [paw * 0.3, y, 0.35], [0.07, 0.12, 0.07], "stick", 4, 6);
  }
  addEllipsoid(mesh, getWandTip(paw), [0.15, 0.15, 0.15], "tip");
  return mesh;
}

const leftWandMesh = getWandMesh(-1);
const rightWandMesh = getWandMesh(1);

export function getOvershoot(t: number): number {
  return 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;
}

function getPush(pulse: number): { offset: number; push: number } {
  const index = Math.floor(pulse);
  const count = PUSHES.length;
  const previous = PUSHES[(((index - 1) % count) + count) % count] ?? 0;
  const current = PUSHES[((index % count) + count) % count] ?? 0;
  const shove = getOvershoot(clamp(getCycle(pulse) / 0.3));
  return { offset: previous + (current - previous) * shove, push: Math.sign(current - previous) };
}

function getWizardPose(lean: number, phase: number, side: number): CatPose {
  const pump = Math.sin(phase * Math.PI);
  const aim = getRotation(toRadians(-28 - 8 * lean), 0, 0);
  const wave = getRotation(toRadians(-130 + 35 * pump), 0, toRadians(-side * 25));
  const stand = getRotation(UNSTAND + toRadians(-14 * lean), 0, 0);
  return {
    head: getRotation(UNSTAND + toRadians(-8 + 12 * lean), 0, toRadians(-side * 10 * pump)),
    tail: getRotation(toRadians(55), 0, toRadians(side * 30 * Math.sin(phase * TAU))),
    frontLeftLeg: side === 1 ? aim : wave,
    frontRightLeg: side === 1 ? wave : aim,
    backLeftLeg: stand,
    backRightLeg: stand,
  };
}

type Stance = { x: number; y: number; size: number; lean: number; phase: number; kick: number };

function drawWizard(
  raster: Raster,
  { side, coat, magic }: Wizard,
  { x, y, size, lean, phase, kick }: Stance,
): Vector {
  const view = getRotation(VIEW_PITCH, side * VIEW_YAW, toRadians(-side * 5 * lean));
  const placement: CatPlacement = {
    x,
    y,
    size,
    rotate: (vector) => view(STAND(vector)),
    pose: getWizardPose(lean, phase, side),
    flash: 0.1 * kick,
    flashColor: magic,
  };
  const paw = -side;
  const joint = paw === -1 ? "frontLeftLeg" : "frontRightLeg";
  drawCat(raster, placement, coat);
  drawCatProp(
    raster,
    placement,
    paw === -1 ? leftWandMesh : rightWandMesh,
    (part, _position, shade, out) =>
      part === "tip" ? setMixedColor(out, magic, WHITE, 0.5) : setScaledColor(out, STICK, shade),
    joint,
  );
  return getCatPoint(placement, getWandTip(paw), joint);
}

function addPixel(image: RgbaImage, x: number, y: number, [r, g, b]: Color): void {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) {
    return;
  }
  const offset = (Math.floor(y) * WIDTH + Math.floor(x)) * 4;
  const alpha = (image[offset + 3] ?? 0) / 255;
  image[offset] = (image[offset] ?? 0) * alpha + r;
  image[offset + 1] = (image[offset + 1] ?? 0) * alpha + g;
  image[offset + 2] = (image[offset + 2] ?? 0) * alpha + b;
  image[offset + 3] = 255;
}

type Beam = { start: Vector; end: Vector; color: Color; width: number };

function drawBeam(image: RgbaImage, { start, end, color, width }: Beam, beat: number): void {
  const [startX, startY] = start;
  const [endX, endY] = end;
  const direction = Math.sign(endX - startX);
  for (let x = Math.round(startX); x !== Math.round(endX) + direction; x += direction) {
    const along = clamp((x + 0.5 - startX) / (endX - startX));
    const envelope = Math.sin(along * Math.PI);
    const center =
      startY + (endY - startY) * along + Math.sin(x * 0.7 - beat * TAU * 2) * 0.7 * envelope;
    const half = width * (0.45 + 0.55 * Math.min(1, along * 4));
    const ripple = 0.75 + 0.25 * Math.sin((x - startX) * direction * 0.9 - beat * TAU * 3);
    for (let y = Math.floor(center - half - 4); y <= Math.ceil(center + half + 4); y++) {
      const distance = Math.abs(y + 0.5 - center);
      const core = clamp(half + 0.5 - distance);
      const glow = distance > half ? 0.4 * Math.exp(-(distance - half) / 1.1) : 0;
      const heat = clamp(1 - distance / Math.max(0.6, half)) * 0.75;
      const shade = mix(color, WHITE, heat * core);
      addPixel(image, x, y, scale(shade, (core + glow) * ripple));
    }
  }
}

function drawClash(
  image: RgbaImage,
  [centerX, centerY]: readonly [number, number],
  colors: readonly [Color, Color],
  radius: number,
  beat: number,
): void {
  const middle = mix(mix(colors[0], colors[1], 0.5), WHITE, 0.35);
  const reach = Math.ceil(radius * 1.5 + 5);
  for (let y = Math.floor(centerY - reach); y <= centerY + reach; y++) {
    for (let x = Math.floor(centerX - reach); x <= centerX + reach; x++) {
      const dx = x + 0.5 - centerX;
      const dy = y + 0.5 - centerY;
      const angle = Math.atan2(dy, dx);
      const edge =
        radius *
        (1 + 0.28 * Math.sin(5 * angle + beat * 13) + 0.18 * Math.sin(9 * angle - beat * 21));
      const distance = Math.hypot(dx, dy);
      const side = dx < 0 ? colors[0] : colors[1];
      if (distance < edge) {
        const depth = distance / edge;
        addPixel(image, x, y, mix(WHITE, mix(middle, side, depth * 0.6), depth ** 1.5));
      } else {
        addPixel(
          image,
          x,
          y,
          scale(mix(middle, side, 0.6), 0.5 * Math.exp(-(distance - edge) / 1.6)),
        );
      }
    }
  }
}

function drawSparks(
  image: RgbaImage,
  [centerX, centerY]: readonly [number, number],
  colors: readonly [Color, Color],
  pulse: number,
  power: number,
): void {
  const index = Math.floor(pulse);
  const life = getCycle(pulse);
  const random = createRandom(hashSeed(SPARK_SEED, index));
  const fade = (1 - life) ** 1.5;
  for (let spark = 0; spark < SPARK_COUNT; spark++) {
    const angle = getRandomBetween(random, 0, TAU);
    const speed = getRandomBetween(random, 8, 18) * power;
    const color = colors[random() < 0.5 ? 0 : 1];
    const distance = speed * easings.easeOutCubic(Math.min(1, life * 1.6));
    const x = centerX + Math.cos(angle) * distance;
    const y = centerY + Math.sin(angle) * distance + life * life * 6;
    addPixel(image, x, y, scale(mix(color, WHITE, 0.4), fade));
  }
  const crackle = createRandom(hashSeed(SPARK_SEED, index, Math.floor(life * 16)));
  for (let spark = 0; spark < 5; spark++) {
    const angle = getRandomBetween(crackle, 0, TAU);
    const distance = getRandomBetween(crackle, 3, 8);
    const color = colors[crackle() < 0.5 ? 0 : 1];
    addPixel(
      image,
      centerX + Math.cos(angle) * distance,
      centerY + Math.sin(angle) * distance,
      color,
    );
  }
}

export const catWands = defineEffect({
  id: "cat-wands",
  name: "Cat wand duel",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    ...furParams,
    tabbyMagicColor: colorSchema.default("#ff5a1e"),
    magicColor: colorSchema.default("#3cff50"),
    every: z.number().min(0.25).max(4).default(1),
    size: z.number().min(5).max(12).default(8),
    shake: z.number().min(0).max(4).default(1),
  }),
  render(image, { params, beat }) {
    const [tabbyCoat, blackCoat] = getCoats(params);
    const colors = [parseColor(params.tabbyMagicColor), parseColor(params.magicColor)] as const;
    const pulse = beat / params.every;
    const index = Math.floor(pulse);
    const since = getCycle(pulse) * params.every;
    const isBig = ((index % 4) + 4) % 4 === 0;
    const power = isBig ? 1.4 : 1;
    const kick = Math.exp(-since * 6) * power;
    const { offset, push } = getPush(pulse);
    const random = createRandom(hashSeed(SPARK_SEED, index, Math.floor(since * 24)));
    const amplitude = params.shake * Math.exp(-since * 6) * (isBig ? 1.5 : 0.6);
    const shakeX = getRandomBetween(random, -1, 1) * amplitude;
    const shakeY = getRandomBetween(random, -1, 1) * amplitude;
    const wizards: Wizard[] = [
      { x: 9, side: 1, coat: tabbyCoat, magic: colors[0] },
      { x: WIDTH - 9, side: -1, coat: blackCoat, magic: colors[1] },
    ];
    const raster = createRaster();
    const casts = wizards.map((wizard) => {
      const isWinning = push === wizard.side;
      const lean = (isWinning ? 1 : -0.6) * kick;
      const tip = drawWizard(raster, wizard, {
        x: wizard.x + shakeX + wizard.side * lean * 1.2,
        y: HEIGHT / 2 + 4 + shakeY,
        size: params.size,
        lean,
        phase: getCycle(pulse),
        kick,
      });
      return { tip, magic: wizard.magic, width: 1.3 + kick * (isWinning ? 1.6 : 0.8) };
    });
    resolveRaster(raster, image);
    const clashX = WIDTH / 2 + offset + shakeX;
    const clashY =
      casts.reduce((sum, { tip }) => sum + tip[1], 0) / casts.length +
      Math.sin(beat * TAU * 0.5) * 1.2;
    for (const { tip, magic, width } of casts) {
      drawBeam(image, { start: tip, end: [clashX, clashY, 0], color: magic, width }, beat);
    }
    drawClash(image, [clashX, clashY], colors, 2.2 + 3 * kick, beat);
    drawSparks(image, [clashX, clashY], colors, pulse, power);
  },
});
