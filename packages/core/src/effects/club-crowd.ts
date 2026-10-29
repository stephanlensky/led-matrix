import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { type Color, HEIGHT, type RgbaImage, WIDTH, createRgbaImage } from "../frame.ts";
import { compose, compositeRaster, createRaster, getRotation, resolveRaster } from "../mesh.ts";
import { createRandom, getRandomBetween, hashSeed } from "../random.ts";
import { type CatId, TAU, furParams, getCoats } from "./cat-duo.ts";
import { BASE_Y as CAT_BASE_Y, type DanceMove, catMoveFrames, getCycle } from "./cat-dance.ts";
import { WHITE, drawCat, mix } from "./cat-model.ts";
import { type HeroId, drawHero } from "./frieren-model.ts";
import { blendPixel } from "./heart.ts";
import { BASE_Y, type Dancer, type HunterMove, hunterMoveFrames } from "./hunter-dance.ts";
import { type HunterId, drawHunter } from "./hunter-model.ts";
import { getPalette, paletteParams } from "./palette.ts";
import { getBeamLight, getBeams } from "./spotlights.ts";

export const crowdMoves = ["mixed", "headbang", "sway", "jump", "pump", "twist", "point"] as const;

type CrowdMove = Exclude<(typeof crowdMoves)[number], "mixed">;

type Member = {
  id: HeroId | HunterId | CatId;
  x: number;
  side: number;
  yaw: number;
  phase: number;
};

type Row = { size: number; center: number; members: readonly Member[] };

const ROWS: readonly Row[] = [
  {
    size: 8,
    center: 29,
    members: [
      { id: "zoey", x: 14, side: 1, yaw: 0.35, phase: 0.06 },
      { id: "rumi", x: 32, side: 0, yaw: 0, phase: 0 },
      { id: "mira", x: 50, side: -1, yaw: -0.35, phase: -0.07 },
    ],
  },
  {
    size: 10.5,
    center: 39,
    members: [
      { id: "frieren", x: 22, side: 1, yaw: 0.3, phase: -0.04 },
      { id: "himmel", x: 42, side: -1, yaw: -0.3, phase: 0.05 },
    ],
  },
  {
    size: 7.5,
    center: 57,
    members: [
      { id: "tabby", x: 9, side: 1, yaw: 0.9, phase: 0.03 },
      { id: "black", x: 55, side: -1, yaw: -0.2, phase: -0.03 },
    ],
  },
];

const MIXED_MOVES: readonly CrowdMove[] = ["headbang", "pump", "sway", "jump", "twist", "point"];

const CAT_MOVES: Readonly<Record<CrowdMove, DanceMove>> = {
  headbang: "headbang",
  sway: "sway",
  jump: "hop",
  pump: "paws-up",
  twist: "twist",
  point: "wiggle",
};

const FLOOR = 63;
const BALL_X = WIDTH / 2;
const BALL_Y = 4;
const BALL_RADIUS = 3.6;
const SPECK_SEED = 0xd15c0;
const GLINT_SEED = 0x6117;

function getMove(move: (typeof crowdMoves)[number], index: number, beat: number, every: number) {
  if (move !== "mixed") {
    return move;
  }
  const turn = Math.floor(beat / every);
  return MIXED_MOVES[(index * 2 + turn) % MIXED_MOVES.length] ?? "headbang";
}

function isHero(id: Member["id"]): id is HeroId {
  return id === "frieren" || id === "himmel";
}

function isCat(id: Member["id"]): id is CatId {
  return id === "tabby" || id === "black";
}

function drawLighting(
  layer: RgbaImage,
  beams: ReturnType<typeof getBeams>,
  beat: number,
  amount: number,
): void {
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const offset = (y * WIDTH + x) * 4;
      if ((layer[offset + 3] ?? 0) === 0) {
        continue;
      }
      for (const [index, beam] of beams.entries()) {
        const light =
          Math.min(1, getBeamLight(beam, x + 0.5, y + 0.5, beat, index) * 1.6) * amount * 0.35;
        if (light <= 0) {
          continue;
        }
        for (let channel = 0; channel < 3; channel++) {
          const value = layer[offset + channel] ?? 0;
          layer[offset + channel] = Math.min(255, value + (beam.color[channel] ?? 0) * light * 0.6);
        }
      }
    }
  }
}

function drawBall(image: RgbaImage, beat: number, palette: readonly Color[], kick: number): void {
  for (let y = 0; y < BALL_Y - 2; y++) {
    blendPixel(image, BALL_X, y, [90, 90, 100], 1);
  }
  const spin = beat * 0.5;
  for (let y = -4; y <= 4; y++) {
    for (let x = -4; x <= 4; x++) {
      const dx = (x + 0.5) / BALL_RADIUS;
      const dy = (y + 0.5) / BALL_RADIUS;
      const distance = dx * dx + dy * dy;
      if (distance > 1) {
        continue;
      }
      const dz = Math.sqrt(1 - distance);
      const longitude = Math.atan2(dx, dz) / TAU + spin;
      const latitude = Math.asin(dy);
      const facet = Math.floor(longitude * 10) * 7 + Math.floor(latitude * 3);
      const random = createRandom(hashSeed(GLINT_SEED, facet));
      const sparkle = getRandomBetween(random, 0, 1);
      const shade = 0.35 + 0.45 * dz + 0.4 * kick * sparkle;
      const tint = palette[Math.abs(facet) % palette.length] ?? WHITE;
      const color = mix(
        mix([200, 205, 220], tint, 0.25 * sparkle),
        WHITE,
        sparkle > 0.85 ? 0.7 : 0,
      );
      blendPixel(image, BALL_X + x, BALL_Y + y, [
        Math.min(255, color[0] * shade),
        Math.min(255, color[1] * shade),
        Math.min(255, color[2] * shade),
      ]);
    }
  }
}

function drawSpecks(
  image: RgbaImage,
  beat: number,
  palette: readonly Color[],
  count: number,
): void {
  const random = createRandom(hashSeed(SPECK_SEED, 0));
  for (let index = 0; index < count; index++) {
    const angle = getRandomBetween(random, 0, TAU);
    const height = getRandomBetween(random, 8, 40);
    const blink = getRandomBetween(random, 0, 1);
    const x = getCycle(angle / TAU + beat / 16) * (WIDTH + 8) - 4;
    const glow = 0.5 + 0.5 * Math.sin((beat + blink) * Math.PI);
    const color = mix(palette[index % palette.length] ?? WHITE, WHITE, 0.5);
    blendPixel(image, Math.round(x), Math.round(height), color, glow);
  }
}

const raster = createRaster();
const crowd = createRgbaImage();

export const clubCrowd = defineEffect({
  id: "club-crowd",
  name: "Club crowd",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    ...paletteParams,
    color1: colorSchema.default("#ff2fd0"),
    color2: colorSchema.default("#3cdcff"),
    color3: colorSchema.default("#ffd030"),
    color4: colorSchema.default("#7a40ff"),
    colorCount: z.number().int().min(1).max(4).default(4),
    move: z.enum(crowdMoves).default("mixed"),
    every: z.number().min(1).max(32).default(8),
    speed: z.number().min(0.25).max(4).default(1),
    beams: z.number().int().min(0).max(8).default(4),
    sweep: z.number().min(0).max(60).default(26),
    lighting: z.number().min(0).max(1).default(1),
    discoBall: z.boolean().default(true),
    specks: z.number().int().min(0).max(30).default(10),
    ...furParams,
    flashColor: colorSchema.default("#ffffff"),
  }),
  render(image, { params, beat }) {
    const palette = getPalette(params);
    const kick = Math.exp(-getCycle(beat) * 5);
    const beams = getBeams(params.beams, "top", beat, 8, params.sweep, 16, FLOOR, palette);
    const brightness = 0.7 * (0.7 + 0.3 * kick);
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        let [r, g, b] = [0, 0, 0];
        for (const [index, beam] of beams.entries()) {
          const light = getBeamLight(beam, x + 0.5, y + 0.5, beat, index) * brightness;
          r += beam.color[0] * light;
          g += beam.color[1] * light;
          b += beam.color[2] * light;
        }
        if (r + g + b > 6) {
          blendPixel(image, x, y, [Math.min(255, r), Math.min(255, g), Math.min(255, b)]);
        }
      }
    }
    if (params.specks > 0) {
      drawSpecks(image, beat, palette, params.specks);
    }
    if (params.discoBall) {
      drawBall(image, beat, palette, kick);
    }

    const [tabby, black] = getCoats(params);
    const coats = { tabby, black };
    const moveBeat = beat * params.speed;
    crowd.fill(0);
    let memberIndex = 0;
    for (const [rowIndex, row] of ROWS.entries()) {
      raster.color.fill(0);
      raster.depth.fill(-Infinity);
      for (const member of row.members) {
        const move = getMove(params.move, memberIndex++, beat, params.every);
        const dancer: Dancer = { x: member.x, phase: member.phase, side: member.side };
        const turn = getRotation(0, member.yaw, 0);
        if (isCat(member.id)) {
          const frame = catMoveFrames[CAT_MOVES[move]](moveBeat, dancer, row.size, 0);
          drawCat(
            raster,
            {
              ...frame,
              y: frame.y - CAT_BASE_Y + row.center,
              rotate: compose(frame.rotate, turn),
            },
            coats[member.id],
          );
          continue;
        }
        const frame = hunterMoveFrames[move as HunterMove](moveBeat, dancer, row.size);
        const placement = {
          ...frame,
          y: frame.y - BASE_Y + row.center,
          rotate: compose(frame.rotate, turn),
        };
        if (isHero(member.id)) {
          drawHero(raster, member.id, {
            ...placement,
            pose: { ...placement.pose, cape: placement.pose.hair, skirt: placement.pose.hips },
          });
          continue;
        }
        drawHunter(raster, member.id, placement);
      }
      if (rowIndex === 0) {
        resolveRaster(raster, crowd);
      } else {
        compositeRaster(raster, crowd);
      }
    }
    drawLighting(crowd, beams, beat, params.lighting);
    const flash = parseColor(params.flashColor);
    const strobe = getCycle(beat / 4) >= 0.75 ? kick * 0.35 : 0;
    for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel++) {
      const offset = pixel * 4;
      const alpha = (crowd[offset + 3] ?? 0) / 255;
      if (alpha === 0) {
        continue;
      }
      const color = mix(
        [crowd[offset] ?? 0, crowd[offset + 1] ?? 0, crowd[offset + 2] ?? 0],
        flash,
        strobe,
      );
      blendPixel(image, pixel % WIDTH, Math.floor(pixel / WIDTH), color, alpha);
    }
  },
});
