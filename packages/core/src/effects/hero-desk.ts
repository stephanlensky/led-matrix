import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { type Color, HEIGHT, type RgbaImage, WIDTH } from "../frame.ts";
import { easings } from "../keyframes.ts";
import { createRandom, getRandomBetween, hashSeed } from "../random.ts";
import {
  type Mesh,
  type Vector,
  addBox,
  addEllipsoid,
  subtract,
  createMesh,
  createRaster,
  getRotation,
  compositeRaster,
} from "../mesh.ts";
import { TAU, clamp, furParams, toRadians } from "./cat-duo.ts";
import { getCycle } from "./cat-dance.ts";
import { getOvershoot } from "./cat-wands.ts";
import { mix, setScaledColor } from "./cat-model.ts";
import { getCharacterHead } from "./character-heads.ts";
import {
  ELBOW,
  type HeroAttachment,
  type HeroId,
  type HeroPlacement,
  type PropPart,
  SHOULDER,
  SOLE_Y,
  drawHero,
  drawProp,
  getHeroPoint,
  getOutfitColor,
  heroIds,
} from "./frieren-model.ts";
import { blendPixel, drawHeart } from "./heart.ts";
import { getBeatKick } from "./heart-pulse.ts";
import { getAlignment } from "./frieren-pose.ts";
import { drawThought, getThoughtMask } from "./thought-bubble.ts";

const WHITE: Color = [255, 255, 255];
const DESK_Y = 0.12;
const DESK_HALF: Vector = [0.9, 0.04, 0.45];
const DESK_Z = 0.78;
const SEAT_Y = -0.24;
const TORSO_PIVOT: Vector = [0, 0.1, 0];
const FACE: Vector = [0.2, 0.9, 0.48];
const TEAR_LAND: Vector = [-0.5, DESK_Y, 1.05];

const partners: Readonly<Record<HeroId, HeroId>> = { frieren: "himmel", himmel: "frieren" };

const defaultFur = z.object(furParams).parse({});

function createDeskMesh(): Mesh<PropPart> {
  const mesh = createMesh<PropPart>();
  const [hx, hy, hz] = DESK_HALF;
  const top = DESK_Y - hy;
  addBox(mesh, [0, top, DESK_Z], DESK_HALF, "wood");
  const legHeight = (top - hy - SOLE_Y) / 2;
  for (const x of [-hx + 0.06, hx - 0.06]) {
    for (const depth of [DESK_Z - hz + 0.06, DESK_Z + hz - 0.06]) {
      addBox(mesh, [x, SOLE_Y + legHeight, depth], [0.05, legHeight, 0.05], "darkWood");
    }
  }
  addBox(mesh, [0, SEAT_Y, -0.05], [0.32, 0.04, 0.3], "darkWood");
  const seatLeg = (SEAT_Y - 0.04 - SOLE_Y) / 2;
  for (const x of [-0.26, 0.26]) {
    for (const depth of [-0.3, 0.2]) {
      addBox(mesh, [x, SOLE_Y + seatLeg, depth], [0.04, seatLeg, 0.04], "darkWood");
    }
  }
  return mesh;
}

const deskMesh = createDeskMesh();

const ARM_RADIUS = 0.11;
const ELBOW_Z = 0.72;
const FOREARM_Y = DESK_Y + ARM_RADIUS;

function getElbow(side: number): Vector {
  return [side * 0.46, FOREARM_Y, ELBOW_Z];
}

function getHand(side: number): Vector {
  return [-side * 0.26, FOREARM_Y + (side > 0 ? 0.09 : 0), ELBOW_Z + (side > 0 ? 0.2 : 0.28)];
}

function createArmsMesh(): Mesh<PropPart> {
  const mesh = createMesh<PropPart>();
  const segments = 6;
  for (const side of [-1, 1]) {
    const [ex, ey, ez] = getElbow(side);
    const [hx, hy, hz] = getHand(side);
    for (let index = 0; index <= segments; index++) {
      const t = index / segments;
      const radius = ARM_RADIUS * (1 - 0.1 * t);
      addEllipsoid(
        mesh,
        [ex + (hx - ex) * t, ey + (hy - ey) * t, ez + (hz - ez) * t],
        [radius, radius * 1.1, radius],
        t > 0.8 ? "cuff" : "sleeve",
        5,
        8,
      );
    }
    addEllipsoid(mesh, [hx - side * 0.08, hy, hz], [0.09, 0.08, 0.1], "hand", 5, 8);
  }
  return mesh;
}

const armsMesh = createArmsMesh();

function getArmsAttachment(hero: HeroId): HeroAttachment {
  const colors: Partial<Record<PropPart, Color>> = {
    sleeve: getOutfitColor(hero, "sleeve", [0, 0.3, 0]),
    cuff: getOutfitColor(hero, "forearm", [0, 0, 0]),
    hand: getOutfitColor(hero, "skin", [0, 0, 0]),
  };
  return {
    joint: "hips",
    mesh: armsMesh,
    getColor: (part, shade, out) => setScaledColor(out, colors[part] ?? WHITE, shade),
  };
}

function getTorsoPoint(lean: number, [x, y, depth]: Vector): Vector {
  const undo = getRotation(-lean, 0, 0);
  const [px, py, pz] = undo([x - TORSO_PIVOT[0], y - TORSO_PIVOT[1], depth - TORSO_PIVOT[2]]);
  return [px + TORSO_PIVOT[0], py + TORSO_PIVOT[1], pz + TORSO_PIVOT[2]];
}

function getUpperArm(lean: number, side: number) {
  const shoulder: Vector = [side * SHOULDER[0], SHOULDER[1], 0];
  const elbow: Vector = [side * ELBOW[0], ELBOW[1], 0];
  return getAlignment(
    subtract(elbow, shoulder),
    subtract(getTorsoPoint(lean, getElbow(side)), shoulder),
  );
}

function getSadPose(lean: number, nuzzle: number): HeroPlacement["pose"] {
  return {
    torso: getRotation(lean, 0, 0),
    head: getRotation(toRadians(45 + 4 * nuzzle), toRadians(-20), toRadians(4 * nuzzle)),
    hair: getRotation(toRadians(-30), 0, 0),
    cape: getRotation(-lean * 0.7, 0, 0),
    skirt: getRotation(toRadians(-20), 0, 0),
    leftArm: getUpperArm(lean, -1),
    rightArm: getUpperArm(lean, 1),
    leftLeg: getRotation(toRadians(-85), 0, toRadians(-4)),
    rightLeg: getRotation(toRadians(-85), 0, toRadians(4)),
    leftShin: getRotation(toRadians(85), 0, 0),
    rightShin: getRotation(toRadians(85), 0, 0),
  };
}

const RAIN_SEED = 0x7a1d;
const RAIN_SPEED = 90;
const RAIN_SLANT = 0.25;
const RAIN_LENGTH = 4;
const HEART_SEED = 0x5ad;

function drawRain(image: RgbaImage, pulse: number, count: number, color: Color): void {
  const newest = Math.floor(pulse);
  for (let index = newest - 1; index <= newest; index++) {
    const random = createRandom(hashSeed(RAIN_SEED, index));
    for (let drop = 0; drop < count; drop++) {
      const x = getRandomBetween(random, -8, WIDTH);
      const floor = getRandomBetween(random, HEIGHT - 10, HEIGHT - 1);
      const age = pulse - index;
      const delay = drop === 0 ? 0 : getRandomBetween(random, 0, 0.9);
      const time = age - delay;
      if (time < 0) {
        continue;
      }
      const y = -RAIN_LENGTH + time * RAIN_SPEED;
      if (y < floor) {
        const brightness = drop === 0 ? 1 : 0.7;
        for (let step = 0; step < RAIN_LENGTH; step++) {
          const py = y - step;
          blendPixel(
            image,
            Math.round(x + py * RAIN_SLANT),
            Math.round(py),
            step === 0 ? mix(color, WHITE, 0.6) : color,
            brightness * (1 - step / RAIN_LENGTH),
          );
        }
        continue;
      }
      const splash = (y - floor) / (RAIN_SPEED * 0.25);
      if (splash >= 1) {
        continue;
      }
      const landX = Math.round(x + floor * RAIN_SLANT);
      const reach = 1 + 2 * easings.easeOutCubic(splash);
      for (const side of [-1, 1]) {
        blendPixel(
          image,
          Math.round(landX + side * reach),
          Math.round(floor - 2 * Math.sin(splash * Math.PI)),
          color,
          1 - splash,
        );
      }
    }
  }
}

function drawTear(
  image: RgbaImage,
  pulse: number,
  [x, y]: readonly [number, number],
  [landX, landY]: readonly [number, number],
  color: Color,
): void {
  const phase = getCycle(pulse);
  if (phase < 0.5) {
    const swell = easings.easeOutCubic(phase / 0.5);
    blendPixel(image, Math.round(x), Math.round(y), color, swell);
    return;
  }
  const fall = easings.easeInQuad(clamp((phase - 0.5) / 0.3));
  if (phase < 0.8) {
    const dropX = Math.round(x + (landX - x) * fall);
    const dropY = Math.round(y + (landY - y) * fall);
    blendPixel(image, dropX, dropY, mix(color, WHITE, 0.5));
    blendPixel(image, dropX, dropY - 1, color, 0.7);
    return;
  }
  const splash = (phase - 0.8) / 0.2;
  const reach = 1 + 2 * easings.easeOutCubic(splash);
  for (const side of [-1, 1]) {
    blendPixel(image, Math.round(landX + side * reach), Math.round(landY), color, 1 - splash);
  }
}

function drawBeatHearts(
  image: RgbaImage,
  pulse: number,
  [left, top, width, height]: readonly [number, number, number, number],
  color: Color,
): void {
  const newest = Math.floor(pulse);
  for (let index = newest - 1; index <= newest; index++) {
    const age = pulse - index;
    if (age >= 1.2) {
      continue;
    }
    const random = createRandom(hashSeed(HEART_SEED, index));
    const side = index % 2 === 0 ? 1 : -1;
    const x = left + width / 2 + side * (width / 2 + getRandomBetween(random, 0, 3));
    const y = top + getRandomBetween(random, 2, height - 6) - age * 4;
    drawHeart(image, {
      x,
      y,
      size: 5 * getOvershoot(clamp(age * 4)),
      color: index % 4 < 2 ? color : mix(color, WHITE, 0.4),
      amount: clamp((1.2 - age) * 2),
      angle: side * 0.25,
    });
  }
}

export const heroDesk = defineEffect({
  id: "hero-desk",
  name: "Frieren and Himmel sad at desk",
  kind: "pixel",
  params: z.object({
    hero: z.enum(heroIds).default("frieren"),
    every: z.number().min(0.25).max(4).default(1),
    sigh: z.number().min(1).max(16).default(4),
    rain: z.number().min(0).max(12).default(3),
    rainColor: colorSchema.default("#4cb4ff"),
    heartColor: colorSchema.default("#ff5a8c"),
    size: z.number().min(8).max(32).default(16),
    yaw: z.number().min(-180).max(180).default(-45),
    pitch: z.number().min(0).max(60).default(25),
  }),
  render(image, { params, beat }) {
    const rain = parseColor(params.rainColor);
    const heart = parseColor(params.heartColor);
    const { pulse, kick } = getBeatKick(beat, params.every);
    const breath = 0.5 - 0.5 * Math.cos(getCycle(beat / params.sigh) * TAU);
    const lean = toRadians(32 - 5 * breath);
    const placement: HeroPlacement = {
      x: WIDTH / 2 + 4,
      y: HEIGHT / 2 + 6,
      size: params.size,
      rotate: getRotation(toRadians(params.pitch), toRadians(params.yaw), 0),
      eyes: "closed",
      pose: getSadPose(lean, kick),
      hidden: ["leftForearm", "rightForearm"],
      attachments: [getArmsAttachment(params.hero)],
    };
    drawRain(image, pulse, params.rain, rain);
    const raster = createRaster();
    drawProp(raster, deskMesh, placement);
    drawHero(raster, params.hero, placement);
    compositeRaster(raster, image);
    const [faceX, faceY] = getHeroPoint(params.hero, placement, FACE, "head");
    const [landX, landY] = getHeroPoint(params.hero, placement, TEAR_LAND);
    drawTear(image, pulse, [faceX, faceY], [landX, landY], rain);
    const head = getCharacterHead(partners[params.hero], defaultFur);
    const mask = getThoughtMask(head);
    const top = getHeroPoint(params.hero, placement, [0, 1.5, 0], "head");
    const pump = 1 + 0.1 * kick;
    const thought = {
      x: 2,
      y: 2,
      head,
      anchor: [top[0] - 4, top[1] - 1] as const,
      timing: { dots: 2, scale: pump },
      bob: kick > 0.4 ? 1 : 0,
    };
    drawThought(image, thought);
    drawBeatHearts(image, pulse, [thought.x, thought.y, mask.width, mask.height], heart);
  },
});
