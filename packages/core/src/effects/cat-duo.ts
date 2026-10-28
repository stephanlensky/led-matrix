import { z } from "zod";
import { type Collision, getPathPosition, simulateBodies } from "../collisions.ts";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { type Color, HEIGHT, WIDTH } from "../frame.ts";
import { easings } from "../keyframes.ts";
import { createRandom, getRandomBetween, hashSeed } from "../random.ts";
import {
  type Raster,
  createRaster,
  fillRasterCircle,
  getRotation,
  resolveRaster,
} from "../mesh.ts";
import { type Coat, drawCat, getSolidCoat, getTabbyCoat } from "./cat-model.ts";

export type CatState = { x: number; y: number; yaw: number };

export const TAU = Math.PI * 2;
export const CAT_SIZE = 8;
export const CAT_RADIUS = 10;
export const STARING_CAT_SIZE = 15;
const IMPACT_ANGLE = -0.00813;
const IMPACT_DIRECTION = [Math.cos(IMPACT_ANGLE), Math.sin(IMPACT_ANGLE)] as const;
export const TABBY_IMPACT = [20.5373, 34.70652] as const;
export const BLACK_IMPACT = [
  TABBY_IMPACT[0] + 2 * CAT_RADIUS * IMPACT_DIRECTION[0],
  TABBY_IMPACT[1] + 2 * CAT_RADIUS * IMPACT_DIRECTION[1],
] as const;
export const BLACK_TILT = [20, 18].map(toRadians);
export const TABBY_TILT = [-35, -40].map(toRadians);
const BLACK_TURNS = 4;
const TABBY_TURNS = -6;
const KICK_DURATION = 14;
const SPARK_LIFETIME = 16;
const SPARK_COUNT = 12;

const bounce = simulateBodies(
  [
    {
      x: TABBY_IMPACT[0],
      y: TABBY_IMPACT[1],
      vx: -IMPACT_DIRECTION[0],
      vy: -IMPACT_DIRECTION[1],
      radius: CAT_RADIUS,
    },
    {
      x: BLACK_IMPACT[0],
      y: BLACK_IMPACT[1],
      vx: IMPACT_DIRECTION[0],
      vy: IMPACT_DIRECTION[1],
      radius: CAT_RADIUS,
    },
  ],
  { left: 0, top: 0, right: WIDTH, bottom: HEIGHT },
  { duration: 1000, bodyCollisions: 4 },
);
const reversalTime = bounce.collisions.at(-1)?.time ?? 1;
const loopTime = reversalTime * 2;
const firstHalfImpacts = bounce.collisions.filter((collision) => collision.bodies.length === 2);
const impacts: Pick<Collision, "time" | "x" | "y">[] = [
  { time: 0, x: TABBY_IMPACT[0] + CAT_RADIUS, y: TABBY_IMPACT[1] },
  ...firstHalfImpacts,
  ...firstHalfImpacts
    .slice(0, -1)
    .map(({ time, x, y }) => ({ time: loopTime - time, x, y }))
    .toReversed(),
];

export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function getSpan(progress: number, start: number, end: number): number {
  return clamp((progress - start) / (end - start));
}

function getImpactAges(time: number): { age: number; index: number }[] {
  return impacts.flatMap((impact, index) =>
    [time - impact.time, time - impact.time + loopTime]
      .filter((age) => age >= 0 && age < Math.max(KICK_DURATION, SPARK_LIFETIME))
      .map((age) => ({ age, index })),
  );
}

export function getBounceState(time: number): [tabby: CatState, black: CatState] {
  const pathTime = Math.min(time, loopTime - time);
  const kicks = getImpactAges(time)
    .filter(({ age }) => age < KICK_DURATION)
    .reduce((sum, { age }) => sum + easings.easeOutCubic(age / KICK_DURATION), 0);
  const [tabby, black] = [TABBY_TURNS, BLACK_TURNS].map((turns, index): CatState => {
    const [x, y] = getPathPosition(bounce.paths[index] ?? [], pathTime);
    const yaw = TAU * (turns * (time / loopTime) + Math.sign(turns) * kicks);
    return { x, y, yaw };
  });
  return [tabby ?? { x: 0, y: 0, yaw: 0 }, black ?? { x: 0, y: 0, yaw: 0 }];
}

function drawSparks(raster: Raster, time: number, color: Color): void {
  for (const { age, index } of getImpactAges(time)) {
    if (age >= SPARK_LIFETIME) {
      continue;
    }
    const impact = impacts[index];
    if (!impact) {
      continue;
    }
    const random = createRandom(hashSeed(7, index));
    const life = age / SPARK_LIFETIME;
    for (let spark = 0; spark < SPARK_COUNT; spark++) {
      const angle = (spark / SPARK_COUNT) * TAU + getRandomBetween(random, -0.3, 0.3);
      const distance = getRandomBetween(random, 8, 16) * easings.easeOutCubic(life);
      const fade = 1 - life;
      fillRasterCircle(
        raster,
        impact.x + Math.cos(angle) * distance,
        impact.y + Math.sin(angle) * distance,
        0.7 * fade + 0.3,
        [color[0] * fade, color[1] * fade, color[2] * fade],
      );
    }
  }
}

export const furParams = {
  color: colorSchema.default("#4b1d7a"),
  eyeColor: colorSchema.default("#30e830"),
  tabbyColor: colorSchema.default("#8c8e94"),
  tabbyStripeColor: colorSchema.default("#2a2b30"),
  tabbyLightColor: colorSchema.default("#d0d0d4"),
  tabbyEyeColor: colorSchema.default("#f0b020"),
};

export const coatParams = {
  ...furParams,
  sparkColor: colorSchema.default("#ffe060"),
};

export type FurParams = { [K in keyof typeof furParams]: string };

export const catIds = ["tabby", "black"] as const;

export type CatId = (typeof catIds)[number];

export function getCoats(params: FurParams): [tabby: Coat, black: Coat] {
  return [
    getTabbyCoat(
      parseColor(params.tabbyColor),
      parseColor(params.tabbyStripeColor),
      parseColor(params.tabbyLightColor),
      parseColor(params.tabbyEyeColor),
    ),
    getSolidCoat(parseColor(params.color), parseColor(params.eyeColor)),
  ];
}

export function getCoat(params: FurParams & { cat: CatId }): Coat {
  const [tabby, black] = getCoats(params);
  return params.cat === "tabby" ? tabby : black;
}

function drawCats(
  raster: Raster,
  [tabby, black]: [tabby: CatState, black: CatState],
  [tabbyCoat, blackCoat]: [tabby: Coat, black: Coat],
  { blackSize = CAT_SIZE, tabbyVisible = true, tabbyFlash = 0 } = {},
): void {
  drawCat(
    raster,
    {
      x: black.x,
      y: black.y,
      size: blackSize,
      rotate: getRotation(BLACK_TILT[0] ?? 0, black.yaw, BLACK_TILT[1] ?? 0),
    },
    blackCoat,
  );
  if (tabbyVisible) {
    drawCat(
      raster,
      {
        x: tabby.x,
        y: tabby.y,
        size: CAT_SIZE,
        rotate: getRotation(TABBY_TILT[0] ?? 0, tabby.yaw, TABBY_TILT[1] ?? 0),
        flash: tabbyFlash,
      },
      tabbyCoat,
    );
  }
}

const BLACK_MOVE_END = 0.2;
const SPAWN_START = 0.22;
const SPAWN_END = 0.45;
const CHARGE_END = 0.85;
const WINDUP_END = 0.95;
const LAUNCH_DISTANCE = 9;
const WINDUP_DISTANCE = 2.5;
const SPAWN_TURNS = 9;
const BLACK_SPAWN_TURNS = 3;

export function getSpawnVisibility(spawn: number): boolean {
  if (spawn <= 0) {
    return false;
  }
  if (spawn >= 0.85) {
    return true;
  }
  const blinks = 3 + spawn * 9;
  return (spawn * blinks) % 1 < 0.25 + 0.6 * spawn;
}

export function drawSpawnRing(
  raster: Raster,
  x: number,
  y: number,
  spawn: number,
  color: Color,
): void {
  if (spawn <= 0 || spawn >= 0.5) {
    return;
  }
  const life = spawn / 0.5;
  const radius = 2 + 14 * easings.easeOutCubic(life);
  const fade = 1 - life;
  const dots = 16;
  for (let dot = 0; dot < dots; dot++) {
    const angle = (dot / dots) * TAU + life * 2;
    fillRasterCircle(
      raster,
      x + Math.cos(angle) * radius,
      y + Math.sin(angle) * radius * 0.6,
      0.5 + 0.4 * fade,
      [color[0] * fade, color[1] * fade, color[2] * fade],
    );
  }
}

export function drawChargeParticles(
  raster: Raster,
  x: number,
  y: number,
  charge: number,
  color: Color,
): void {
  if (charge <= 0 || charge >= 1) {
    return;
  }
  const count = 10;
  for (let particle = 0; particle < count; particle++) {
    const random = createRandom(hashSeed(11, particle));
    const offset = random();
    const angle = random() * TAU;
    const cycle = (charge * 5 + offset) % 1;
    const distance = 18 * (1 - easings.easeInQuad(cycle));
    const fade = Math.sin(cycle * Math.PI) * Math.min(1, charge * 4);
    fillRasterCircle(raster, x + Math.cos(angle) * distance, y + Math.sin(angle) * distance, 0.6, [
      color[0] * fade,
      color[1] * fade,
      color[2] * fade,
    ]);
  }
}

export const catSpawn = defineEffect({
  id: "cat-spawn",
  name: "Cat spawn",
  kind: "pixel",
  params: z.object({
    ...coatParams,
    shake: z.number().min(0).max(4).default(1.6),
  }),
  render(image, { params, progress }) {
    const [tabbyTarget, blackTarget] = getBounceState(0);
    const coats = getCoats(params);
    const spark = parseColor(params.sparkColor);

    const move = easings.easeInOutCubic(getSpan(progress, 0, BLACK_MOVE_END));
    const blackYawTarget = (((blackTarget.yaw % TAU) + TAU) % TAU) + TAU * BLACK_SPAWN_TURNS;
    const black: CatState = {
      x: WIDTH / 2 + (blackTarget.x - WIDTH / 2) * move,
      y: HEIGHT / 2 + (blackTarget.y - HEIGHT / 2) * move,
      yaw: blackYawTarget * progress,
    };

    const spawn = getSpan(progress, SPAWN_START, SPAWN_END);
    const charge = getSpan(progress, SPAWN_END, CHARGE_END);
    const windup = easings.easeOutCubic(getSpan(progress, CHARGE_END, WINDUP_END));
    const launch = easings.easeInQuad(getSpan(progress, WINDUP_END, 1));
    const backOff =
      LAUNCH_DISTANCE + WINDUP_DISTANCE * windup - (LAUNCH_DISTANCE + WINDUP_DISTANCE) * launch;
    const shakeAmount =
      params.shake * (charge * charge + windup) * (1 - launch) * (progress < 1 ? 1 : 0);
    const shakeRandom = createRandom(hashSeed(3, Math.floor(progress * 600)));
    const spin = getSpan(progress, SPAWN_START, 1);
    const tabby: CatState = {
      x:
        tabbyTarget.x -
        IMPACT_DIRECTION[0] * backOff +
        getRandomBetween(shakeRandom, -1, 1) * shakeAmount,
      y:
        tabbyTarget.y -
        IMPACT_DIRECTION[1] * backOff +
        getRandomBetween(shakeRandom, -1, 1) * shakeAmount,
      yaw: tabbyTarget.yaw - Math.sign(TABBY_TURNS) * TAU * SPAWN_TURNS * (1 - spin * spin),
    };

    const raster = createRaster();
    drawCats(raster, [tabby, black], coats, {
      blackSize: STARING_CAT_SIZE + (CAT_SIZE - STARING_CAT_SIZE) * move,
      tabbyVisible: getSpawnVisibility(spawn),
      tabbyFlash: 1 - easings.easeOutCubic(clamp(spawn * 1.6)),
    });
    drawSpawnRing(raster, tabby.x, tabby.y, spawn, spark);
    drawChargeParticles(raster, tabby.x, tabby.y, charge, spark);
    resolveRaster(raster, image);
  },
});

export const catBounce = defineEffect({
  id: "cat-bounce",
  name: "Cat bounce",
  kind: "pixel",
  params: z.object(coatParams),
  render(image, { params, progress }) {
    const time = progress * loopTime;
    const raster = createRaster();
    drawCats(raster, getBounceState(time), getCoats(params));
    drawSparks(raster, time, parseColor(params.sparkColor));
    resolveRaster(raster, image);
  },
});
