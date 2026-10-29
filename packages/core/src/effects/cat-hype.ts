import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { type Color, HEIGHT, WIDTH } from "../frame.ts";
import { easings } from "../keyframes.ts";
import {
  type Raster,
  type Rotation,
  createRaster,
  fillRasterCircle,
  getRotation,
  resolveRaster,
  setRasterSample,
} from "../mesh.ts";
import { TAU, coatParams, getCoats, toRadians } from "./cat-duo.ts";
import { VIEW_PITCH, getCycle } from "./cat-dance.ts";
import { type Coat, drawCat, mix, scale } from "./cat-model.ts";

const WHITE: Color = [255, 255, 255];

const STAND = toRadians(-62);
const STAR_LIFETIME = 0.45;
const COUNTER_DEPTH = 0.3;
const CAT_DEPTH = -0.5;
const OBJECT_DEPTH = 0.35;

const OBJECT_SHAPES = {
  heart: [".##.##.", "#######", "#######", ".#####.", "..###..", "...#..."],
  note: ["..#..", "..##.", "..#.#", "..#..", "###..", "###..", ".#..."],
  beamedNote: [".####", ".#..#", ".#..#", ".#..#", "##.##", "##.##"],
  star: ["...#...", "..###..", "#######", ".#####.", "..###..", ".##.##.", ".#...#."],
} satisfies Record<string, readonly string[]>;

type ObjectShape = keyof typeof OBJECT_SHAPES;

const OBJECT_SETS: Record<string, readonly ObjectShape[]> = {
  none: [],
  hearts: ["heart"],
  notes: ["note", "beamedNote"],
  stars: ["star"],
  mixed: ["heart", "note", "star", "beamedNote"],
};

function getLift(time: number): number {
  const phase = getCycle(time);
  return phase < 0.6
    ? easings.easeOutQuad(phase / 0.6)
    : 1 - easings.easeInCubic((phase - 0.6) / 0.4);
}

function getPaw(lift: number, side: number): Rotation {
  const reach = getRotation(toRadians(-5 - 125 * lift), 0, 0);
  const spread = getRotation(0, 0, toRadians(side * (15 + 20 * lift)));
  return (vector) => reach(spread(vector));
}

function getKick(beat: number): number {
  return (1 - getCycle(beat)) ** 2;
}

function fillCounter(raster: Raster, top: number, color: Color, glow: number): void {
  const { samples, width, height } = raster;
  const edge = Math.round((top - 1.5 * glow) * samples);
  const lip = mix(color, WHITE, 0.6 * glow);
  const face = scale(color, 0.55 + 0.45 * glow);
  for (let y = Math.max(0, edge); y < height; y++) {
    const shaded = y < edge + samples * 2 ? lip : face;
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      raster.depth[index] = COUNTER_DEPTH;
      setRasterSample(raster, index, shaded);
    }
  }
}

function drawStar(raster: Raster, x: number, y: number, age: number, color: Color): void {
  const life = age / STAR_LIFETIME;
  const fade = 1 - life * life;
  const radius = 1.5 + 3.5 * easings.easeOutCubic(life);
  const points = 5;
  fillRasterCircle(raster, x, y, 1.1 * fade + 0.3, scale(color, fade));
  for (let point = 0; point < points; point++) {
    const angle = (point / points) * TAU - Math.PI / 2 + life;
    for (let step = 1; step <= 3; step++) {
      const distance = (radius * step) / 3;
      fillRasterCircle(
        raster,
        x + Math.cos(angle) * distance,
        y + Math.sin(angle) * distance * 0.8,
        (0.9 - step * 0.2) * fade + 0.15,
        scale(color, fade),
      );
    }
  }
}

function fillObject(
  raster: Raster,
  shape: readonly string[],
  centerX: number,
  centerY: number,
  size: number,
  color: Color,
): void {
  const { samples, width, height } = raster;
  const columns = Math.max(...shape.map((line) => line.length));
  const halfWidth = (columns * size) / 2;
  const halfHeight = (shape.length * size) / 2;
  const minX = Math.max(0, Math.floor((centerX - halfWidth) * samples));
  const maxX = Math.min(width - 1, Math.ceil((centerX + halfWidth) * samples));
  const minY = Math.max(0, Math.floor((centerY - halfHeight) * samples));
  const maxY = Math.min(height - 1, Math.ceil((centerY + halfHeight) * samples));
  for (let y = minY; y <= maxY; y++) {
    const row = Math.floor(((y + 0.5) / samples - centerY + halfHeight) / size);
    const line = shape[row];
    if (line === undefined) {
      continue;
    }
    for (let x = minX; x <= maxX; x++) {
      const column = Math.floor(((x + 0.5) / samples - centerX + halfWidth) / size);
      const index = y * width + x;
      if (line[column] === "#" && (raster.depth[index] ?? Infinity) <= OBJECT_DEPTH) {
        raster.depth[index] = OBJECT_DEPTH;
        setRasterSample(raster, index, color);
      }
    }
  }
}

function drawObjects(
  raster: Raster,
  shapes: readonly ObjectShape[],
  beat: number,
  counter: number,
  spacing: number,
  speed: number,
  color: Color,
): void {
  if (shapes.length === 0) {
    return;
  }
  const scroll = beat * speed;
  const first = Math.floor(scroll / spacing);
  const kick = getKick(beat);
  const middle = (counter + HEIGHT) / 2 - Math.round(2 * kick);
  const size = 1 + 0.3 * kick;
  const flash = mix(color, WHITE, 0.35 * kick);
  for (let slot = first; slot * spacing - scroll < WIDTH + spacing; slot++) {
    const shape =
      OBJECT_SHAPES[shapes[((slot % shapes.length) + shapes.length) % shapes.length] ?? "heart"];
    const columns = Math.max(...shape.map((line) => line.length));
    const left = Math.round(slot * spacing - scroll + (spacing - columns) / 2);
    const top = Math.round(middle - shape.length / 2);
    fillObject(raster, shape, left + columns / 2, top + shape.length / 2, size, flash);
  }
}

export const catHype = defineEffect({
  id: "cat-hype",
  name: "Cat hype",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    ...coatParams,
    counterColor: colorSchema.default("#2a8c8c"),
    size: z.number().min(4).max(20).default(15),
    slamsPerBeat: z.number().int().min(1).max(4).default(2),
    counter: z.number().min(32).max(60).default(48),
    pulse: z.number().min(0).max(1).default(0.6),
    objects: z.enum(["none", "hearts", "notes", "stars", "mixed"]).default("none"),
    objectColor: colorSchema.default("#ff3fa4"),
    objectSpacing: z.number().min(8).max(64).default(16),
    objectSpeed: z.number().min(0).max(32).default(8),
  }),
  render(image, { params, beat }) {
    const [tabbyCoat, blackCoat] = getCoats(params);
    const spark = parseColor(params.sparkColor);
    const raster = createRaster();
    fillCounter(
      raster,
      params.counter,
      parseColor(params.counterColor),
      params.pulse * getKick(beat),
    );
    drawObjects(
      raster,
      OBJECT_SETS[params.objects] ?? [],
      beat,
      params.counter,
      params.objectSpacing,
      params.objectSpeed,
      parseColor(params.objectColor),
    );
    const time = beat * params.slamsPerBeat;
    const cats: [x: number, side: number, offset: number, coat: Coat][] = [
      [WIDTH / 2 - params.size, 1, 0.5, tabbyCoat],
      [WIDTH / 2 + params.size, -1, 0, blackCoat],
    ];
    const isBig = getCycle(beat / 4) >= 0.75;
    const stars: [x: number, y: number, age: number][] = [];
    for (const [x, side, offset, coat] of cats) {
      const slamTime = time + offset;
      const isLeft = Math.floor(slamTime) % 2 === 0;
      const lift = getLift(slamTime);
      const bob = 1 - lift;
      const lean = isLeft ? -1 : 1;
      const reach = isBig ? 1.25 : 1;
      drawCat(
        raster,
        {
          x: x + lean * 1.2 * lift,
          y: params.counter - params.size * 0.6 + bob * 1.5,
          size: params.size,
          depth: CAT_DEPTH,
          rotate: getRotation(
            VIEW_PITCH + STAND + toRadians(8 * bob),
            side * 0.18,
            toRadians(lean * 7 * lift),
          ),
          pose: {
            head: getRotation(
              -STAND + toRadians(-15 + 25 * bob),
              toRadians(side * 10),
              toRadians(-lean * 14 * lift),
            ),
            tail: getRotation(toRadians(60), 0, toRadians(40 * Math.sin(beat * Math.PI))),
            frontLeftLeg: getPaw(isLeft || isBig ? lift * reach : 0.1, -1),
            frontRightLeg: getPaw(!isLeft || isBig ? lift * reach : 0.1, 1),
            backLeftLeg: getRotation(-STAND, 0, 0),
            backRightLeg: getRotation(-STAND, 0, 0),
          },
        },
        coat,
      );
      const age = getCycle(slamTime) / params.slamsPerBeat;
      if (age < STAR_LIFETIME) {
        const pawOffset = lean * params.size * 0.45;
        stars.push([x + pawOffset, params.counter + 1, age]);
        if (isBig) {
          stars.push([x - pawOffset, params.counter + 1, age]);
        }
      }
    }
    for (const [x, y, age] of stars) {
      drawStar(raster, x, y, age, spark);
    }
    resolveRaster(raster, image);
  },
});
