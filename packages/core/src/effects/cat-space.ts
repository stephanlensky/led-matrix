import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { type Color, HEIGHT, type RgbaImage, WIDTH, fillRgbaImage } from "../frame.ts";
import {
  type Vector,
  addEllipsoid,
  compositeRaster,
  createMesh,
  createRaster,
  getRotation,
} from "../mesh.ts";
import { createRandom, getRandomBetween, hashSeed } from "../random.ts";
import { TAU, furParams, getCoats, toRadians } from "./cat-duo.ts";
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
} from "./cat-model.ts";

type Astronaut = {
  x: number;
  y: number;
  coat: Coat;
  spin: number;
  roll: number;
  phase: number;
};

type Star = { x: number; y: number; brightness: number; twinkles: number; phase: number };

const LOOP_BEATS = 32;
const STAR_SEED = 0x57a2;
const HELMET_CENTER: Vector = [0, 0.74, 0.72];
const HELMET_RADIUS = 0.8;
const CAMERA_DISTANCE = 6;
const WHITE: Color = [255, 255, 255];
const COLLAR: Color = [200, 204, 214];
const STAR: Color = [210, 225, 255];

const collarMesh = createMesh<"collar">();
addEllipsoid(collarMesh, [0, 0.02, 0.58], [0.44, 0.09, 0.44], "collar", 4, 14);

function getStars(count: number, layer: number): Star[] {
  const random = createRandom(hashSeed(STAR_SEED, layer));
  return Array.from({ length: count }, () => ({
    x: random() * WIDTH,
    y: random() * HEIGHT,
    brightness: getRandomBetween(random, 0.25, 0.7),
    twinkles: Math.floor(getRandomBetween(random, 3, 9)),
    phase: random(),
  }));
}

const starLayers = [
  { stars: getStars(44, 0), laps: 1, glow: 0.7 },
  { stars: getStars(10, 1), laps: 2, glow: 1 },
];

function addPixel(image: RgbaImage, x: number, y: number, color: Color, amount: number): void {
  const px = Math.floor(x);
  const py = Math.floor(y);
  if (px < 0 || py < 0 || px >= WIDTH || py >= HEIGHT || amount <= 0) {
    return;
  }
  const offset = (py * WIDTH + px) * 4;
  const below: Color = [image[offset] ?? 0, image[offset + 1] ?? 0, image[offset + 2] ?? 0];
  const [r, g, b] = mix(below, color, Math.min(1, amount));
  image[offset] = r;
  image[offset + 1] = g;
  image[offset + 2] = b;
}

export function drawStars(image: RgbaImage, beat: number, every: number, twinkle: number): void {
  const pulse = beat / every;
  const since = getCycle(pulse) * every;
  const flash = Math.exp(-since * 5) * twinkle;
  for (const [layer, { stars, laps, glow }] of starLayers.entries()) {
    const drift = (beat / LOOP_BEATS) * laps * WIDTH;
    const chosen = createRandom(hashSeed(STAR_SEED, layer, Math.floor(pulse)));
    for (const star of stars) {
      const x = (((star.x - drift) % WIDTH) + WIDTH) % WIDTH;
      const shimmer = 0.5 + 0.5 * Math.sin((beat / LOOP_BEATS + star.phase) * star.twinkles * TAU);
      const boost = chosen() < 0.3 ? flash : 0;
      const brightness = glow * (star.brightness * (0.45 + 0.55 * shimmer) + boost);
      addPixel(image, x, star.y, STAR, brightness);
      if (layer === 1 || boost > 0.4) {
        const arm = brightness * (layer === 1 ? 0.35 : 0.25);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          addPixel(image, x + dx, star.y + dy, STAR, arm);
        }
      }
    }
  }
}

function drawHelmet(
  image: RgbaImage,
  [centerX, centerY]: Vector,
  radius: number,
  glass: Color,
  shine: number,
): void {
  const reach = Math.ceil(radius + 2);
  for (let y = Math.floor(centerY - reach); y <= centerY + reach; y++) {
    for (let x = Math.floor(centerX - reach); x <= centerX + reach; x++) {
      const dx = x + 0.5 - centerX;
      const dy = y + 0.5 - centerY;
      const distance = Math.hypot(dx, dy);
      const edge = 1 - Math.abs(distance - radius) / 0.9;
      const light = 0.75 + 0.35 * ((-dx - dy) / Math.max(1, distance)) * Math.SQRT1_2;
      if (edge > 0) {
        addPixel(image, x, y, mix(glass, WHITE, 0.25 * shine), edge * light * (0.6 + 0.3 * shine));
      } else if (distance < radius) {
        addPixel(image, x, y, glass, 0.12 + 0.1 * (distance / radius) ** 4);
      }
    }
  }
  for (const step of [-1, 0, 1]) {
    const angle = toRadians(-135 + step * 16);
    const distance = radius * 0.68;
    addPixel(
      image,
      centerX + Math.cos(angle) * distance,
      centerY + Math.sin(angle) * distance,
      WHITE,
      (step === 0 ? 0.95 : 0.7) * (0.75 + 0.25 * shine),
    );
  }
  addPixel(image, centerX + radius * 0.45, centerY + radius * 0.55, WHITE, 0.35 + 0.3 * shine);
}

function getFloatPose(beat: number, phase: number): CatPose {
  const paddle = Math.sin((beat / 4 + phase) * TAU);
  const sway = Math.sin((beat / 8 + phase) * TAU);
  return {
    head: getRotation(toRadians(-8 + 6 * sway), toRadians(10 * sway), 0),
    frontLeftLeg: getRotation(toRadians(-40 + 25 * paddle), 0, toRadians(-35)),
    frontRightLeg: getRotation(toRadians(-40 - 25 * paddle), 0, toRadians(35)),
    backLeftLeg: getRotation(toRadians(35 - 20 * paddle), 0, toRadians(-30)),
    backRightLeg: getRotation(toRadians(35 + 20 * paddle), 0, toRadians(30)),
    tail: getRotation(toRadians(20 + 25 * sway), toRadians(30 * paddle), 0),
  };
}

export const catSpace = defineEffect({
  id: "cat-space",
  name: "Cat astronauts",
  kind: "pixel",
  params: z.object({
    ...furParams,
    glassColor: colorSchema.default("#a0dcff"),
    spaceColor: colorSchema.default("#04030c"),
    every: z.number().min(0.25).max(4).default(1),
    size: z.number().min(5).max(12).default(7.5),
    bob: z.number().min(0).max(4).default(1.5),
    twinkle: z.number().min(0).max(1).default(0.6),
  }),
  render(image, { params, beat }) {
    const [tabbyCoat, blackCoat] = getCoats(params);
    const glass = parseColor(params.glassColor);
    fillRgbaImage(image, parseColor(params.spaceColor));
    drawStars(image, beat, params.every, params.twinkle);

    const pulse = beat / params.every;
    const shine = Math.exp(-getCycle(pulse) * params.every * 4);
    const loop = (beat / LOOP_BEATS) * TAU;
    const astronauts: Astronaut[] = [
      {
        x: 18 + 2 * Math.sin(loop),
        y: 23 + 2 * Math.sin(loop * 2),
        coat: tabbyCoat,
        spin: 1,
        roll: 1,
        phase: 0,
      },
      {
        x: 46 - 2 * Math.sin(loop),
        y: 43 - 2 * Math.sin(loop * 2 + 1),
        coat: blackCoat,
        spin: -1,
        roll: -1,
        phase: 0.5,
      },
    ];
    for (const { x, y, coat, spin, roll, phase } of astronauts) {
      const bob = params.bob * Math.cos((pulse / 2 + phase) * TAU);
      const placement: CatPlacement = {
        x,
        y: y + bob,
        size: params.size,
        rotate: getRotation(
          toRadians(15 + 10 * Math.sin(loop + phase * TAU)),
          spin * loop + toRadians(25),
          roll * toRadians(25 * Math.sin(loop * 2 + phase * TAU)),
        ),
        pose: getFloatPose(beat, phase),
      };
      const raster = createRaster();
      drawCat(raster, placement, coat);
      drawCatProp(
        raster,
        placement,
        collarMesh,
        (_part, _position, shade) => scale(COLLAR, shade),
        "head",
      );
      compositeRaster(raster, image);
      const center = getCatPoint(placement, HELMET_CENTER, "head");
      const radius =
        (params.size * HELMET_RADIUS * CAMERA_DISTANCE) / (CAMERA_DISTANCE - center[2]);
      drawHelmet(image, center, radius, glass, shine);
    }
  },
});
