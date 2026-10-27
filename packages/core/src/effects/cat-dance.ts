import { z } from "zod";
import { defineEffect } from "../effect.ts";
import { HEIGHT, WIDTH } from "../frame.ts";
import { easings } from "../keyframes.ts";
import { type Rotation, createRaster, getRotation, resolveRaster } from "../mesh.ts";
import { TAU, coatParams, getCoats, toRadians } from "./cat-duo.ts";
import { type CatPose, drawCat } from "./cat-model.ts";

export const danceMoves = ["headbang", "sway", "hop", "paws-up", "twist", "conga"] as const;

type DanceMove = (typeof danceMoves)[number];

type DancerFrame = {
  x: number;
  y: number;
  size: number;
  rotate: Rotation;
  pose: CatPose;
};

type Dancer = { x: number; phase: number; side: number };

export const VIEW_PITCH = toRadians(12);
const BASE_Y = HEIGHT / 2 + 6;

export function getCycle(value: number): number {
  return ((value % 1) + 1) % 1;
}

export function getHeadbangAngle(phase: number): number {
  return phase < 0.55
    ? 1 - easings.easeOutQuad(phase / 0.55)
    : easings.easeInCubic((phase - 0.55) / 0.45);
}

function getPitch(angle: number): Rotation {
  return getRotation(angle, 0, 0);
}

function getHeadbang(beat: number, dancer: Dancer, size: number): DancerFrame {
  const phase = getCycle(beat + dancer.phase);
  const bang = getHeadbangAngle(phase);
  const isBigBang = getCycle(beat / 8) >= 0.75;
  const amount = isBigBang ? 1.25 : 0.9;
  return {
    x: dancer.x,
    y: BASE_Y + bang * 1.5,
    size,
    rotate: getRotation(VIEW_PITCH + bang * 0.15, dancer.side * 0.35, 0),
    pose: {
      head: getRotation(toRadians(-25 + 70 * amount * bang), 0, 0),
      tail: getRotation(toRadians(-30 * bang), 0, toRadians(25 * Math.sin(beat * Math.PI))),
      frontLeftLeg: getPitch(toRadians(-10 * bang)),
      frontRightLeg: getPitch(toRadians(-10 * bang)),
    },
  };
}

function getSway(beat: number, dancer: Dancer, size: number): DancerFrame {
  const swing = Math.sin(((beat + dancer.phase) / 2) * TAU);
  const dip = Math.abs(Math.cos(((beat + dancer.phase) / 2) * TAU));
  return {
    x: dancer.x + swing * 3,
    y: BASE_Y + (1 - dip) * 1.5,
    size,
    rotate: getRotation(VIEW_PITCH, dancer.side * 0.3, toRadians(18 * swing)),
    pose: {
      head: getRotation(0, toRadians(15 * swing), toRadians(-24 * swing)),
      tail: getRotation(0, 0, toRadians(-40 * swing)),
      frontLeftLeg: getRotation(0, 0, toRadians(-12 * swing)),
      frontRightLeg: getRotation(0, 0, toRadians(-12 * swing)),
    },
  };
}

function getHop(beat: number, dancer: Dancer, size: number): DancerFrame {
  const phase = getCycle(beat + dancer.phase);
  const height = 4 * phase * (1 - phase);
  const squash = phase < 0.12 ? 1 - phase / 0.12 : phase > 0.9 ? (phase - 0.9) / 0.1 : 0;
  const spin = Math.floor(beat + dancer.phase) % 4 === 3 ? easings.easeInOutCubic(phase) * TAU : 0;
  const tuck = toRadians(35 * height);
  return {
    x: dancer.x,
    y: BASE_Y - height * 9 + squash * 1.5,
    size: size * (1 - squash * 0.08),
    rotate: getRotation(VIEW_PITCH, dancer.side * 0.3 + spin, 0),
    pose: {
      head: getPitch(toRadians(-15 * height + 20 * squash)),
      tail: getPitch(toRadians(-40 * height)),
      frontLeftLeg: getPitch(-tuck),
      frontRightLeg: getPitch(-tuck),
      backLeftLeg: getPitch(tuck),
      backRightLeg: getPitch(tuck),
    },
  };
}

function getPawsUp(beat: number, dancer: Dancer, size: number): DancerFrame {
  const phase = beat + dancer.phase;
  const pump = 0.5 + 0.5 * Math.cos(phase * TAU);
  const lean = Math.sin((phase / 2) * TAU);
  const stand = toRadians(-62);
  const reach = getPitch(toRadians(-118));
  const leftRaise = getRotation(0, 0, toRadians(-125 - 40 * pump));
  const rightRaise = getRotation(0, 0, toRadians(125 + 40 * (1 - pump)));
  return {
    x: dancer.x + lean * 1.5,
    y: BASE_Y - 3 - pump,
    size,
    rotate: getRotation(VIEW_PITCH + stand, dancer.side * 0.25, toRadians(10 * lean)),
    pose: {
      head: getRotation(-stand + toRadians(-10 + 12 * pump), 0, toRadians(-12 * lean)),
      tail: getPitch(toRadians(60)),
      frontLeftLeg: (vector) => reach(leftRaise(vector)),
      frontRightLeg: (vector) => reach(rightRaise(vector)),
      backLeftLeg: getPitch(-stand),
      backRightLeg: getPitch(-stand),
    },
  };
}

function getTwist(beat: number, dancer: Dancer, size: number): DancerFrame {
  const phase = beat + dancer.phase;
  const twist = Math.sin(phase * Math.PI);
  const step = Math.sin(phase * TAU);
  return {
    x: dancer.x,
    y: BASE_Y + Math.abs(step) * 0.8,
    size,
    rotate: getRotation(VIEW_PITCH, toRadians(45 * twist), 0),
    pose: {
      head: getRotation(0, toRadians(-35 * twist), 0),
      tail: getRotation(0, toRadians(-50 * twist), 0),
      frontLeftLeg: getPitch(toRadians(25 * Math.max(0, step))),
      frontRightLeg: getPitch(toRadians(25 * Math.max(0, -step))),
      backLeftLeg: getPitch(toRadians(-20 * Math.max(0, -step))),
      backRightLeg: getPitch(toRadians(-20 * Math.max(0, step))),
    },
  };
}

function getConga(beat: number, dancer: Dancer, size: number, progress: number): DancerFrame {
  const lane = WIDTH + 2 * size * 2.2;
  const x = getCycle(progress + dancer.x / lane) * lane - size * 2.2;
  const phase = beat + dancer.phase;
  const kick = getCycle(phase / 4) >= 0.75 ? Math.sin(getCycle(phase) * Math.PI) : 0;
  const step = Math.sin(phase * TAU);
  return {
    x,
    y: BASE_Y + Math.abs(step) * 1.2,
    size,
    rotate: getRotation(VIEW_PITCH, Math.PI / 2 - 0.35, toRadians(6 * step)),
    pose: {
      head: getRotation(0, toRadians(-40), toRadians(10 * step)),
      tail: getRotation(0, toRadians(30 * step), 0),
      frontLeftLeg: getPitch(toRadians(30 * step)),
      frontRightLeg: getPitch(toRadians(-30 * step)),
      backLeftLeg: getPitch(toRadians(-30 * step - 70 * kick)),
      backRightLeg: getPitch(toRadians(30 * step)),
    },
  };
}

const moveFrames: Record<
  DanceMove,
  (beat: number, dancer: Dancer, size: number, progress: number) => DancerFrame
> = {
  headbang: getHeadbang,
  sway: getSway,
  hop: getHop,
  "paws-up": getPawsUp,
  twist: getTwist,
  conga: getConga,
};

export const catDance = defineEffect({
  id: "cat-dance",
  name: "Cat dance",
  kind: "pixel",
  params: z.object({
    ...coatParams,
    move: z.enum(danceMoves).default("headbang"),
    size: z.number().min(4).max(16).default(10),
    offbeat: z.boolean().default(false),
    spacing: z.number().min(0).max(40).default(28),
  }),
  render(image, { params, beat, progress }) {
    const [tabbyCoat, blackCoat] = getCoats(params);
    const offset = params.offbeat ? 0.5 : 0;
    const dancers: [Dancer, typeof tabbyCoat][] = [
      [{ x: WIDTH / 2 - params.spacing / 2, phase: offset, side: 1 }, tabbyCoat],
      [{ x: WIDTH / 2 + params.spacing / 2, phase: 0, side: -1 }, blackCoat],
    ];
    const raster = createRaster();
    for (const [dancer, coat] of dancers) {
      const frame = moveFrames[params.move](beat, dancer, params.size, progress);
      drawCat(raster, frame, coat);
    }
    resolveRaster(raster, image);
  },
});
