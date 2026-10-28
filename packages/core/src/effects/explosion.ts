import { z } from "zod";
import { defineEffect } from "../effect.ts";
import { type Color, HEIGHT, type RgbaImage, WIDTH, setRgbaPixel } from "../frame.ts";
import { easings } from "../keyframes.ts";
import { createRandom, getRandomBetween, hashSeed } from "../random.ts";
import { getNoise, getSmoothNoise2d } from "./blood/shared.ts";
import { TAU, clamp } from "./cat-duo.ts";

const SEED = 0xb00e;
const GROUND = 62;

const FIRE_RAMP: readonly Color[] = [
  [40, 0, 0],
  [72, 0, 0],
  [104, 4, 0],
  [140, 8, 0],
  [176, 16, 0],
  [208, 28, 0],
  [236, 44, 0],
  [255, 64, 0],
  [255, 88, 0],
  [255, 112, 0],
  [255, 136, 0],
  [255, 160, 0],
  [255, 184, 8],
  [255, 208, 24],
  [255, 228, 56],
  [255, 244, 112],
  [255, 255, 184],
];

const SMOKE_RAMP: readonly Color[] = [
  [16, 4, 2],
  [30, 9, 4],
  [46, 15, 7],
  [64, 22, 10],
  [84, 32, 14],
  [106, 44, 20],
];

function getRampColor(ramp: readonly Color[], value: number): Color {
  const index = Math.round(clamp(value) * (ramp.length - 1));
  return ramp[index] ?? [0, 0, 0];
}

function getTurbulence(seed: number, x: number, y: number): number {
  return (
    getSmoothNoise2d(seed, x, y) * 0.55 +
    getSmoothNoise2d(seed + 1, x * 2.1, y * 2.1) * 0.3 +
    getSmoothNoise2d(seed + 2, x * 4.3, y * 4.3) * 0.15
  );
}

type Billow = {
  x: number;
  y: number;
  radius: number;
  depth: number;
  heat: number;
  erosion: number;
  seed: number;
};

type Ember = {
  x: number;
  y: number;
  heat: number;
};

type Scene = {
  billows: Billow[];
  embers: Ember[];
  floor: number;
};

type VisibleBillow = {
  billow: Billow;
  dx: number;
  dy: number;
  height: number;
};

function createScene(floor = HEIGHT): Scene {
  return { billows: [], embers: [], floor };
}

function getVisibleBillow(
  billows: readonly Billow[],
  x: number,
  y: number,
): VisibleBillow | undefined {
  let visible: VisibleBillow | undefined;
  let surface = -Infinity;
  for (const billow of billows) {
    const dx = x - billow.x;
    const dy = y - billow.y;
    const squared = billow.radius ** 2 - dx * dx - dy * dy;
    if (squared <= 0) {
      continue;
    }
    const height = Math.sqrt(squared);
    if (height + billow.depth > surface) {
      surface = height + billow.depth;
      visible = { billow, dx, dy, height };
    }
  }
  return visible;
}

function getBillowColor(
  { billow, dx, dy, height }: VisibleBillow,
  grain: number,
): Color | undefined {
  const { radius } = billow;
  const rim = Math.hypot(dx, dy) / radius;
  const texture = getTurbulence(billow.seed, (dx / radius) * 1.8, (dy / radius) * 1.8);
  if (billow.erosion > 0 && texture + (1 - rim) * 0.5 < billow.erosion * 1.25) {
    return undefined;
  }
  const light = clamp(-0.45 * (dx / radius) - 0.55 * (dy / radius) + 0.7 * (height / radius));
  const shade = (0.3 + 0.7 * light) * (1 - rim ** 4 * 0.5);
  const heat = billow.heat * (0.55 + (texture - 0.5) * 1.1 + 0.45 * (1 - rim));
  const smoke = clamp((0.4 - billow.heat) * 4) + grain * 0.4;
  if (smoke > 0.5) {
    if (texture > 0.66 && billow.heat > 0.1) {
      return getRampColor(FIRE_RAMP, (texture - 0.6) * 2.4 + grain * 0.15);
    }
    return getRampColor(SMOKE_RAMP, shade * 0.9 + (texture - 0.5) * 0.5 + grain * 0.2);
  }
  return getRampColor(FIRE_RAMP, heat * (0.5 + 0.5 * shade) + grain * 0.1);
}

function drawScene(image: RgbaImage, scene: Scene, pixelSize: number, frame: number): void {
  for (let cellY = 0; cellY * pixelSize < HEIGHT; cellY++) {
    for (let cellX = 0; cellX * pixelSize < WIDTH; cellX++) {
      const x = (cellX + 0.5) * pixelSize;
      const y = (cellY + 0.5) * pixelSize;
      if (y > scene.floor) {
        continue;
      }
      const visible = getVisibleBillow(scene.billows, x, y);
      if (visible === undefined) {
        continue;
      }
      const color = getBillowColor(visible, getNoise(SEED, cellX, cellY, frame) - 0.5);
      if (color !== undefined) {
        fillCell(image, cellX, cellY, pixelSize, color);
      }
    }
  }
  for (const ember of scene.embers) {
    if (ember.y <= scene.floor) {
      const color = getRampColor(FIRE_RAMP, ember.heat);
      fillCell(
        image,
        Math.floor(ember.x / pixelSize),
        Math.floor(ember.y / pixelSize),
        pixelSize,
        color,
      );
    }
  }
}

function fillCell(
  image: RgbaImage,
  cellX: number,
  cellY: number,
  pixelSize: number,
  color: Color,
): void {
  for (let y = 0; y < pixelSize; y++) {
    for (let x = 0; x < pixelSize; x++) {
      setRgbaPixel(image, cellX * pixelSize + x, cellY * pixelSize + y, color);
    }
  }
}

type EmberSpray = {
  x: number;
  y: number;
  angle: number;
  spread: number;
  speed: readonly [number, number];
  gravity: number;
  age: number;
  life: number;
};

function addEmbers(scene: Scene, seed: number, count: number, spray: EmberSpray): void {
  const random = createRandom(seed);
  for (let index = 0; index < count; index++) {
    const angle = spray.angle + (random() - 0.5) * spray.spread;
    const speed = getRandomBetween(random, spray.speed[0], spray.speed[1]);
    const life = spray.life * getRandomBetween(random, 0.4, 1);
    const fade = 1 - spray.age / life;
    if (fade <= 0) {
      continue;
    }
    const travel = (speed * (1 - Math.exp(-2.5 * spray.age))) / 2.5;
    const x = spray.x + Math.cos(angle) * travel;
    const y = spray.y + Math.sin(angle) * travel + 0.5 * spray.gravity * spray.age ** 2;
    scene.embers.push({ x, y, heat: 0.6 + 0.4 * fade });
    if (fade > 0.4) {
      const back = Math.max(0, spray.age - 0.04);
      const backTravel = (speed * (1 - Math.exp(-2.5 * back))) / 2.5;
      scene.embers.push({
        x: spray.x + Math.cos(angle) * backTravel,
        y: spray.y + Math.sin(angle) * backTravel + 0.5 * spray.gravity * back ** 2,
        heat: 0.45 * fade,
      });
    }
  }
}

type Blast = {
  x: number;
  y: number;
  size: number;
  age: number;
  length: number;
  seed: number;
  embers: number;
  isGrounded: boolean;
};

const BLAST_BILLOWS = 14;

function addBlast(scene: Scene, blast: Blast): void {
  const { size, age, length, seed, isGrounded } = blast;
  const life = age / length;
  if (life < 0 || life >= 1) {
    return;
  }
  const reach = size * (0.5 + 0.5 * (1 - Math.exp(-age * 6)));
  const cool = 1.35 * Math.exp(-age * 2.2);
  const erosion = clamp((life - 0.4) / 0.45);
  const random = createRandom(seed);
  const centerY = isGrounded ? GROUND - reach * 0.45 : blast.y;
  for (let index = 0; index < BLAST_BILLOWS; index++) {
    const angle = isGrounded ? -Math.PI / 2 + (random() - 0.5) * Math.PI * 1.1 : random() * TAU;
    const distance = index === 0 ? 0 : getRandomBetween(random, 0.25, 0.8);
    const radius = getRandomBetween(random, 0.35, 0.6) * reach * (1 + life * 0.35);
    const lift = age * size * getRandomBetween(random, 0.15, 0.45);
    scene.billows.push({
      x: blast.x + Math.cos(angle) * distance * reach,
      y: centerY + Math.sin(angle) * distance * reach * (isGrounded ? 1.3 : 1) - lift,
      radius,
      depth: getRandomBetween(random, -0.3, 0.3) * reach + (1 - distance) * reach * 0.3,
      heat: cool * (1.2 - distance * 0.6) * getRandomBetween(random, 0.8, 1.2),
      erosion: clamp(erosion * getRandomBetween(random, 0.8, 1.3)),
      seed: hashSeed(seed, index),
    });
  }
  if (isGrounded) {
    for (let index = 0; index < 8; index++) {
      const side = index % 2 === 0 ? -1 : 1;
      const out =
        size *
        (0.4 + 1.6 * easings.easeOutCubic(clamp(life * 1.5))) *
        getRandomBetween(random, 0.4, 1.1);
      scene.billows.push({
        x: blast.x + side * out,
        y: GROUND - 1,
        radius: size * getRandomBetween(random, 0.18, 0.3) * (1 + life),
        depth: -size,
        heat: 0.7 * Math.exp(-age * 4),
        erosion: clamp(erosion * 1.1),
        seed: hashSeed(seed, 20, index),
      });
    }
  }
  addEmbers(scene, hashSeed(seed, 9), blast.embers, {
    x: blast.x,
    y: isGrounded ? GROUND - 2 : blast.y,
    angle: -Math.PI / 2,
    spread: isGrounded ? Math.PI * 0.9 : TAU,
    speed: [size * 2.5, size * 7],
    gravity: size * 4,
    age,
    life: length * 0.6,
  });
}

function getFrameBeat(beat: number, bpm: number, fps: number): { beat: number; frame: number } {
  const step = bpm / 60 / fps;
  const frame = Math.floor(beat / step);
  return { beat: frame * step, frame };
}

export const explosion = defineEffect({
  id: "explosion",
  name: "Explosion",
  kind: "pixel",
  params: z.object({
    every: z.number().min(0.25).max(16).default(2),
    count: z.number().int().min(1).max(8).default(1),
    length: z.number().min(0.25).max(8).default(1.25),
    size: z.number().min(4).max(40).default(24),
    variation: z.number().min(0).max(1).default(0.25),
    scatter: z.number().min(0).max(1).default(0),
    embers: z.number().int().min(0).max(80).default(16),
    grounded: z.boolean().default(false),
    x: z.number().min(0).max(64).default(32),
    y: z.number().min(0).max(64).default(32),
    pixelSize: z.number().int().min(1).max(4).default(1),
    fps: z.number().min(4).max(30).default(15),
  }),
  render(image, { params, beat, bpm }) {
    const { beat: frameBeat, frame } = getFrameBeat(beat, bpm, params.fps);
    const scene = createScene(params.grounded ? GROUND : HEIGHT);
    const interval = params.every / params.count;
    const newest = Math.floor(frameBeat / interval);
    const oldest = Math.floor((frameBeat - params.length) / interval);
    for (let index = oldest; index <= newest; index++) {
      const random = createRandom(hashSeed(SEED, 1, index));
      const range = Math.max(4, 30 - params.size * 0.8) * params.scatter;
      const scatterX = getRandomBetween(random, -range, range);
      const scatterY = getRandomBetween(random, -range, range);
      addBlast(scene, {
        x: params.x + scatterX,
        y: params.y + scatterY,
        size: params.size * (1 + getRandomBetween(random, -1, 1) * params.variation),
        age: frameBeat - index * interval,
        length: params.length,
        seed: hashSeed(SEED, 2, index),
        embers: params.embers,
        isGrounded: params.grounded,
      });
    }
    drawScene(image, scene, params.pixelSize, frame);
  },
});

type Mushroom = {
  size: number;
  age: number;
  life: number;
  seed: number;
};

function addMushroom(scene: Scene, { size, age, life, seed }: Mushroom): void {
  const centerX = 32;
  const rise = easings.easeOutCubic(clamp(life / 0.7));
  const spread = easings.easeOutQuad(clamp(life / 0.8));
  const capY = GROUND - 10 * size - 30 * size * rise;
  const capWidth = (6 + 21 * spread) * size;
  const capHeight = (5 + 7 * rise) * size;
  const cool = 0.3 + 1.1 * Math.exp(-life * 3.4);
  const erosion = clamp((life - 0.6) / 0.3);
  const random = createRandom(seed);

  const ring = 12;
  for (let index = 0; index < ring; index++) {
    const around = (index / ring) * TAU + getRandomBetween(random, -0.2, 0.2);
    const roll = getRandomBetween(random, 0, TAU) + life * 5;
    const reach = capWidth * (0.62 + 0.12 * Math.sin(roll));
    scene.billows.push({
      x: centerX + Math.cos(around) * reach,
      y: capY + capHeight * (0.15 + 0.3 * Math.cos(roll)) + Math.sin(around) * capHeight * 0.2,
      radius: capHeight * getRandomBetween(random, 0.55, 0.8),
      depth: Math.sin(around) * capWidth * 0.4,
      heat: cool * (0.85 + 0.35 * Math.cos(roll)) * getRandomBetween(random, 0.85, 1.15),
      erosion: clamp(erosion * getRandomBetween(random, 0.8, 1.3)),
      seed: hashSeed(seed, 1, index),
    });
  }
  for (let index = 0; index < 5; index++) {
    const offset = (index - 2) / 2;
    scene.billows.push({
      x: centerX + offset * capWidth * 0.45 + getRandomBetween(random, -1, 1) * size,
      y: capY - capHeight * (0.35 - 0.12 * Math.abs(offset)),
      radius: capHeight * getRandomBetween(random, 0.6, 0.8),
      depth: -capWidth * 0.1,
      heat: cool * getRandomBetween(random, 0.6, 0.8),
      erosion: clamp(erosion * getRandomBetween(random, 0.9, 1.4)),
      seed: hashSeed(seed, 2, index),
    });
  }

  const stemTop = capY + capHeight * 0.5;
  const spacing = 4 * size;
  const scroll = (age * 10 * size) % spacing;
  for (let y = GROUND + scroll; y > stemTop; y -= spacing) {
    const along = clamp((GROUND - y) / (GROUND - stemTop));
    const flare = (1 - along) ** 3;
    const index = Math.round((y - scroll) / spacing);
    const stemRandom = createRandom(hashSeed(seed, 3, index));
    scene.billows.push({
      x: centerX + getRandomBetween(stemRandom, -1, 1) * size,
      y,
      radius: (3.5 + 3.5 * rise + 3 * flare) * size * getRandomBetween(stemRandom, 0.9, 1.15),
      depth: -capWidth * 0.5,
      heat: cool * (0.4 + 0.55 * along) * getRandomBetween(stemRandom, 0.8, 1.2),
      erosion: clamp(erosion * 1.2),
      seed: hashSeed(seed, 3, index),
    });
  }

  for (let index = 0; index < 10; index++) {
    const side = index % 2 === 0 ? -1 : 1;
    const out = (4 + 30 * easings.easeOutCubic(life)) * size * getRandomBetween(random, 0.3, 1);
    scene.billows.push({
      x: centerX + side * out,
      y: GROUND - 1,
      radius: (2.5 + 4 * rise) * size * getRandomBetween(random, 0.7, 1.1),
      depth: -capWidth,
      heat: 0.2 + 0.8 * Math.exp(-life * 8),
      erosion: clamp(erosion * 1.1),
      seed: hashSeed(seed, 4, index),
    });
  }

  addEmbers(scene, hashSeed(seed, 9), 12, {
    x: centerX,
    y: GROUND - 2,
    angle: -Math.PI / 2,
    spread: Math.PI * 0.8,
    speed: [25 * size, 60 * size],
    gravity: 45 * size,
    age,
    life: 1.2,
  });
}

export const mushroomCloud = defineEffect({
  id: "mushroom-cloud",
  name: "Mushroom cloud",
  kind: "pixel",
  params: z.object({
    every: z.number().min(1).max(32).default(4),
    size: z.number().min(0.5).max(1.5).default(1),
    pixelSize: z.number().int().min(1).max(4).default(1),
    fps: z.number().min(4).max(30).default(15),
  }),
  render(image, { params, beat, bpm }) {
    const { beat: frameBeat, frame } = getFrameBeat(beat, bpm, params.fps);
    const generation = Math.floor(frameBeat / params.every);
    const age = frameBeat - generation * params.every;
    const scene = createScene(GROUND);
    addMushroom(scene, {
      size: params.size,
      age,
      life: age / params.every,
      seed: hashSeed(SEED, 3, generation),
    });
    drawScene(image, scene, params.pixelSize, frame);
  },
});
