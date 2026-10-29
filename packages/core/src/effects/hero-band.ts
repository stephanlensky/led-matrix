import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { type Color, HEIGHT, type RgbaImage, WIDTH, fillRgbaImage } from "../frame.ts";
import { easings } from "../keyframes.ts";
import { createRandom, getRandomBetween, hashSeed } from "../random.ts";
import {
  type Mesh,
  type Raster,
  type Vector,
  addBox,
  addEllipsoid,
  compositeRaster,
  createMesh,
  createRaster,
  drawMesh,
  getMatrix,
  getModelMatrix,
  getRotation,
} from "../mesh.ts";
import { TAU, clamp, toRadians } from "./cat-duo.ts";
import { VIEW_PITCH, getCycle } from "./cat-dance.ts";
import { getNormalShader, mix, scale, setScaledColor } from "./cat-model.ts";
import {
  HERO_CENTER,
  type HeroId,
  type HeroPlacement,
  type PropPart,
  SOLE_Y,
  drawHero,
  getHeroPoint,
  heroIds,
} from "./frieren-model.ts";
import { getTorsoPoint } from "./hero-desk.ts";
import { getArm } from "./hero-love.ts";
import { blendPixel } from "./heart.ts";
import { getBeatKick } from "./heart-pulse.ts";
import { type ModelPlacement, getProjector } from "./hunter-model.ts";

const WHITE: Color = [255, 255, 255];
const MOUTH_COLOR: Color = [90, 16, 28];
const MOUTH: Vector = [0, 0.84, 0.47];
const MIC_HEAD: Vector = [0, 0.86, 0.6];
const MIC_CLIP: Vector = [0, 0.6, 0.5];
const POLE_Z = 0.5;
const GRIP_HIGH: Vector = [0.07, 0.5, 0.46];
const GRIP_LOW: Vector = [-0.07, 0.4, 0.47];
const GUITAR_Z = 0.33;
const NECK_START: Vector = [0.12, 0.26, GUITAR_Z + 0.02];
const NECK_END: Vector = [0.78, 0.6, GUITAR_Z + 0.02];
const STRUM: Vector = [-0.1, 0.2, GUITAR_Z + 0.08];
const FRET: Vector = [0.5, 0.46, GUITAR_Z + 0.06];
const SOUND_HOLE: Vector = [-0.08, 0.16, GUITAR_Z + 0.06];
const HEADSTOCK: Vector = [0.84, 0.64, GUITAR_Z];
const GUITARIST_FLOOR = HEIGHT - 18;
const SINGER_FLOOR = HEIGHT - 11;
const GUITARIST_SCALE = 0.82;
const NOTE_SEED = 0xb4d;
const SPARK_SEED = 0x5a7c;
const BAR_BEATS = 4;
const POINT_BEATS = 8;
const STAGE_WALL = parseColor("#160a2a");
const STAGE_FLOOR = parseColor("#3a2414");
const PLANK = parseColor("#24160c");
const AMP = parseColor("#1c1c22");
const GRILLE = parseColor("#34343e");
const AMP_TRIM = parseColor("#c8c8d0");

const partners: Readonly<Record<HeroId, HeroId>> = { frieren: "himmel", himmel: "frieren" };

const GUITAR_COLORS: Readonly<Partial<Record<PropPart, Color>>> = {
  chest: parseColor("#d42840"),
  sheet: parseColor("#f6f2ea"),
  wood: parseColor("#d89a58"),
  darkWood: parseColor("#4a2c18"),
  metal: parseColor("#d8dce4"),
  chestTrim: parseColor("#e8c050"),
};

const NOTE_SHAPES: readonly (readonly string[])[] = [
  ["..#..", "..##.", "..#.#", "..#..", "###..", "###..", ".#..."],
  [".####", ".#..#", ".#..#", ".#..#", "##.##", "##.##"],
];

function addChain(
  mesh: Mesh<PropPart>,
  [ax, ay, az]: Vector,
  [bx, by, bz]: Vector,
  radius: Vector,
  material: PropPart,
  segments: number,
): void {
  for (let index = 0; index <= segments; index++) {
    const t = index / segments;
    addEllipsoid(
      mesh,
      [ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t],
      radius,
      material,
      4,
      6,
    );
  }
}

function createGuitarMesh(): Mesh<PropPart> {
  const mesh = createMesh<PropPart>();
  addEllipsoid(mesh, [-0.12, 0.1, GUITAR_Z], [0.3, 0.24, 0.06], "chest", 6, 14);
  addEllipsoid(mesh, [0.08, 0.26, GUITAR_Z], [0.2, 0.17, 0.06], "chest", 6, 12);
  addEllipsoid(mesh, [0, 0.08, GUITAR_Z + 0.04], [0.15, 0.1, 0.03], "sheet", 4, 10);
  addEllipsoid(mesh, SOUND_HOLE, [0.05, 0.05, 0.02], "darkWood", 4, 8);
  addBox(mesh, [-0.2, 0.08, GUITAR_Z + 0.05], [0.03, 0.06, 0.01], "chestTrim");
  addChain(mesh, NECK_START, NECK_END, [0.05, 0.05, 0.035], "wood", 9);
  addEllipsoid(mesh, [0.84, 0.64, GUITAR_Z + 0.02], [0.1, 0.07, 0.04], "darkWood", 4, 8);
  for (const side of [-1, 1]) {
    addEllipsoid(mesh, [0.84, 0.64 + side * 0.06, GUITAR_Z + 0.04], [0.02, 0.02, 0.02], "metal");
  }
  addChain(
    mesh,
    [-0.24, 0.1, GUITAR_Z + 0.06],
    [NECK_END[0], NECK_END[1], GUITAR_Z + 0.05],
    [0.008, 0.008, 0.008],
    "metal",
    24,
  );
  return mesh;
}

function createMicStandMesh(): Mesh<PropPart> {
  const mesh = createMesh<PropPart>();
  const footY = SOLE_Y + 0.02;
  for (let leg = 0; leg < 3; leg++) {
    const angle = (leg / 3) * TAU + 0.5;
    addChain(
      mesh,
      [0, footY + 0.14, POLE_Z],
      [Math.cos(angle) * 0.22, footY, POLE_Z + Math.sin(angle) * 0.22],
      [0.035, 0.035, 0.035],
      "metal",
      4,
    );
  }
  addChain(
    mesh,
    [0, footY + 0.14, POLE_Z],
    [0, MIC_CLIP[1], POLE_Z],
    [0.045, 0.045, 0.045],
    "metal",
    14,
  );
  addChain(mesh, MIC_CLIP, MIC_HEAD, [0.045, 0.045, 0.045], "darkWood", 5);
  addEllipsoid(mesh, MIC_HEAD, [0.09, 0.1, 0.09], "metal", 5, 8);
  return mesh;
}

const guitarMesh = createGuitarMesh();
const micStandMesh = createMicStandMesh();

function getGuitarColor(part: PropPart, shade: number, out: [number, number, number]) {
  return setScaledColor(out, GUITAR_COLORS[part] ?? WHITE, shade);
}

function drawStandProp(raster: Raster, placement: ModelPlacement): void {
  drawMesh(raster, micStandMesh, {
    project: getProjector(getModelMatrix(HERO_CENTER, placement.rotate), placement),
    getShade: getNormalShader(getMatrix(placement.rotate)),
    getColor: (part, _vector, shade, out) =>
      setScaledColor(out, part === "metal" ? parseColor("#c4c8d4") : parseColor("#303038"), shade),
  });
}

type Motion = { beat: number; kick: number; bar: number };

function getStrumHeight(beat: number): number {
  const phase = getCycle(beat * 2);
  const isDown = getCycle(beat) < 0.5;
  const swing = easings.easeOutCubic(clamp(phase / 0.35));
  return isDown ? 0.1 - 0.2 * swing : -0.1 + 0.2 * swing;
}

function getGuitarist(
  hero: HeroId,
  placement: ModelPlacement,
  { beat, kick, bar }: Motion,
): HeroPlacement {
  const rock = bar >= BAR_BEATS - 1 ? Math.sin((bar - (BAR_BEATS - 1)) * Math.PI) : 0;
  const strum = getStrumHeight(beat);
  return {
    ...placement,
    offset: [0, -0.04 * kick, 0],
    attachments: [{ joint: "torso", mesh: guitarMesh, getColor: getGuitarColor }],
    pose: {
      torso: getRotation(toRadians(-14 * rock), 0, toRadians(4)),
      head: getRotation(toRadians(16 * kick - 10 * rock), toRadians(-10), toRadians(-6)),
      hair: getRotation(toRadians(-12 * kick), 0, 0),
      cape: getRotation(toRadians(10 * rock - 6 * kick), 0, 0),
      skirt: getRotation(toRadians(6 * rock), 0, 0),
      ...getArm(-1, [STRUM[0], STRUM[1] + strum, STRUM[2]], [-1, -0.4, -0.6]),
      ...getArm(1, FRET, [1, -1, -0.3]),
      leftLeg: getRotation(0, 0, toRadians(-10)),
      rightLeg: getRotation(0, 0, toRadians(10)),
    },
  };
}

function getSinger(hero: HeroId, placement: ModelPlacement, { beat, kick }: Motion): HeroPlacement {
  const point = getCycle(beat / (POINT_BEATS * 2)) * POINT_BEATS * 2;
  const reach =
    point >= POINT_BEATS * 2 - 2 ? Math.sin(((point - (POINT_BEATS * 2 - 2)) / 2) * Math.PI) : 0;
  const lean = toRadians(6 + 4 * kick - 8 * reach);
  const bob = -0.05 * kick;
  const toTorso = ([x, y, depth]: Vector): Vector => getTorsoPoint(lean, [x, y - bob, depth]);
  const raised: Vector = [-0.7, 1.15, 0.3];
  const grip = toTorso(GRIP_LOW);
  const low: Vector = [
    grip[0] + (raised[0] - grip[0]) * easings.easeOutCubic(reach),
    grip[1] + (raised[1] - grip[1]) * easings.easeOutCubic(reach),
    grip[2] + (raised[2] - grip[2]) * easings.easeOutCubic(reach),
  ];
  return {
    ...placement,
    offset: [0, bob, 0],
    eyes: reach > 0.3 ? "open" : "closed",
    pose: {
      torso: getRotation(lean, 0, 0),
      head: getRotation(
        toRadians(4 + 6 * kick - 18 * reach),
        0,
        toRadians(5 * Math.sin(beat * Math.PI)),
      ),
      hair: getRotation(toRadians(-8 * kick), 0, 0),
      cape: getRotation(-lean * 0.8 + toRadians(-6 * kick), 0, 0),
      ...getArm(1, toTorso(GRIP_HIGH), [1, -0.6, -0.4]),
      ...getArm(-1, low, [-1, -0.6 + reach, -0.4]),
      leftLeg: getRotation(0, 0, toRadians(-6)),
      rightLeg: getRotation(toRadians(8 * kick), 0, toRadians(6)),
    },
  };
}

function getStandingPlacement(x: number, floor: number, size: number, yaw: number): ModelPlacement {
  return {
    x,
    y: floor - (HERO_CENTER[1] - SOLE_Y) * size,
    size,
    rotate: getRotation(VIEW_PITCH, toRadians(yaw), 0),
  };
}

function drawStage(image: RgbaImage, kick: number, floorY: number): void {
  fillRgbaImage(image, scale(STAGE_WALL, 1 + 0.6 * kick));
  for (let y = floorY; y < HEIGHT; y++) {
    const isSeam = (y - floorY) % 4 === 3;
    for (let x = 0; x < WIDTH; x++) {
      blendPixel(image, x, y, isSeam ? PLANK : STAGE_FLOOR);
    }
  }
  for (const left of [1, WIDTH - 13]) {
    for (const [top, height] of [
      [floorY - 22, 10],
      [floorY - 11, 11],
    ] as const) {
      for (let y = top; y < top + height; y++) {
        for (let x = left; x < left + 12; x++) {
          const isEdge = x === left || x === left + 11 || y === top || y === top + height - 1;
          const isGrille = !isEdge && (x + y) % 2 === 0;
          blendPixel(image, x, y, isEdge ? AMP : isGrille ? scale(GRILLE, 1 + 0.8 * kick) : AMP);
        }
      }
      blendPixel(image, left + 2, top + 1, AMP_TRIM);
      blendPixel(image, left + 3, top + 1, AMP_TRIM);
    }
  }
}

function drawNote(
  image: RgbaImage,
  shape: readonly string[],
  x: number,
  y: number,
  color: Color,
  amount: number,
): void {
  for (const [row, line] of shape.entries()) {
    for (let column = 0; column < line.length; column++) {
      if (line[column] === "#") {
        blendPixel(image, Math.round(x) + column, Math.round(y) + row, color, amount);
      }
    }
  }
}

function drawNotes(
  image: RgbaImage,
  beat: number,
  [x, y]: readonly [number, number],
  direction: number,
  colors: readonly Color[],
): void {
  const newest = Math.floor(beat);
  for (let index = newest - 2; index <= newest; index++) {
    const age = beat - index;
    if (age >= 2.5) {
      continue;
    }
    const random = createRandom(hashSeed(NOTE_SEED, index));
    const drift = getRandomBetween(random, 6, 14);
    const shape = NOTE_SHAPES[index % 2 === 0 ? 0 : 1] ?? [];
    const rise = easings.easeOutCubic(clamp(age / 2.5));
    const color = colors[((index % colors.length) + colors.length) % colors.length] ?? WHITE;
    drawNote(
      image,
      shape,
      x + direction * drift * rise + Math.sin(age * 4) * 1.5 - 2,
      y - 2 - 20 * rise,
      age < 0.15 ? mix(color, WHITE, 0.6) : color,
      clamp((2.5 - age) * 1.5) * clamp(age * 8),
    );
  }
}

function drawSoundRings(
  image: RgbaImage,
  beat: number,
  [x, y]: readonly [number, number],
  color: Color,
): void {
  const phase = getCycle(beat);
  for (const lag of [0, 0.3]) {
    const progress = phase - lag;
    if (progress < 0) {
      continue;
    }
    const radius = 5 + 8 * easings.easeOutCubic(progress);
    const amount = clamp((1 - progress) * 1.4);
    for (let step = -5; step <= 5; step++) {
      const angle = (step / 5) * 0.9;
      blendPixel(
        image,
        Math.round(x - 3 - Math.cos(angle) * radius),
        Math.round(y + Math.sin(angle) * radius),
        mix(color, WHITE, 0.3),
        amount,
      );
    }
  }
}

function drawSparks(
  image: RgbaImage,
  beat: number,
  [x, y]: readonly [number, number],
  colors: readonly Color[],
): void {
  const bar = Math.floor(beat / BAR_BEATS);
  const age = beat - bar * BAR_BEATS;
  if (age > 1) {
    return;
  }
  const random = createRandom(hashSeed(SPARK_SEED, bar));
  const spread = easings.easeOutCubic(age);
  for (let index = 0; index < 10; index++) {
    const angle = getRandomBetween(random, 0, TAU);
    const speed = getRandomBetween(random, 8, 16);
    const color = colors[index % colors.length] ?? WHITE;
    const px = x + Math.cos(angle) * speed * spread;
    const py = y + Math.sin(angle) * speed * spread + 6 * age * age;
    blendPixel(image, Math.round(px), Math.round(py), mix(color, WHITE, 1 - age), 1 - age);
  }
}

export const heroBand = defineEffect({
  id: "hero-band",
  name: "Frieren and Himmel band",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    singer: z.enum(heroIds).default("himmel"),
    background: z.boolean().default(false),
    lightColor: colorSchema.default("#ff3cb4"),
    noteColor: colorSchema.default("#3cdcff"),
    size: z.number().min(10).max(24).default(15),
  }),
  render(image, { params, beat }) {
    const { kick } = getBeatKick(beat, 1);
    const motion: Motion = { beat, kick, bar: getCycle(beat / BAR_BEATS) * BAR_BEATS };
    const light = parseColor(params.lightColor);
    const note = parseColor(params.noteColor);
    const colors = [light, note, mix(light, note, 0.5)];
    if (params.background) {
      drawStage(image, kick, GUITARIST_FLOOR - 3);
    }
    const guitaristId = partners[params.singer];
    const guitarist = getGuitarist(
      guitaristId,
      getStandingPlacement(WIDTH / 2 - 14, GUITARIST_FLOOR, params.size * GUITARIST_SCALE, 30),
      motion,
    );
    const singerPlacement = getStandingPlacement(WIDTH / 2 + 12, SINGER_FLOOR, params.size, -20);
    const singer = getSinger(params.singer, singerPlacement, motion);
    const raster = createRaster();
    drawHero(raster, guitaristId, { ...guitarist, depth: -3 });
    drawHero(raster, params.singer, singer);
    drawStandProp(raster, singerPlacement);
    compositeRaster(raster, image);
    const [mouthX, mouthY] = getHeroPoint(params.singer, singer, MOUTH, "head");
    const open = 0.4 + 0.6 * kick;
    blendPixel(image, Math.round(mouthX), Math.round(mouthY), MOUTH_COLOR, open);
    if (open > 0.7) {
      blendPixel(image, Math.round(mouthX), Math.round(mouthY) + 1, MOUTH_COLOR, open);
    }
    const [holeX, holeY] = getHeroPoint(guitaristId, guitarist, SOUND_HOLE, "torso");
    drawNotes(image, beat, [holeX - 4, holeY], -1, colors);
    const [headX, headY] = getHeroPoint(guitaristId, guitarist, HEADSTOCK, "torso");
    drawSparks(image, beat, [headX, headY], colors);
    const [micX, micY] = getProjector(
      getModelMatrix(HERO_CENTER, singerPlacement.rotate),
      singerPlacement,
    )(MIC_HEAD);
    drawSoundRings(image, beat * 2, [micX, micY], note);
  },
});
