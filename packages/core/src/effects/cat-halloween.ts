import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { type Color, HEIGHT, type RgbaImage, WIDTH, setRgbaPixel } from "../frame.ts";
import {
  type Rotation,
  type Vector,
  addCone,
  addEllipsoid,
  createMesh,
  createRaster,
  fillRasterCircle,
  getRotation,
  resolveRaster,
} from "../mesh.ts";
import { createRandom, getRandomBetween, hashSeed } from "../random.ts";
import { type Palette, drawSprite, getAnimationFrame } from "../sprite.ts";
import { TAU, coatParams, getCoats, toRadians } from "./cat-duo.ts";
import { type CatPose, drawCat, drawCatProp, getGhostCoat } from "./cat-model.ts";
import { batFrames } from "./demon-hunters/sprites.ts";

type BroomPart = "handle" | "bristles" | "band";
type HatPart = "hat" | "brim" | "ribbon";

function getCycle(value: number): number {
  return ((value % 1) + 1) % 1;
}

function getScaled([r, g, b]: Color, amount: number): Color {
  return [r * amount, g * amount, b * amount];
}

function getBroomMesh() {
  const mesh = createMesh<BroomPart>();
  addEllipsoid(mesh, [0, -0.72, 0.1], [0.07, 0.07, 2.1], "handle", 4, 8);
  addEllipsoid(mesh, [0, -0.72, -2.25], [0.36, 0.34, 0.7], "bristles", 6, 10);
  addEllipsoid(mesh, [0, -0.72, -1.6], [0.16, 0.16, 0.1], "band", 4, 8);
  return mesh;
}

function getHatMesh() {
  const mesh = createMesh<HatPart>();
  addEllipsoid(mesh, [0, 1.02, 0.66], [0.62, 0.05, 0.56], "brim", 4, 14);
  addEllipsoid(mesh, [0, 1.1, 0.64], [0.33, 0.08, 0.3], "ribbon", 4, 10);
  addCone(mesh, [0, 1.06, 0.64], [0.05, 1.95, 0.35], [0.32, 0.3], "hat", 10);
  return mesh;
}

const broomMesh = getBroomMesh();
const hatMesh = getHatMesh();

const BAT_PALETTE: Palette = {
  w: [40, 20, 60],
  r: [30, 14, 44],
  d: [30, 14, 44],
  e: [255, 140, 20],
  k: [40, 20, 60],
  m: [200, 200, 200],
};

function drawMoon(image: RgbaImage, x: number, y: number, radius: number, color: Color): void {
  for (let pixelY = 0; pixelY < HEIGHT; pixelY++) {
    for (let pixelX = 0; pixelX < WIDTH; pixelX++) {
      const distance = Math.hypot(pixelX + 0.5 - x, pixelY + 0.5 - y);
      if (distance <= radius) {
        const crater =
          Math.hypot(pixelX - x + 5, pixelY - y + 4) < 3.5 ||
          Math.hypot(pixelX - x - 6, pixelY - y - 5) < 2.5 ||
          Math.hypot(pixelX - x - 2, pixelY - y + 9) < 2;
        const edge = Math.min(1, radius - distance);
        const shade = (crater ? 0.82 : 1) * (1 - 0.18 * (distance / radius) ** 2);
        setRgbaPixel(image, pixelX, pixelY, getScaled(color, shade * (0.5 + 0.5 * edge)));
      } else if (distance <= radius * 1.6) {
        const glow = 0.18 * (1 - (distance - radius) / (radius * 0.6)) ** 2;
        setRgbaPixel(image, pixelX, pixelY, getScaled(color, glow));
      }
    }
  }
}

function drawStars(image: RgbaImage, beat: number, count: number): void {
  for (let index = 0; index < count; index++) {
    const x = hashSeed(0xca71, index, 0) % WIDTH;
    const y = hashSeed(0xca71, index, 1) % HEIGHT;
    const twinkle = (hashSeed(0xca71, index, Math.floor(beat)) % 4) / 3;
    setRgbaPixel(image, x, y, getScaled([210, 200, 255], 0.25 + 0.45 * twinkle));
  }
}

const BRISTLE_TIP: Vector = [0, -0.72, -2.6];
const HEAD_PIVOT: Vector = [0, 0.35, 0.45];
const HEAD_ROTATION = getRotation(toRadians(-8), toRadians(-20), 0);

function getHatPosition(vector: Vector): Vector {
  const [x, y, depth] = HEAD_ROTATION([
    vector[0] - HEAD_PIVOT[0],
    vector[1] - HEAD_PIVOT[1],
    vector[2] - HEAD_PIVOT[2],
  ]);
  return [x + HEAD_PIVOT[0], y + HEAD_PIVOT[1], depth + HEAD_PIVOT[2]];
}

function getRiderPose(beat: number): CatPose {
  const swing = Math.sin(beat * Math.PI);
  return {
    frontLeftLeg: getRotation(toRadians(-30 + 15 * swing), 0, toRadians(-35)),
    frontRightLeg: getRotation(toRadians(-30 - 15 * swing), 0, toRadians(35)),
    backLeftLeg: getRotation(toRadians(40 + 10 * swing), 0, toRadians(-40)),
    backRightLeg: getRotation(toRadians(40 - 10 * swing), 0, toRadians(40)),
    tail: getRotation(toRadians(-75), toRadians(15 * swing), 0),
    head: HEAD_ROTATION,
  };
}

function getOffset(rotate: Rotation, offset: Vector, size: number): Vector {
  const [x, y, depth] = rotate(offset);
  return [x * size, -y * size, depth];
}

export const catBroom = defineEffect({
  id: "cat-broom",
  name: "Cat broom ride",
  kind: "pixel",
  params: z.object({
    ...coatParams,
    moonColor: colorSchema.default("#ffe2a0"),
    hatColor: colorSchema.default("#241034"),
    ribbonColor: colorSchema.default("#ff6a00"),
    trailColor: colorSchema.default("#7dff4a"),
    size: z.number().min(4).max(14).default(7),
    passes: z.number().int().min(1).max(4).default(1),
    bats: z.number().int().min(0).max(6).default(3),
  }),
  render(image, { params, beat, progress }) {
    const [tabbyCoat, blackCoat] = getCoats(params);
    const moon = parseColor(params.moonColor);
    const hat = parseColor(params.hatColor);
    const ribbon = parseColor(params.ribbonColor);
    const trail = parseColor(params.trailColor);
    drawStars(image, beat, 26);
    drawMoon(image, 40, 24, 17, moon);
    for (let bat = 0; bat < params.bats; bat++) {
      const random = createRandom(hashSeed(0xba7, bat));
      const speed = Math.round(getRandomBetween(random, 1, 3));
      const along = getCycle(progress * speed + random());
      const x = WIDTH + 10 - along * (WIDTH + 20);
      const y = getRandomBetween(random, 6, 30) + 3 * Math.sin((beat + bat) * Math.PI);
      drawSprite(image, getAnimationFrame(batFrames, beat * 4 + bat, 1), x, y, BAT_PALETTE);
    }

    const size = params.size;
    const lane = WIDTH + size * 7;
    const getPosition = (at: number): [number, number] => {
      const pass = getCycle(at * params.passes);
      const passIndex = Math.floor(at * params.passes);
      const high = passIndex % 2 === 0 ? 0 : -10;
      return [
        pass * lane - size * 3.5,
        36 + high - 8 * Math.sin(pass * Math.PI) + 2 * Math.sin(at * params.passes * TAU * 4),
      ];
    };
    const [x, y] = getPosition(progress);
    const [, previousY] = getPosition(progress - 0.002);
    const climb = Math.atan2(previousY - y, 2);
    const rotate = getRotation(toRadians(10) - climb * 0.5, Math.PI / 2 - 0.3, -climb * 0.2);

    const raster = createRaster();
    for (let spark = 0; spark < 24; spark++) {
      const random = createRandom(hashSeed(0x5ca7, spark));
      const delay = (spark + getCycle(beat * 4)) * 0.004;
      const [trailX, trailY] = getPosition(progress - delay);
      const [bristleX, bristleY] = getOffset(rotate, BRISTLE_TIP, size);
      const fade = 1 - spark / 24;
      fillRasterCircle(
        raster,
        trailX + bristleX + getRandomBetween(random, -2, 2) * (1 - fade),
        trailY + bristleY + getRandomBetween(random, -2, 2) * (1 - fade),
        0.35 + 0.45 * fade,
        getScaled(trail, fade),
      );
    }
    const pose = getRiderPose(beat);
    const riders = [
      { offset: [0, 0.15, -0.95] as Vector, coat: tabbyCoat, hasHat: false },
      { offset: [0, 0.15, 0.85] as Vector, coat: blackCoat, hasHat: true },
    ];
    drawCatProp(raster, { x, y, size, rotate }, broomMesh, (part, [, , depth], shade) => {
      if (part === "bristles") {
        const straw = 0.75 + 0.25 * Math.sin(depth * 40);
        return getScaled([190, 140, 60], shade * straw);
      }
      return part === "band" ? getScaled(ribbon, shade) : getScaled([110, 70, 40], shade);
    });
    for (const { offset, coat, hasHat } of riders) {
      const [offsetX, offsetY, depth] = getOffset(rotate, offset, size);
      const placement = { x: x + offsetX, y: y + offsetY, size, rotate, depth, pose };
      drawCat(raster, placement, coat);
      if (hasHat) {
        drawCatProp(
          raster,
          { ...placement, rotate: (vector) => rotate(getHatPosition(vector)) },
          hatMesh,
          (part, _position, shade) => getScaled(part === "ribbon" ? ribbon : hat, shade * 1.3),
        );
      }
    }
    resolveRaster(raster, image);
  },
});

export const catGhosts = defineEffect({
  id: "cat-ghosts",
  name: "Ghost cats",
  kind: "pixel",
  params: z.object({
    glowColor: colorSchema.default("#b8f0ff"),
    eyeColor: colorSchema.default("#05121c"),
    size: z.number().min(4).max(16).default(9),
    count: z.number().int().min(1).max(4).default(2),
    float: z.number().min(0).max(12).default(5),
    fade: z.number().min(0).max(1).default(0.35),
  }),
  render(image, { params, beat, progress }) {
    const glow = parseColor(params.glowColor);
    const coat = getGhostCoat(glow, parseColor(params.eyeColor));
    const raster = createRaster();
    const alphas: number[] = [];
    for (let ghost = 0; ghost < params.count; ghost++) {
      const phase = ghost / params.count;
      const angle = (progress + phase) * TAU;
      const x = WIDTH / 2 + Math.sin(angle) * 18 * (params.count > 1 ? 1 : 0.3);
      const baseY = HEIGHT / 2 + 2 + Math.cos(angle * 2) * 4;
      const y = baseY + Math.sin((beat / 4 + phase) * TAU) * params.float;
      const yaw = Math.cos(angle) * 0.9;
      const dangle = toRadians(25 + 10 * Math.sin(beat * Math.PI + ghost));
      const pose: CatPose = {
        frontLeftLeg: getRotation(dangle, 0, 0),
        frontRightLeg: getRotation(dangle, 0, 0),
        backLeftLeg: getRotation(dangle, 0, 0),
        backRightLeg: getRotation(dangle, 0, 0),
        tail: getRotation(toRadians(-60), 0, toRadians(30 * Math.sin(beat * Math.PI))),
        head: getRotation(toRadians(-10 + 15 * Math.sin(beat * Math.PI * 0.5)), 0, 0),
      };
      for (let wisp = 1; wisp <= 6; wisp++) {
        const sway = Math.sin(beat * Math.PI + wisp * 0.9) * wisp * 0.6;
        fillRasterCircle(
          raster,
          x + sway,
          y + params.size * 0.9 + wisp * 1.8,
          params.size * 0.45 * (1 - wisp / 7),
          getScaled(glow, 0.55 * (1 - wisp / 7)),
        );
      }
      drawCat(
        raster,
        { x, y, size: params.size, rotate: getRotation(toRadians(10), yaw, 0), pose, depth: ghost },
        coat,
      );
      alphas.push(1 - params.fade * (0.5 + 0.5 * Math.sin((beat / 2 + phase * 3) * TAU)));
    }
    resolveRaster(raster, image);
    const alpha = alphas.reduce((sum, value) => sum + value, 0) / Math.max(1, alphas.length);
    const flicker = getCycle(beat) < 0.06 && Math.floor(beat) % 4 === 3 ? 0.4 : 1;
    for (let offset = 3; offset < image.length; offset += 4) {
      image[offset] = (image[offset] ?? 0) * alpha * flicker;
    }
  },
});
