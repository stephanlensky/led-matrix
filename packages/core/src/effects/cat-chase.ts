import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { type Color, HEIGHT, WIDTH } from "../frame.ts";
import { easings } from "../keyframes.ts";
import { createRaster, getRotation, resolveRaster } from "../mesh.ts";
import { TAU, furParams, getCoats, toRadians } from "./cat-duo.ts";
import { getCycle } from "./cat-dance.ts";
import { type CatPlacement, type CatPose, drawCat, mix } from "./cat-model.ts";
import { drawHeart } from "./heart.ts";

const CENTER = [WIDTH / 2, HEIGHT / 2] as const;
const WHITE: Color = [255, 255, 255];
const SEGMENT_BEATS = 8;
const GAP = TAU * 0.42;
const TURN_BEATS = 0.5;

type Runner = { angle: number; heading: number; hop: number; stride: number };

function getDirection(segment: number, isReversing: boolean): number {
  return isReversing && segment % 2 !== 0 ? -1 : 1;
}

function getAngle(beat: number, laps: number, isReversing: boolean): number {
  const perBeat = (TAU * laps) / SEGMENT_BEATS;
  if (!isReversing) {
    return perBeat * beat;
  }
  const segment = Math.floor(beat / SEGMENT_BEATS);
  return getDirection(segment, true) * perBeat * (beat - segment * SEGMENT_BEATS);
}

function getRunner(beat: number, offset: number, laps: number, isReversing: boolean): Runner {
  const segment = Math.floor(beat / SEGMENT_BEATS);
  const local = beat - segment * SEGMENT_BEATS;
  const direction = getDirection(segment, isReversing);
  const angle = getAngle(beat, laps, isReversing) - offset;
  const isTurning = isReversing && local < TURN_BEATS;
  const turn = isTurning ? easings.easeInOutCubic(local / TURN_BEATS) : 1;
  const facing = direction > 0 ? 0 : Math.PI;
  const heading = -angle + (isTurning ? facing - Math.PI * (1 - turn) : facing);
  return {
    angle,
    heading,
    hop: isTurning ? Math.sin((local / TURN_BEATS) * Math.PI) : 0,
    stride: beat * 2 + offset,
  };
}

function getLegPitch(stride: number, reach: number, tuck: number): ReturnType<typeof getRotation> {
  const stretch = Math.cos(stride * TAU);
  return getRotation(toRadians(reach * Math.max(0, stretch) + tuck * Math.max(0, -stretch)), 0, 0);
}

function getBound(stride: number): CatPose {
  const lag = 0.06;
  return {
    head: getRotation(toRadians(-12 + 10 * Math.cos(stride * TAU)), 0, 0),
    frontLeftLeg: getLegPitch(stride, -75, 35),
    frontRightLeg: getLegPitch(stride - lag, -75, 35),
    backLeftLeg: getLegPitch(stride, 70, -40),
    backRightLeg: getLegPitch(stride - lag, 70, -40),
    tail: getRotation(
      toRadians(-80 + 15 * Math.cos(stride * TAU)),
      toRadians(15 * Math.sin(stride * Math.PI)),
      0,
    ),
  };
}

function getAirborne(stride: number): number {
  return Math.max(0, Math.cos(stride * TAU));
}

function getPosition(angle: number, radius: number): [number, number] {
  return [CENTER[0] + Math.cos(angle) * radius, CENTER[1] + Math.sin(angle) * radius];
}

export const catChase = defineEffect({
  id: "cat-chase",
  name: "Cat chase",
  kind: "pixel",
  params: z.object({
    ...furParams,
    heartColor: colorSchema.default("#ff2a6d"),
    heartSize: z.number().min(6).max(28).default(17),
    laps: z.number().int().min(1).max(4).default(2),
    reverse: z.boolean().default(true),
    radius: z.number().min(10).max(28).default(21),
    size: z.number().min(4).max(14).default(8),
    tilt: z.number().min(0).max(40).default(20),
    every: z.number().min(0.25).max(4).default(1),
  }),
  render(image, { params, beat }) {
    const heart = parseColor(params.heartColor);
    const pulse = beat / params.every;
    const since = getCycle(pulse) * params.every;
    const kick = Math.exp(-since * 6);
    drawHeart(image, {
      x: CENTER[0],
      y: CENTER[1],
      size: params.heartSize * (1 + 0.22 * kick),
      color: mix(heart, WHITE, 0.15 + 0.35 * kick),
      outline: mix(heart, WHITE, 0.6),
    });
    const coats = getCoats(params);
    const offsets = [0, GAP];
    const raster = createRaster();
    for (const [index, offset] of offsets.entries()) {
      const runner = getRunner(beat, offset, params.laps, params.reverse);
      const [x, y] = getPosition(runner.angle, params.radius);
      const placement: CatPlacement = {
        x,
        y,
        size:
          params.size * (1 + 0.08 * kick + 0.08 * getAirborne(runner.stride) + 0.35 * runner.hop),
        rotate: getRotation(toRadians(90 - params.tilt), runner.heading, 0),
        pose: getBound(runner.stride),
      };
      drawCat(raster, placement, coats[index] ?? coats[0]);
    }
    resolveRaster(raster, image);
  },
});
