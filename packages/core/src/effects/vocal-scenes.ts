import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { type Color, HEIGHT, type RgbaImage, WIDTH, fillRgbaImage } from "../frame.ts";
import { drawText, fonts } from "../fonts/index.ts";
import { easings } from "../keyframes.ts";
import {
  type Rotation,
  type Vector,
  compose,
  compositeRaster,
  createRaster,
  getRotation,
} from "../mesh.ts";
import { createRandom, getRandomBetween, hashSeed } from "../random.ts";
import { TAU, clamp, furParams, getCoats, toRadians } from "./cat-duo.ts";
import { VIEW_PITCH, getCycle } from "./cat-dance.ts";
import { type EyeStyle, drawEyes, getCatFace, getEyelessCoat } from "./cat-face.ts";
import {
  type CatJoint,
  type CatPlacement,
  type CatPose,
  type Coat,
  SIT,
  TUCK,
  UNSIT,
  drawCat,
  getCatPoint,
  getJointAim,
  mix,
  scale,
} from "./cat-model.ts";
import { drawStars } from "./cat-space.ts";
import { getOvershoot } from "./cat-wands.ts";
import { drawHeart } from "./heart.ts";
import { drawFloatingHearts, drawSparkles } from "./heart-particles.ts";
import { getBeatKick } from "./heart-pulse.ts";
import {
  type CritterKind,
  drawCancel,
  drawCritter,
  drawEarth,
  drawEarthFace,
  drawLine,
  drawUfo,
  drawWhiteHouse,
  fadeImage,
  fillCircle,
  fillEllipse,
  fillRect,
  getCancelShake,
} from "./vocal-shapes.ts";

export const vocalScenes = [
  "patience",
  "stack",
  "shrug",
  "bridge",
  "flag",
  "planet",
  "house",
  "animals",
  "aliens",
  "alone",
  "together",
  "okay",
] as const;

type VocalScene = (typeof vocalScenes)[number];

type SceneCat = { coat: Coat; eyeColor: Color };

type SceneInput = {
  beat: number;
  kick: number;
  since: number;
  heart: Color;
  tabby: SceneCat;
  black: SceneCat;
};

type SittingCat = {
  x: number;
  ground: number;
  size: number;
  yaw: number;
  head?: Rotation;
  tail?: number;
  pose?: CatPose;
  squash?: number;
};

const WHITE: Color = [255, 255, 255];
const BLACK: Color = [0, 0, 0];
const INK: Color = [16, 10, 20];
const SIT_DROP = 1.02;
const EAR_TIP: Vector = [0.33, 1.38, 0.64];
const PAW_TIP: Vector = [0.3, -0.94, 0.35];
const CRATE_HEIGHT = 8;
const CRATE_WIDTH = 13;
const CRATE_COUNT = 8;
const MOON: Color = [150, 150, 165];
const MOON_Y = 96;
const MOON_RADIUS = 44;

function getSquash(rotate: Rotation, squash: number, ground: number): Rotation {
  if (squash === 0) {
    return rotate;
  }
  return (vector) => {
    const [x, y, depth] = rotate(vector);
    const wide = 1 + squash * 0.6;
    return [x * wide, ground + (y - ground) * (1 - squash), depth * wide];
  };
}

function getSittingPlacement({
  x,
  ground,
  size,
  yaw,
  head = getRotation(0, 0, 0),
  tail = 0,
  pose,
  squash = 0,
}: SittingCat): CatPlacement {
  return {
    x,
    y: ground - size * SIT_DROP,
    size,
    rotate: getSquash(compose(getRotation(VIEW_PITCH, yaw, 0), SIT), squash, -SIT_DROP),
    pose: {
      head: (vector) => UNSIT(head(vector)),
      backLeftLeg: TUCK,
      backRightLeg: TUCK,
      tail: getRotation(toRadians(60), tail, 0),
      ...pose,
    },
  };
}

function drawSceneCats(
  image: RgbaImage,
  cats: readonly (readonly [CatPlacement, SceneCat])[],
  eyes: EyeStyle,
  heart: Color,
  pop = 1,
): void {
  const raster = createRaster();
  for (const [placement, { coat }] of cats) {
    drawCat(raster, placement, eyes === "open" ? coat : getEyelessCoat(coat));
  }
  compositeRaster(raster, image);
  if (eyes === "open") {
    return;
  }
  for (const [placement, { eyeColor }] of cats) {
    drawEyes(image, getCatFace(placement), eyes, eyeColor, heart, pop, placement.size * 0.36);
  }
}

function getTick(beat: number): number {
  return Math.floor(beat) + getOvershoot(clamp(getCycle(beat) / 0.22));
}

function getSwap(beat: number): number {
  const side = Math.floor(beat) % 2 === 0 ? 1 : -1;
  const previous = -side;
  return previous + (side - previous) * getOvershoot(clamp(getCycle(beat) / 0.3));
}

function drawPatience(image: RgbaImage, { beat, kick, tabby }: SceneInput): void {
  const [clockX, clockY] = [44, 19];
  const radius = 13 * (1 + 0.05 * kick);
  fillCircle(image, clockX, clockY, radius + 1, [255, 196, 50]);
  fillCircle(image, clockX, clockY, radius - 1.4, [250, 246, 236]);
  for (let index = 0; index < 12; index++) {
    const angle = (index / 12) * TAU;
    const size = index % 3 === 0 ? 1 : 0.6;
    fillCircle(
      image,
      clockX + Math.sin(angle) * (radius - 4),
      clockY - Math.cos(angle) * (radius - 4),
      size,
      INK,
    );
  }
  drawLine(image, [clockX, clockY], [clockX - 3.5, clockY - 5], 1.6, INK);
  const angle = (getTick(beat) / 12) * TAU;
  drawLine(
    image,
    [clockX, clockY],
    [clockX + Math.sin(angle) * (radius - 3), clockY - Math.cos(angle) * (radius - 3)],
    1,
    [230, 30, 40],
  );
  fillCircle(image, clockX, clockY, 1.2, INK);
  const tilt = getSwap(beat);
  const placement = getSittingPlacement({
    x: 19,
    ground: 57 + 0.6 * kick,
    size: 13,
    yaw: 0.45,
    head: getRotation(toRadians(-24), toRadians(18), toRadians(14 * tilt)),
    tail: toRadians(40 * Math.sin(beat * Math.PI)),
  });
  drawSceneCats(image, [[placement, tabby]], "open", WHITE);
}

function drawCrate(image: RgbaImage, x: number, bottom: number, zoom: number): void {
  const half = (CRATE_WIDTH / 2) * zoom;
  const top = bottom - CRATE_HEIGHT * zoom;
  fillRect(image, x - half, top, x + half, bottom, [110, 64, 26]);
  fillRect(image, x - half + zoom, top + zoom, x + half - zoom, bottom - zoom, [196, 132, 60]);
  drawLine(
    image,
    [x - half + zoom, top + zoom],
    [x + half - zoom, bottom - zoom],
    zoom,
    [130, 80, 34],
  );
  fillRect(image, x - half, top + 3.4 * zoom, x + half, top + 4.4 * zoom, [130, 80, 34]);
}

function drawStack(image: RgbaImage, { beat, black, heart }: SceneInput): void {
  const count = Math.min(CRATE_COUNT, Math.floor(beat) + 1);
  const landing = getCycle(beat);
  const since = beat - Math.floor(beat);
  const settled = Math.min(CRATE_COUNT, beat + 0.3);
  const zoom = Math.min(1, 50 / (24 + settled * CRATE_HEIGHT));
  const ground = 61;
  const squash = (0.05 + 0.025 * Math.min(count, 6)) * (1 + 1.4 * Math.exp(-since * 9));
  const wobble = (index: number) =>
    Math.sin(beat * Math.PI + index * 0.5) * (index / CRATE_COUNT) ** 1.6 * 9 * zoom;
  const placement = getSittingPlacement({
    x: WIDTH / 2 + wobble(0.5) * 0.3,
    ground,
    size: 12 * zoom,
    yaw: 0,
    head: getRotation(toRadians(8), 0, toRadians(-6 * Math.sin(beat * Math.PI))),
    tail: toRadians(30 * Math.sin(beat * TAU)),
    squash: Math.min(0.32, squash),
  });
  const headTop = getCatPoint(placement, [0, EAR_TIP[1] - 0.1, EAR_TIP[2]], "head")[1];
  drawSceneCats(image, [[placement, black]], count >= 4 ? "happy" : "open", heart);
  for (let index = 0; index < count; index++) {
    const isFalling = index === count - 1 && landing < 0.3 && beat < CRATE_COUNT;
    const drop = isFalling ? 1 - easings.easeInQuad(landing / 0.3) : 0;
    const bottom = headTop + 1 - index * CRATE_HEIGHT * zoom - drop * 70;
    drawCrate(image, WIDTH / 2 + wobble(index + 1), bottom, zoom);
  }
}

function drawShrug(image: RgbaImage, { beat, kick, tabby }: SceneInput): void {
  const tilt = getSwap(beat);
  const placement = getSittingPlacement({
    x: 24,
    ground: 59,
    size: 13,
    yaw: 0.25,
    head: getRotation(toRadians(-4), toRadians(10 * tilt), toRadians(22 * tilt)),
    tail: toRadians(35 * Math.sin(beat * Math.PI)),
  });
  drawSceneCats(image, [[placement, tabby]], "open", WHITE);
  const font = fonts["spleen-16x32"];
  const bounce = 7 * kick;
  const [x, y] = [43, 3 - bounce];
  for (const [dx, dy] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-1, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
  ] as const) {
    drawText(image, font, "?", x + dx, y + dy, INK);
  }
  drawText(image, font, "?", x, y, mix([255, 220, 40], WHITE, 0.4 * kick));
}

function drawBridgeDeck(image: RgbaImage): void {
  const wood: Color = [150, 92, 40];
  const dark: Color = [90, 52, 22];
  for (let x = 4; x <= 60; x += 0.5) {
    const y = getDeckY(x);
    fillRect(image, x, y, x + 0.5, y + 3, wood);
    fillRect(image, x, y + 3, x + 0.5, y + 4, dark);
  }
  for (let x = 6; x <= 58; x += 6.5) {
    const y = getDeckY(x);
    fillRect(image, x, y - 6, x + 1, y, dark);
  }
  for (let x = 6; x <= 59; x += 0.5) {
    fillRect(image, x, getDeckY(x) - 6, x + 0.5, getDeckY(x) - 5.2, wood);
  }
  for (const x of [8, 56]) {
    fillRect(image, x - 1.5, getDeckY(x) + 3, x + 1.5, 50, dark);
  }
}

function getDeckY(x: number): number {
  return 34 + ((x - 32) / 28) ** 2 * 8;
}

function drawWater(image: RgbaImage, beat: number, top: number): void {
  fillRect(image, 0, top, WIDTH, HEIGHT, [30, 90, 190]);
  for (let x = 0; x < WIDTH; x++) {
    const y = top + Math.sin(x * 0.45 + beat * TAU * 0.5) * 0.8;
    fillRect(image, x, y - 0.5, x + 1, y + 0.6, [140, 200, 255]);
  }
  for (let row = 0; row < 3; row++) {
    for (let x = 0; x < WIDTH; x += 9) {
      const shift = ((x + beat * 6 + row * 4) % 72) - 4;
      fillRect(image, shift, top + 4 + row * 3.5, shift + 3, top + 4.6 + row * 3.5, [70, 140, 230]);
    }
  }
}

function getWalkPose(phase: number, amount: number): CatPose {
  const swing = toRadians(35 * Math.sin(phase * TAU) * amount);
  return {
    frontLeftLeg: getRotation(swing, 0, 0),
    backRightLeg: getRotation(swing, 0, 0),
    frontRightLeg: getRotation(-swing, 0, 0),
    backLeftLeg: getRotation(-swing, 0, 0),
    tail: getRotation(toRadians(20 + 20 * Math.sin(phase * TAU)), 0, 0),
  };
}

function drawBridge(image: RgbaImage, { beat, black }: SceneInput): void {
  const waterTop = 50;
  const size = 7;
  const trip = 1.6;
  const splash = 2.75;
  drawBridgeDeck(image);
  const raster = createRaster();
  if (beat < splash) {
    const walk = Math.min(beat, trip);
    const x = 14 + walk * 11;
    const fall = clamp((beat - trip) / (splash - trip));
    const fallX = x + fall * 8;
    const fallY =
      getDeckY(x) -
      size * 1.05 +
      (waterTop + 2 - getDeckY(x)) * easings.easeInQuad(fall) -
      8 * Math.sin(fall * Math.PI) * (1 - fall);
    const roll = -fall * TAU * 1.25;
    drawCat(
      raster,
      {
        x: fallX,
        y: fallY,
        size,
        rotate: compose(getRotation(0, 0, roll), getRotation(VIEW_PITCH, toRadians(80), 0)),
        pose:
          fall > 0
            ? {
                frontLeftLeg: getRotation(toRadians(-70), 0, toRadians(-30)),
                frontRightLeg: getRotation(toRadians(-70), 0, toRadians(30)),
                backLeftLeg: getRotation(toRadians(60), 0, toRadians(-30)),
                backRightLeg: getRotation(toRadians(60), 0, toRadians(30)),
                head: getRotation(toRadians(-20), 0, 0),
                tail: getRotation(toRadians(-30), 0, 0),
              }
            : getWalkPose(walk * 2, 1),
      },
      black.coat,
    );
    compositeRaster(raster, image);
    drawWater(image, beat, waterTop);
    return;
  }
  const after = beat - splash;
  const rise = easings.easeOutCubic(clamp((after - 0.35) / 0.4));
  const placement = getSittingPlacement({
    x: 40,
    ground: waterTop + 13 - rise * 6,
    size: 8,
    yaw: -0.2,
    head: getRotation(toRadians(-5), 0, toRadians(15 * Math.sin(after * TAU))),
  });
  if (rise > 0) {
    drawSceneCats(image, [[placement, black]], "open", WHITE);
  }
  drawWater(image, beat, waterTop);
  for (let ring = 0; ring < 2; ring++) {
    const grow = clamp(after * 1.2 - ring * 0.3);
    if (grow > 0) {
      const radius = 4 + grow * 14;
      for (let angle = 0; angle < TAU; angle += 0.12) {
        const px = 40 + Math.cos(angle) * radius;
        const py = waterTop + 1.5 + Math.sin(angle) * radius * 0.2;
        fillRect(image, px, py, px + 1, py + 0.6, [200, 235, 255], 1 - grow);
      }
    }
  }
  const random = createRandom(hashSeed(0x5b1a, 3));
  for (let drop = 0; drop < 18; drop++) {
    const angle = getRandomBetween(random, -2.5, -0.65);
    const speed = getRandomBetween(random, 18, 34);
    const t = after * 1.6;
    const px = 40 + Math.cos(angle) * speed * t;
    const py = waterTop - Math.sin(-angle) * speed * t + 30 * t * t;
    if (t < 1 && py < waterTop + 1) {
      fillCircle(image, px, py, 1.3 - 0.6 * t, [220, 240, 255]);
    }
  }
}

function drawFlag(image: RgbaImage, { beat, kick, tabby, heart }: SceneInput): void {
  const wave = Math.sin(beat * Math.PI);
  const placement = getSittingPlacement({
    x: 22,
    ground: 58 + 0.8 * kick,
    size: 13,
    yaw: 0.2,
    head: getRotation(toRadians(-6), toRadians(-8), toRadians(-12 * wave)),
    tail: toRadians(30 * wave),
  });
  const joint: CatJoint = "frontRightLeg";
  placement.pose = {
    ...placement.pose,
    [joint]: getJointAim(placement.rotate, [0.8, 0.6 + 0.3 * wave, 0.3]),
  };
  drawSceneCats(image, [[placement, tabby]], "happy", heart, 1);
  const [pawX, pawY] = getCatPoint(placement, PAW_TIP, joint);
  const tilt = 0.2 + 0.2 * wave;
  const top: [number, number] = [pawX + Math.sin(tilt) * 22, pawY - Math.cos(tilt) * 22];
  const bottom: [number, number] = [pawX - Math.sin(tilt) * 4, pawY + Math.cos(tilt) * 4];
  for (let column = 0; column < 15; column++) {
    const t = column / 14;
    const flutter = Math.sin(column * 0.6 - beat * TAU) * 1.4 * t;
    const px = top[0] + 1 + column;
    const py = top[1] + 1 + flutter + column * 0.15;
    fillRect(image, px, py, px + 1, py + 9, mix(WHITE, [200, 200, 210], (column % 3) / 4));
  }
  drawLine(image, bottom, top, 1.4, [120, 80, 40]);
  fillCircle(image, top[0], top[1], 1.2, [230, 200, 80]);
}

function drawCancelScene(
  image: RgbaImage,
  { since }: SceneInput,
  draw: (shake: number, dead: boolean) => void,
): void {
  const shake = getCancelShake(since);
  draw(shake, since >= 0.25);
  fadeImage(image, 0.55 * easings.easeOutCubic(clamp((since - 0.15) / 0.3)));
  drawCancel(image, WIDTH / 2, HEIGHT / 2, 27, since);
}

function drawPlanet(image: RgbaImage, input: SceneInput): void {
  drawCancelScene(image, input, (shake, dead) => {
    const radius = 19 * (1 + 0.04 * input.kick);
    drawEarth(image, WIDTH / 2 + shake, HEIGHT / 2, radius, input.beat * 0.5, dead ? 0.6 : 0);
    drawEarthFace(image, WIDTH / 2 + shake, HEIGHT / 2, radius, dead, input.beat);
  });
}

function drawHouse(image: RgbaImage, input: SceneInput): void {
  drawCancelScene(image, input, (shake) => {
    drawWhiteHouse(image, WIDTH / 2 + shake, 51, 0.05 * input.kick, input.beat);
  });
}

function drawAnimals(image: RgbaImage, input: SceneInput): void {
  const kinds: [CritterKind, number][] = [
    ["pig", 0],
    ["duck", 20],
    ["bunny", 39],
  ];
  drawCancelScene(image, input, (shake) => {
    for (const [kind, offset] of kinds) {
      const x = 8 + offset + input.beat * 3.5;
      drawCritter(image, kind, x + shake, 48, input.beat * 2 + offset * 0.03, 1.35);
    }
  });
}

function drawAliens(image: RgbaImage, input: SceneInput): void {
  drawCancelScene(image, input, (shake, dead) => {
    const bob = Math.sin(input.beat * Math.PI) * 2;
    drawUfo(image, WIDTH / 2 + shake, 30 + bob, input.beat, dead ? 0 : 0.6 + 0.4 * input.kick);
  });
}

function drawMoon(image: RgbaImage, beat: number): void {
  drawStars(image, beat, 1, 0.7);
  fillCircle(image, WIDTH / 2, MOON_Y, MOON_RADIUS, MOON);
  for (const [x, y, radius] of [
    [12, 58, 3],
    [44, 56, 2.2],
    [55, 61, 2.6],
    [26, 62, 1.6],
  ] as const) {
    fillEllipse(image, x, y, radius, radius * 0.45, scale(MOON, 0.7));
  }
}

function getMoonGround(x: number): number {
  return MOON_Y - Math.sqrt(MOON_RADIUS ** 2 - (x - WIDTH / 2) ** 2) + 1.5;
}

function drawAlone(image: RgbaImage, { beat, tabby }: SceneInput): void {
  drawMoon(image, beat);
  const look = Math.sin((beat / 4) * TAU);
  const placement = getSittingPlacement({
    x: WIDTH / 2,
    ground: getMoonGround(WIDTH / 2),
    size: 10,
    yaw: 0,
    head: getRotation(toRadians(-12), toRadians(50 * look), toRadians(-8 * look)),
    tail: toRadians(20 * Math.sin(beat * Math.PI * 0.5)),
  });
  drawSceneCats(image, [[placement, tabby]], "open", WHITE);
}

function drawTogether(image: RgbaImage, { beat, kick, tabby, black, heart }: SceneInput): void {
  drawMoon(image, beat);
  const appear = 0.6;
  const pop = clamp((beat - appear) / 0.35);
  const slide = easings.easeInOutCubic(clamp(beat / appear));
  const turn = easings.easeInOutCubic(clamp((beat - 1.6) / 0.5));
  const tabbyX = WIDTH / 2 - 11 * slide;
  const blackX = WIDTH / 2 + 12;
  const cats: [CatPlacement, typeof tabby][] = [
    [
      getSittingPlacement({
        x: tabbyX,
        ground: getMoonGround(tabbyX),
        size: 10,
        yaw: toRadians(15 * turn),
        head: getRotation(toRadians(-10), toRadians(18 * turn), toRadians(10 * turn)),
        tail: toRadians(20 * Math.sin(beat * Math.PI)),
      }),
      tabby,
    ],
  ];
  if (pop > 0) {
    cats.push([
      getSittingPlacement({
        x: blackX,
        ground: getMoonGround(blackX) - 6 * (1 - easings.easeOutCubic(pop)),
        size: 10 * getOvershoot(pop),
        yaw: -toRadians(15 * turn),
        head: getRotation(toRadians(-10), -toRadians(18 * turn), -toRadians(10 * turn)),
        tail: toRadians(-20 * Math.sin(beat * Math.PI)),
      }),
      black,
    ]);
  }
  drawSceneCats(image, cats, beat > 2.4 ? "happy" : "open", heart);
  const burst = beat - appear;
  if (burst > 0 && burst < 0.8) {
    for (let index = 0; index < 8; index++) {
      const angle = (index / 8) * TAU;
      const distance = 6 + burst * 18;
      fillCircle(
        image,
        blackX + Math.cos(angle) * distance,
        getMoonGround(blackX) - 10 + Math.sin(angle) * distance,
        1,
        [255, 240, 160],
        1 - burst / 0.8,
      );
    }
  }
  const heartPop = clamp((beat - 2.4) / 0.4);
  if (heartPop > 0) {
    drawHeart(image, {
      x: WIDTH / 2 + 0.5,
      y: 24 - 2 * kick,
      size: 11 * getOvershoot(heartPop) * (1 + 0.12 * kick),
      color: mix(heart, WHITE, 0.15),
      outline: mix(heart, WHITE, 0.6),
    });
  }
}

function drawOkay(image: RgbaImage, { beat, kick, tabby, black, heart }: SceneInput): void {
  drawMoon(image, beat);
  drawSparkles(image, beat, [mix(heart, WHITE, 0.4)], 0.8, { bottom: 40 });
  const sway = Math.sin(beat * Math.PI);
  const cats = [
    [WIDTH / 2 - 11, 1, tabby],
    [WIDTH / 2 + 12, -1, black],
  ] as const;
  drawSceneCats(
    image,
    cats.map(([x, side, cat]) => [
      getSittingPlacement({
        x: x + sway * 1.5,
        ground: getMoonGround(x) + 0.8 * kick,
        size: 10,
        yaw: side * toRadians(15),
        head: getRotation(toRadians(-14 + 8 * kick), side * toRadians(15), toRadians(-20 * sway)),
        tail: toRadians(side * 30 * sway),
      }),
      cat,
    ]),
    "happy",
    heart,
  );
  drawFloatingHearts(image, beat, [WIDTH / 2, 40], [heart, mix(heart, WHITE, 0.5)], 6, {
    rise: 30,
    sizes: [4, 7],
  });
}

const sceneDrawings: Record<VocalScene, (image: RgbaImage, input: SceneInput) => void> = {
  patience: drawPatience,
  stack: drawStack,
  shrug: drawShrug,
  bridge: drawBridge,
  flag: drawFlag,
  planet: drawPlanet,
  house: drawHouse,
  animals: drawAnimals,
  aliens: drawAliens,
  alone: drawAlone,
  together: drawTogether,
  okay: drawOkay,
};

export const vocalScene = defineEffect({
  id: "vocal-scene",
  name: "Vocal scene",
  kind: "pixel",
  params: z.object({
    ...furParams,
    scene: z.enum(vocalScenes).default("planet"),
    cancelAt: z.number().min(0).max(16).default(2),
    heartColor: colorSchema.default("#ff2a6d"),
  }),
  render(image, { params, beat }) {
    const [tabbyCoat, blackCoat] = getCoats(params);
    fillRgbaImage(image, BLACK);
    sceneDrawings[params.scene](image, {
      beat,
      kick: getBeatKick(beat, 1).kick,
      since: beat - params.cancelAt,
      heart: parseColor(params.heartColor),
      tabby: { coat: tabbyCoat, eyeColor: parseColor(params.tabbyEyeColor) },
      black: { coat: blackCoat, eyeColor: parseColor(params.eyeColor) },
    });
  },
});
