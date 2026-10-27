import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { type Color, WIDTH } from "../frame.ts";
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
import { type Coat, drawCat, scale } from "./cat-model.ts";

const STAND = toRadians(-62);
const STAR_LIFETIME = 0.45;
const COUNTER_DEPTH = 0.3;
const CAT_DEPTH = -0.5;

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

function fillCounter(raster: Raster, top: number, color: Color): void {
  const { samples, width, height } = raster;
  const edge = Math.round(top * samples);
  for (let y = Math.max(0, edge); y < height; y++) {
    const shaded = scale(color, y < edge + samples * 2 ? 1 : 0.55);
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

export const catHype = defineEffect({
  id: "cat-hype",
  name: "Cat hype",
  kind: "pixel",
  params: z.object({
    ...coatParams,
    counterColor: colorSchema.default("#2a8c8c"),
    size: z.number().min(4).max(20).default(15),
    slamsPerBeat: z.number().int().min(1).max(4).default(2),
    counter: z.number().min(32).max(60).default(48),
  }),
  render(image, { params, beat }) {
    const [tabbyCoat, blackCoat] = getCoats(params);
    const spark = parseColor(params.sparkColor);
    const raster = createRaster();
    fillCounter(raster, params.counter, parseColor(params.counterColor));
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
