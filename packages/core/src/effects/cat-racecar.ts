import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { type Color, HEIGHT, type RgbaImage, WIDTH, setRgbaPixel } from "../frame.ts";
import {
  type Raster,
  type Rotation,
  type Vector,
  addBox,
  addEllipsoid,
  createMesh,
  createRaster,
  fillRasterCircle,
  getRotation,
  resolveRaster,
} from "../mesh.ts";
import { createRandom, getRandomBetween, hashSeed } from "../random.ts";
import { TAU, coatParams, getCoats, toRadians } from "./cat-duo.ts";
import { getCycle, getHeadbangAngle } from "./cat-dance.ts";
import {
  type CatPose,
  SIT,
  TUCK,
  UNSIT,
  drawCat,
  drawCatProp,
  getCatOffset,
  mix,
  scale,
} from "./cat-model.ts";

type CarPart = "body" | "wing" | "tire" | "seat" | "light" | "pipe" | "flame";

const WHEEL_X = 0.66;
const WHEEL_Y = -0.92;
const WHEEL_Z = 1.55;
const WHEEL_RADIUS = 0.46;
const HUB_RADIUS = 0.26;
const GROUND_Y = WHEEL_Y - WHEEL_RADIUS;
const DRIVER_OFFSET: Vector = [0, -0.36, 0.45];
const PASSENGER_OFFSET: Vector = [0, -0.26, -1.0];
const VIEW_PITCH = toRadians(8);
const VIEW_YAW = Math.PI / 2;
const STREAK_SEED = 0xca4;
const TIRE: Color = [34, 34, 40];
const RIM: Color = [210, 214, 222];
const SEAT: Color = [24, 24, 28];
const LIGHT: Color = [255, 240, 170];
const PIPE: Color = [120, 120, 130];
const FLAME: Color = [255, 150, 30];

function getCarMesh() {
  const mesh = createMesh<CarPart>();
  addEllipsoid(mesh, [0, -0.5, -0.1], [0.62, 0.42, 2.25], "body", 8, 16);
  addBox(mesh, [0, -0.68, -0.15], [0.58, 0.52, 1.85], "body");
  addEllipsoid(mesh, [0, -0.2, -0.4], [0.42, 0.1, 1.25], "seat", 6, 12);
  addBox(mesh, [0, -0.82, 2.15], [0.85, 0.05, 0.22], "wing");
  for (const side of [-1, 1]) {
    addBox(mesh, [side * 0.28, 0.02, -2.1], [0.04, 0.32, 0.06], "wing");
    addEllipsoid(mesh, [side * 0.34, -0.42, 2.05], [0.12, 0.1, 0.08], "light", 4, 8);
    for (const end of [-1, 1]) {
      addEllipsoid(
        mesh,
        [side * WHEEL_X, WHEEL_Y, end * WHEEL_Z],
        [0.2, WHEEL_RADIUS, WHEEL_RADIUS],
        "tire",
        6,
        14,
      );
    }
  }
  addBox(mesh, [0, 0.36, -2.15], [0.9, 0.06, 0.24], "wing");
  addEllipsoid(mesh, [-0.3, -0.7, -2.35], [0.09, 0.09, 0.2], "pipe", 4, 8);
  return mesh;
}

function getFlameMesh(length: number) {
  const mesh = createMesh<CarPart>();
  addEllipsoid(mesh, [-0.3, -0.7, -2.55 - length * 0.5], [0.12, 0.12, length * 0.5], "flame", 4, 8);
  return mesh;
}

const carMesh = getCarMesh();

function getCarColor(car: Color, stripe: Color, spin: number) {
  return (part: CarPart, [x, y, depth]: Vector, shade: number): Color => {
    if (part === "tire") {
      const dy = y - WHEEL_Y;
      const dz = depth - Math.sign(depth) * WHEEL_Z;
      const radius = Math.hypot(dy, dz);
      const isFace = Math.abs(x) > WHEEL_X + 0.08;
      if (isFace && radius < HUB_RADIUS) {
        const spoke = getCycle(((Math.atan2(dy, dz) + spin) / TAU) * 4) < 0.35;
        return scale(spoke ? TIRE : RIM, Math.max(shade, 0.9));
      }
      return scale(TIRE, shade);
    }
    if (part === "body") {
      const isStripe = Math.abs(x) < 0.14 && y > -0.5;
      const roundel = Math.hypot(y + 0.6, depth - 1.05) < 0.24 && Math.abs(x) > 0.45;
      return scale(isStripe || roundel ? stripe : car, shade);
    }
    if (part === "wing") {
      return scale(mix(car, [0, 0, 0], 0.35), shade);
    }
    if (part === "seat") {
      return scale(SEAT, shade);
    }
    if (part === "light") {
      return LIGHT;
    }
    if (part === "pipe") {
      return scale(PIPE, shade);
    }
    return mix(FLAME, [255, 240, 140], Math.max(0, shade - 0.6));
  };
}

function getSquashedRotation(rotate: Rotation, squash: number): Rotation {
  const sideways = 1 + squash * 0.6;
  return ([x, y, depth]) => rotate([x * sideways, y * (1 - squash), depth * sideways]);
}

function getHeadRotation(pitch: number, yaw: number, roll: number): Rotation {
  const turn = getRotation(pitch, yaw, roll);
  return (vector) => UNSIT(turn(vector));
}

function getDriverPose(bang: number, beat: number): CatPose {
  const steer = Math.sin(beat * Math.PI);
  return {
    head: getHeadRotation(
      toRadians(-5 + 35 * bang),
      toRadians(-35 + 8 * steer),
      toRadians(8 * steer),
    ),
    frontLeftLeg: getRotation(toRadians(-100 + 12 * steer), 0, toRadians(-15)),
    frontRightLeg: getRotation(toRadians(-100 - 12 * steer), 0, toRadians(15)),
    backLeftLeg: TUCK,
    backRightLeg: TUCK,
    tail: getRotation(toRadians(70), 0, 0),
  };
}

function getPassengerPose(bang: number, beat: number): CatPose {
  const pump = 0.5 + 0.5 * Math.cos(beat * TAU);
  const wag = Math.sin(beat * TAU);
  return {
    head: getHeadRotation(
      toRadians(-10 + 35 * bang),
      toRadians(-45 - 12 * wag),
      toRadians(-12 * wag),
    ),
    frontLeftLeg: getRotation(toRadians(-120 + 30 * pump), 0, toRadians(25)),
    frontRightLeg: getRotation(toRadians(-95 - 30 * pump), 0, toRadians(-30)),
    backLeftLeg: TUCK,
    backRightLeg: TUCK,
    tail: getRotation(toRadians(70), toRadians(25 * wag), 0),
  };
}

function drawRoad(image: RgbaImage, top: number, beat: number, line: Color): void {
  const period = 16;
  const scroll = getCycle(beat) * period * 2;
  for (let x = 0; x < WIDTH; x++) {
    const isDash = (x + scroll) % period < period * 0.55;
    if (isDash) {
      setRgbaPixel(image, x, top, line);
      setRgbaPixel(image, x, top + 1, scale(line, 0.6));
    }
  }
}

function drawStreaks(image: RgbaImage, beat: number, count: number, kick: number): void {
  for (let streak = 0; streak < count; streak++) {
    const random = createRandom(hashSeed(STREAK_SEED, streak));
    const y = Math.floor(getRandomBetween(random, 4, 44));
    const length = Math.floor(getRandomBetween(random, 5, 13));
    const speed = Math.round(getRandomBetween(random, 1, 3));
    const head = WIDTH + length - getCycle(beat * speed * 0.5 + random()) * (WIDTH + length * 2);
    const brightness = 0.25 + 0.25 * random() + 0.5 * kick;
    for (let offset = 0; offset < length; offset++) {
      const fade = brightness * (1 - offset / length);
      setRgbaPixel(image, Math.floor(head + offset), y, scale([200, 220, 255], fade));
    }
  }
}

function drawDust(raster: Raster, x: number, y: number, since: number): void {
  const life = Math.min(1, since * 1.6);
  const fade = 1 - life;
  if (fade <= 0) {
    return;
  }
  for (let puff = 0; puff < 3; puff++) {
    fillRasterCircle(
      raster,
      x - 4 - puff * 4 - life * 8,
      y - 1 - puff - life * 2,
      (0.9 + puff * 0.4) * (0.5 + 0.5 * fade),
      scale([140, 130, 120], fade * 0.7),
    );
  }
}

export const catRacecar = defineEffect({
  id: "cat-racecar",
  name: "Cat racecar",
  kind: "pixel",
  params: z.object({
    ...coatParams,
    carColor: colorSchema.default("#e01c24"),
    stripeColor: colorSchema.default("#f4f4f4"),
    lineColor: colorSchema.default("#ffd030"),
    every: z.number().min(0.25).max(4).default(1),
    size: z.number().min(6).max(16).default(9),
    zoom: z.number().min(0).max(0.5).default(0.14),
    shake: z.number().min(0).max(4).default(1),
    streaks: z.number().int().min(0).max(16).default(9),
  }),
  render(image, { params, beat }) {
    const [tabbyCoat, blackCoat] = getCoats(params);
    const car = parseColor(params.carColor);
    const stripe = parseColor(params.stripeColor);
    const pulse = beat / params.every;
    const index = Math.floor(pulse);
    const phase = getCycle(pulse);
    const since = phase * params.every;
    const isBig = ((index % 4) + 4) % 4 === 0;
    const power = isBig ? 1.5 : 1;
    const kick = Math.exp(-since * 7) * power;
    const wobble = Math.exp(-since * 6) * Math.cos(since * 28);
    const hop = Math.sin(phase * Math.PI) ** 2 * (isBig ? 3 : 2);
    const random = createRandom(hashSeed(STREAK_SEED, index, Math.floor(since * 24)));
    const amplitude = params.shake * Math.exp(-since * 6) * power;
    const size = params.size * (1 + params.zoom * kick);
    const rotate = getSquashedRotation(
      getRotation(VIEW_PITCH, VIEW_YAW, toRadians(4 * kick)),
      0.08 * wobble * power,
    );
    const groundScreenY = HEIGHT - 10;
    const [, groundOffset] = getCatOffset(rotate, [0, GROUND_Y, 0], size);
    const x = WIDTH / 2 + getRandomBetween(random, -1, 1) * amplitude;
    const y = groundScreenY - groundOffset - hop + getRandomBetween(random, -1, 1) * amplitude;

    drawStreaks(image, beat, params.streaks, kick);
    drawRoad(image, groundScreenY + 4, beat, parseColor(params.lineColor));

    const raster = createRaster();
    const placement = { x, y, size, rotate };
    const spin = beat * TAU * 1.5;
    const getColor = getCarColor(car, stripe, spin);
    drawCatProp(raster, placement, carMesh, getColor);
    drawCatProp(raster, placement, getFlameMesh(0.2 + 0.9 * Math.min(1, kick)), getColor);
    const bang = getHeadbangAngle(phase);
    const riders = [
      { offset: DRIVER_OFFSET, coat: tabbyCoat, pose: getDriverPose(bang, beat) },
      { offset: PASSENGER_OFFSET, coat: blackCoat, pose: getPassengerPose(bang, beat) },
    ];
    const seated: Rotation = (vector) => rotate(SIT(vector));
    for (const { offset, coat, pose } of riders) {
      const [offsetX, offsetY, depth] = getCatOffset(rotate, offset, size);
      drawCat(raster, { x: x + offsetX, y: y + offsetY, size, rotate: seated, depth, pose }, coat);
    }
    const [rearX, rearY] = getCatOffset(rotate, [0, GROUND_Y, -WHEEL_Z], size);
    drawDust(raster, x + rearX, y + rearY + hop, since);
    resolveRaster(raster, image);
  },
});
