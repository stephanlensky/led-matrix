import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { type Color, HEIGHT, type RgbaImage, WIDTH } from "../frame.ts";
import { easings } from "../keyframes.ts";
import { compose, createRaster, getRotation, resolveRaster } from "../mesh.ts";
import { createRandom, getRandomBetween, hashSeed } from "../random.ts";
import { TAU, clamp, toRadians } from "./cat-duo.ts";
import { getCycle } from "./cat-dance.ts";
import { mix, scale } from "./cat-model.ts";
import {
  type HeroPlacement,
  type HeroPose,
  SOLE_Y,
  drawHero,
  getHeroPoint,
} from "./frieren-model.ts";

const LOOP_BEATS = 8;
const FOCAL = 9;
const RING_COUNT = 5;
const RING_SPACING = 1.5;
const NEAR = 0.35;
const TUNNEL_WIDTH = 2.2;
const TUNNEL_HEIGHT = 1.7;
const STREAK_SEED = 0xc1be;
const STREAKS_PER_BEAT = 7;
const STREAK_LIFE = 1.2;
const BIT_SEED = 0xb175;
const BIT_COUNT = 10;
const GLITCH_SEED = 0x6117;
const TRAIL_SEED = 0x7a11;
const TRAIL_SPARKS = 28;
const WHITE: Color = [255, 255, 255];

type Pulse = { index: number; phase: number; since: number; kick: number };

type Scene = {
  beat: number;
  pulse: Pulse;
  scroll: number;
  centerX: number;
  centerY: number;
  bank: number;
  heroX: number;
  heroY: number;
  line: Color;
  accent: Color;
};

function getPulse(beat: number, every: number): Pulse {
  const pulse = beat / every;
  const phase = getCycle(pulse);
  const since = phase * every;
  return { index: Math.floor(pulse), phase, since, kick: Math.exp(-since * 6) };
}

function addPixel(image: RgbaImage, x: number, y: number, color: Color, amount = 1): void {
  const px = Math.floor(x);
  const py = Math.floor(y);
  if (px < 0 || py < 0 || px >= WIDTH || py >= HEIGHT || amount <= 0) {
    return;
  }
  const offset = (py * WIDTH + px) * 4;
  for (const [channel, value] of color.entries()) {
    image[offset + channel] = Math.max(image[offset + channel] ?? 0, value * Math.min(1, amount));
  }
  image[offset + 3] = 255;
}

function addLine(
  image: RgbaImage,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  color: Color,
  amount = 1,
): void {
  const steps = Math.ceil(Math.hypot(bx - ax, by - ay) * 1.5) + 1;
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    addPixel(image, ax + (bx - ax) * t, ay + (by - ay) * t, color, amount);
  }
}

function getProjected(scene: Scene, x: number, y: number, depth: number): [number, number] {
  const cos = Math.cos(scene.bank);
  const sin = Math.sin(scene.bank);
  const factor = (FOCAL / depth) * 8;
  return [
    scene.centerX + (x * cos - y * sin) * factor,
    scene.centerY + (x * sin + y * cos) * factor,
  ];
}

function drawTunnel(image: RgbaImage, scene: Scene): void {
  const corners = [
    [-TUNNEL_WIDTH, -TUNNEL_HEIGHT],
    [TUNNEL_WIDTH, -TUNNEL_HEIGHT],
    [TUNNEL_WIDTH, TUNNEL_HEIGHT],
    [-TUNNEL_WIDTH, TUNNEL_HEIGHT],
  ] as const;
  const far = RING_COUNT * RING_SPACING + NEAR;
  for (const [x, y] of corners) {
    const [ax, ay] = getProjected(scene, x, y, far);
    const [bx, by] = getProjected(scene, x, y, NEAR);
    addLine(image, ax, ay, bx, by, scale(scene.line, 0.6));
  }
  const offset = getCycle(scene.scroll);
  for (let ring = 0; ring < RING_COUNT; ring++) {
    const depth = (ring + 1 - offset) * RING_SPACING + NEAR;
    const nearness = 1 - depth / far;
    const ringIndex = Math.floor(scene.scroll) + RING_COUNT - ring;
    const isAccent = ((ringIndex % 3) + 3) % 3 === 0;
    const base = isAccent ? scene.accent : scene.line;
    const color = mix(base, WHITE, 0.6 * scene.pulse.kick * nearness);
    const amount = clamp((nearness - 0.1) * 3) * (0.75 + 0.25 * scene.pulse.kick);
    for (const [index, [ax, ay]] of corners.entries()) {
      const [bx, by] = corners[(index + 1) % corners.length] ?? corners[0];
      const [sx, sy] = getProjected(scene, ax, ay, depth);
      const [ex, ey] = getProjected(scene, bx, by, depth);
      addLine(image, sx, sy, ex, ey, color, amount);
    }
  }
}

function drawStreaks(image: RgbaImage, scene: Scene): void {
  const first = Math.floor(scene.beat - STREAK_LIFE) - 1;
  for (let spawn = first; spawn <= Math.floor(scene.beat); spawn++) {
    const seed = ((spawn % LOOP_BEATS) + LOOP_BEATS) % LOOP_BEATS;
    for (let streak = 0; streak < STREAKS_PER_BEAT; streak++) {
      const random = createRandom(hashSeed(STREAK_SEED, seed, streak));
      const age = (scene.beat - spawn - random()) / STREAK_LIFE;
      if (age <= 0 || age >= 1) {
        continue;
      }
      const angle = random() * TAU;
      const radius = getRandomBetween(random, 0.4, 1) * TUNNEL_HEIGHT;
      const x = Math.cos(angle) * radius * (TUNNEL_WIDTH / TUNNEL_HEIGHT);
      const y = Math.sin(angle) * radius;
      const head = Math.max(NEAR, 8 * (1 - easings.easeInQuad(age)));
      const tail = head + 0.8 + 1.5 * age;
      const [ax, ay] = getProjected(scene, x, y, tail);
      const [bx, by] = getProjected(scene, x, y, head);
      const color = random() < 0.35 ? mix(scene.accent, WHITE, 0.5) : scene.accent;
      addLine(image, ax, ay, bx, by, color, Math.min(1, age * 4));
    }
  }
}

function drawBits(image: RgbaImage, scene: Scene): void {
  for (let bit = 0; bit < BIT_COUNT; bit++) {
    const random = createRandom(hashSeed(BIT_SEED, bit));
    const travel = getCycle(scene.scroll / 4 + random());
    const depth = NEAR + (1 - travel) * RING_COUNT * RING_SPACING;
    const side = Math.floor(random() * 4);
    const along = getRandomBetween(random, -0.8, 0.8);
    const x = side < 2 ? (side === 0 ? -1 : 1) * TUNNEL_WIDTH : along * TUNNEL_WIDTH;
    const y = side < 2 ? along * TUNNEL_HEIGHT : (side === 2 ? -1 : 1) * TUNNEL_HEIGHT;
    const [px, py] = getProjected(scene, x * 0.97, y * 0.97, depth);
    const size = Math.max(1, Math.round(2.5 / depth));
    const color = mix(scene.accent, WHITE, 0.7);
    const fade = clamp(travel * 3);
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        addPixel(image, px + dx, py + dy, color, fade);
      }
    }
  }
}

function getFlyingPose(beat: number, kick: number): HeroPose {
  const flutter = Math.sin(beat * TAU * 2);
  const kickLeg = Math.sin(beat * Math.PI);
  return {
    head: getRotation(
      toRadians(-60 + 6 * kick),
      toRadians(-50 + 8 * Math.sin(beat * Math.PI * 0.5)),
      0,
    ),
    hair: getRotation(toRadians(35 + 8 * flutter), 0, 0),
    cape: getRotation(toRadians(25 + 10 * flutter), 0, toRadians(6 * flutter)),
    rightArm: getRotation(toRadians(-35 + 6 * kick), 0, toRadians(-25)),
    rightForearm: getRotation(toRadians(-10), 0, 0),
    leftArm: getRotation(toRadians(-35 + 6 * kick), 0, toRadians(25)),
    leftForearm: getRotation(toRadians(-20), 0, 0),
    leftLeg: getRotation(toRadians(4 + 4 * kickLeg), 0, toRadians(-4)),
    leftShin: getRotation(toRadians(12 + 8 * kickLeg), 0, 0),
    rightLeg: getRotation(toRadians(-2 - 4 * kickLeg), 0, toRadians(4)),
    rightShin: getRotation(toRadians(22 - 8 * kickLeg), 0, 0),
  };
}

function drawTrail(image: RgbaImage, scene: Scene, placement: HeroPlacement): void {
  for (const [side, joint] of [
    [-1, "leftShin"],
    [1, "rightShin"],
  ] as const) {
    const [footX, footY] = getHeroPoint("himmel", placement, [side * 0.15, SOLE_Y, 0], joint);
    const towardX = scene.centerX - footX;
    const towardY = scene.centerY - footY;
    const length = Math.hypot(towardX, towardY) || 1;
    for (let spark = 0; spark < TRAIL_SPARKS; spark++) {
      const random = createRandom(hashSeed(TRAIL_SEED, side, spark));
      const t = getCycle(random() - scene.scroll * 0.75);
      const distance = t * length;
      const wobble = Math.sin((t * 3 + random()) * TAU) * (1 + 2 * t);
      const color = mix(WHITE, scene.accent, Math.min(1, t * 1.5));
      addPixel(
        image,
        footX + (towardX / length) * distance - (towardY / length) * wobble,
        footY + (towardY / length) * distance + (towardX / length) * wobble,
        color,
        1.4 * (1 - t),
      );
    }
  }
}

function getGlitch(pulse: Pulse): number {
  const isBig = ((pulse.index % 4) + 4) % 4 === 3;
  return isBig ? Math.exp(-pulse.since * 5) : 0;
}

function drawHimmel(image: RgbaImage, scene: Scene, size: number, glitch: number): void {
  const { beat, pulse } = scene;
  const raster = createRaster();
  const placement: HeroPlacement = {
    x: scene.heroX,
    y: scene.heroY,
    size: size * (1 + 0.06 * pulse.kick),
    rotate: compose(
      getRotation(toRadians(10), toRadians(75 + 10 * Math.sin((beat / 4) * TAU)), scene.bank * 1.4),
      getRotation(toRadians(80), 0, 0),
    ),
    pose: getFlyingPose(beat, pulse.kick),
  };
  drawHero(raster, "himmel", placement);
  drawTrail(image, scene, placement);
  const hero = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  resolveRaster(raster, hero);
  const isSolid = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT && (hero[(y * WIDTH + x) * 4 + 3] ?? 0) > 110;
  const split = Math.round(2 * glitch);
  const slices = Array.from({ length: HEIGHT / 4 }, (_, slice) => {
    const random = createRandom(hashSeed(GLITCH_SEED, pulse.index, slice));
    return random() < 0.4 ? Math.round(getRandomBetween(random, -6, 6) * glitch) : 0;
  });
  const edge = mix(scene.accent, WHITE, 0.25 + 0.5 * pulse.kick);
  for (let y = 0; y < HEIGHT; y++) {
    const shift = slices[y >> 2] ?? 0;
    for (let x = 0; x < WIDTH; x++) {
      const sourceX = x - shift;
      const solid = isSolid(sourceX, y);
      const offset = (y * WIDTH + x) * 4;
      if (
        !solid &&
        (isSolid(sourceX - 1, y) ||
          isSolid(sourceX + 1, y) ||
          isSolid(sourceX, y - 1) ||
          isSolid(sourceX, y + 1))
      ) {
        image[offset] = edge[0];
        image[offset + 1] = edge[1];
        image[offset + 2] = edge[2];
        image[offset + 3] = 255;
        continue;
      }
      const red = isSolid(sourceX + split, y);
      const blue = isSolid(sourceX - split, y);
      if (!solid && !red && !blue) {
        continue;
      }
      const sample = (sx: number, channel: number, isSet: boolean) =>
        isSet ? (hero[(y * WIDTH + sx) * 4 + channel] ?? 0) : (image[offset + channel] ?? 0);
      image[offset] = sample(sourceX + split, 0, red);
      image[offset + 1] = sample(sourceX, 1, solid);
      image[offset + 2] = sample(sourceX - split, 2, blue);
      image[offset + 3] = 255;
    }
  }
}

export const himmelCyberspace = defineEffect({
  id: "himmel-cyberspace",
  name: "Himmel cyberspace",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    lineColor: colorSchema.default("#1a4cff"),
    accentColor: colorSchema.default("#00d8ff"),
    every: z.number().min(0.25).max(4).default(1),
    size: z.number().min(8).max(24).default(15),
    glitch: z.boolean().default(true),
  }),
  render(image, { params, beat }) {
    const pulse = getPulse(beat, params.every);
    const surge = (pulse.index + easings.easeOutCubic(pulse.phase)) * params.every;
    const sway = Math.sin((beat / LOOP_BEATS) * TAU);
    const bank = toRadians(6) * sway;
    const scene: Scene = {
      beat,
      pulse,
      scroll: beat + surge * 0.5,
      centerX: WIDTH / 2 - 10 - sway * 4,
      centerY: HEIGHT / 2 - 10,
      heroX: WIDTH / 2 + 2 + sway * 5,
      heroY: HEIGHT / 2 + 6 + Math.sin((beat / 2) * TAU) * 1.5 - 1.5 * pulse.kick,
      bank,
      line: parseColor(params.lineColor),
      accent: parseColor(params.accentColor),
    };
    drawTunnel(image, scene);
    drawStreaks(image, scene);
    drawBits(image, scene);
    drawHimmel(image, scene, params.size, params.glitch ? getGlitch(pulse) : 0);
  },
});
