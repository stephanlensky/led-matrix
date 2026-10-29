import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { type Color, HEIGHT, type RgbaImage, WIDTH } from "../frame.ts";
import {
  type Raster,
  type Rotation,
  type Vector,
  addEllipsoid,
  createMesh,
  createRaster,
  getRotation,
  resolveRaster,
  setRasterSample,
} from "../mesh.ts";
import { createRandom, getRandomBetween, hashSeed } from "../random.ts";
import { TAU, catIds, furParams, getCoat, toRadians } from "./cat-duo.ts";
import { getCycle } from "./cat-dance.ts";
import { drawLaptop, getEqualizerScreen, getHeartScreen } from "./cat-laptop-props.ts";
import { drawEyes, eyeStyles, getCatFace, getEyelessCoat } from "./cat-face.ts";
import { drawFloatingHearts } from "./heart-particles.ts";
import {
  type CatPlacement,
  type CatPose,
  SIT,
  TUCK,
  UNSIT,
  drawCat,
  drawCatProp,
  getCatOffset,
  getCatPoint,
  mix,
  scale,
} from "./cat-model.ts";

const VIEW_PITCH = toRadians(14);
const CAT_YAW = toRadians(-55);
const LAPTOP_YAW = toRadians(48);
const CAT_POSITION: Vector = [0.95, 0.25, -0.15];
const LAPTOP_POSITION: Vector = [-0.85, 0, 0.2];
const DESK_Y = 50;
const DESK_DEPTH = -40;
const NOTE_SEED = 0x2073;
const NOTE_LIFETIME = 2.2;
const BAR_COUNT = 5;
const CUP: Vector = [0.5, 0.6, 0.66];
const DESK: Color = [74, 44, 30];
const WHITE: Color = [255, 255, 255];
const NOTE_COLORS: Color[] = [
  [255, 80, 160],
  [255, 214, 60],
  [80, 230, 255],
  [120, 255, 110],
];
const NOTE_SPRITES = [
  ["..#..", "..##.", "..#.#", "..#..", "###..", "###.."],
  [".#####", ".#####", ".#...#", ".#...#", "##..##", "##..##"],
] as const;

type HeadphonePart = "band" | "cup" | "pad";

function createHeadphonesMesh() {
  const mesh = createMesh<HeadphonePart>();
  const segments = 9;
  for (let index = 0; index <= segments; index++) {
    const angle = Math.PI * (index / segments);
    addEllipsoid(
      mesh,
      [Math.cos(angle) * 0.52, 0.66 + Math.sin(angle) * 0.5, 0.48],
      [0.1, 0.1, 0.1],
      "band",
      4,
      6,
    );
  }
  for (const side of [-1, 1]) {
    addEllipsoid(mesh, [side * CUP[0], CUP[1], CUP[2]], [0.12, 0.22, 0.22], "cup", 6, 10);
    addEllipsoid(mesh, [side * (CUP[0] + 0.1), CUP[1], CUP[2]], [0.04, 0.13, 0.13], "pad", 4, 8);
  }
  return mesh;
}

const headphonesMesh = createHeadphonesMesh();

function getHeadphonesColor(color: Color) {
  return (part: HeadphonePart, _position: Vector, shade: number): Color =>
    part === "pad" ? scale(mix(color, WHITE, 0.6), shade) : scale(color, shade);
}

export function getLevels(beat: number): number[] {
  const index = Math.floor(beat * 2);
  const since = getCycle(beat * 2);
  return Array.from({ length: BAR_COUNT }, (_, bar) => {
    const random = createRandom(hashSeed(NOTE_SEED, index, bar));
    const peak = getRandomBetween(random, 0.45, 1);
    return 0.15 + (peak - 0.15) * Math.exp(-since * 2.5);
  });
}

function getPose(phase: number, beat: number): CatPose {
  const nod = Math.exp(-phase * 5);
  const tap = Math.floor(beat) % 2 === 0 ? 1 : -1;
  const sway = Math.sin(beat * Math.PI);
  return {
    head: (vector) =>
      UNSIT(getRotation(toRadians(-5 + 25 * nod), toRadians(25), toRadians(12 * sway))(vector)),
    frontLeftLeg: getRotation(toRadians(-80 - 25 * Math.max(0, tap) * nod), 0, toRadians(-12)),
    frontRightLeg: getRotation(toRadians(-80 - 25 * Math.max(0, -tap) * nod), 0, toRadians(12)),
    backLeftLeg: TUCK,
    backRightLeg: TUCK,
    tail: getRotation(toRadians(60), toRadians(30 * sway), 0),
  };
}

export function getSquashedRotation(rotate: Rotation, squash: number, groundY: number): Rotation {
  const sideways = 1 + squash * 0.6;
  return ([x, y, depth]) =>
    rotate([x * sideways, groundY + (y - groundY) * (1 - squash), depth * sideways]);
}

export const deskStyles = ["fill", "edge"] as const;

export function fillDesk(
  raster: Raster,
  top: number,
  style: (typeof deskStyles)[number] = "fill",
  color: Color = DESK,
): void {
  const { samples, width, height } = raster;
  const edge = Math.round(top * samples);
  const bottom = style === "fill" ? height : edge + samples;
  for (let y = Math.max(0, edge); y < bottom; y++) {
    const shade = scale(color, y < edge + samples ? 1.3 : 0.75);
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      raster.depth[index] = DESK_DEPTH;
      setRasterSample(raster, index, shade);
    }
  }
}

export function addGlow(
  image: RgbaImage,
  x: number,
  y: number,
  radius: number,
  color: Color,
): void {
  for (let py = Math.floor(y - radius); py <= y + radius; py++) {
    for (let px = Math.floor(x - radius); px <= x + radius; px++) {
      if (px < 0 || py < 0 || px >= WIDTH || py >= HEIGHT) {
        continue;
      }
      const amount = 1 - Math.hypot(px + 0.5 - x, (py + 0.5 - y) * 1.6) / radius;
      if (amount <= 0) {
        continue;
      }
      const offset = (py * WIDTH + px) * 4;
      for (const [channel, value] of color.entries()) {
        image[offset + channel] = Math.min(255, (image[offset + channel] ?? 0) + value * amount);
      }
      image[offset + 3] = 255;
    }
  }
}

function drawNote(image: RgbaImage, x: number, y: number, sprite: number, color: Color): void {
  const rows = NOTE_SPRITES[sprite] ?? NOTE_SPRITES[0];
  for (const [row, line] of rows.entries()) {
    for (let column = 0; column < line.length; column++) {
      const px = Math.round(x) + column - 2;
      const py = Math.round(y) + row - 5;
      if (line[column] !== "#" || px < 0 || py < 0 || px >= WIDTH || py >= HEIGHT) {
        continue;
      }
      const offset = (py * WIDTH + px) * 4;
      image[offset] = color[0];
      image[offset + 1] = color[1];
      image[offset + 2] = color[2];
      image[offset + 3] = 255;
    }
  }
}

function drawNotes(image: RgbaImage, beat: number, every: number, [x, y]: Vector): void {
  const pulse = beat / every;
  const newest = Math.floor(pulse);
  const count = Math.ceil(NOTE_LIFETIME / every);
  for (let index = newest - count; index <= newest; index++) {
    const age = (pulse - index) * every;
    if (age < 0 || age >= NOTE_LIFETIME) {
      continue;
    }
    const random = createRandom(hashSeed(NOTE_SEED, index));
    const life = age / NOTE_LIFETIME;
    const drift =
      index % 3 === 2 ? getRandomBetween(random, -4, -1) : getRandomBetween(random, 3, 7);
    const sway = Math.sin(age * Math.PI * 1.5 + random() * TAU) * 1.5;
    const color = NOTE_COLORS[((index % 4) + 4) % 4] ?? WHITE;
    const pop = Math.exp(-age * 10);
    const fade = Math.min(1, (1 - life) * 3);
    drawNote(
      image,
      x + 4 + drift * life + sway,
      y - 2 - 26 * life ** 0.8,
      random() < 0.5 ? 0 : 1,
      scale(mix(color, WHITE, pop), fade),
    );
  }
}

export const catLaptop = defineEffect({
  id: "cat-laptop",
  name: "Cat laptop jam",
  kind: "pixel",
  params: z.object({
    ...furParams,
    cat: z.enum(catIds).default("black"),
    headphonesColor: colorSchema.default("#ff3c8c"),
    glowColor: colorSchema.default("#3070ff"),
    barColor: colorSchema.default("#40ffa0"),
    peakColor: colorSchema.default("#ffe040"),
    every: z.number().min(0.25).max(4).default(1),
    size: z.number().min(6).max(16).default(12),
    hop: z.number().min(0).max(6).default(4),
    zoom: z.number().min(0).max(0.4).default(0.08),
    eyes: z.enum(eyeStyles).default("open"),
    heartColor: colorSchema.default("#ff2a6d"),
    screen: z.enum(["equalizer", "heart"]).default("equalizer"),
    particles: z.enum(["notes", "hearts"]).default("notes"),
    desk: z.enum(deskStyles).default("fill"),
  }),
  render(image, { params, beat }) {
    const coat = params.eyes === "open" ? getCoat(params) : getEyelessCoat(getCoat(params));
    const heart = parseColor(params.heartColor);
    const glow = parseColor(params.glowColor);
    const pulse = beat / params.every;
    const phase = getCycle(pulse);
    const since = phase * params.every;
    const kick = Math.exp(-since * 7);
    const hop = params.hop * 4 * phase * (1 - phase);
    const squash = 0.12 * Math.exp(-since * 9) * Math.cos(since * 25);
    const size = params.size * (1 + params.zoom * kick);
    const view = getRotation(VIEW_PITCH, 0, 0);
    const centerX = WIDTH / 2;
    const raster = createRaster();
    fillDesk(raster, DESK_Y, params.desk);

    const [laptopX, laptopY, laptopDepth] = getCatOffset(view, LAPTOP_POSITION, size);
    const laptopPlacement: CatPlacement = {
      x: centerX + laptopX,
      y: DESK_Y + laptopY - size * 0.25,
      size,
      rotate: getRotation(VIEW_PITCH, LAPTOP_YAW, 0),
      depth: laptopDepth,
    };
    drawLaptop(raster, laptopPlacement, {
      getScreenColor:
        params.screen === "heart"
          ? getHeartScreen(glow, heart, kick)
          : getEqualizerScreen(
              getLevels(beat),
              mix(glow, WHITE, 0.3 * kick),
              parseColor(params.barColor),
              parseColor(params.peakColor),
            ),
    });

    const [catX, catY, catDepth] = getCatOffset(view, CAT_POSITION, size);
    const seated = getRotation(VIEW_PITCH, CAT_YAW, 0);
    const catPlacement: CatPlacement = {
      x: centerX + catX,
      y: DESK_Y + catY - size * 0.25 - hop,
      size,
      rotate: getSquashedRotation((vector) => seated(SIT(vector)), squash, -0.8),
      depth: catDepth,
      pose: getPose(phase, pulse),
    };
    drawCat(raster, catPlacement, coat);
    drawCatProp(
      raster,
      catPlacement,
      headphonesMesh,
      getHeadphonesColor(parseColor(params.headphonesColor)),
      "head",
    );
    resolveRaster(raster, image);
    const [screenX, screenY] = getCatOffset(
      getRotation(VIEW_PITCH, LAPTOP_YAW, 0),
      [0, 0.7, 0],
      size,
    );
    addGlow(
      image,
      laptopPlacement.x + screenX,
      laptopPlacement.y + screenY,
      size * 1.4,
      scale(glow, 0.12 + 0.12 * kick),
    );
    if (params.eyes !== "open") {
      drawEyes(
        image,
        getCatFace(catPlacement),
        params.eyes,
        parseColor(params.cat === "tabby" ? params.tabbyEyeColor : params.eyeColor),
        heart,
        1 + 0.3 * kick,
        size * 0.32,
      );
    }
    const [cupX, cupY] = getCatPoint(catPlacement, [CUP[0], CUP[1], CUP[2]], "head");
    if (params.particles === "hearts") {
      drawFloatingHearts(image, pulse, [cupX + 4, cupY], [heart, mix(heart, WHITE, 0.5)], 6, {
        rise: 30,
        sizes: [4, 7],
      });
    } else {
      drawNotes(image, beat, params.every, [cupX, cupY, 0]);
    }
  },
});
