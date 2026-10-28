import { z } from "zod";
import { defineEffect } from "../effect.ts";
import { HEIGHT, WIDTH } from "../frame.ts";
import { easings } from "../keyframes.ts";
import { type Vector, createRaster, getRotation, resolveRaster } from "../mesh.ts";
import { toRadians } from "./cat-duo.ts";
import { getCycle } from "./cat-dance.ts";
import { ANKLE_Y, ELBOW, HIP, KNEE, SHOULDER, drawHero, drawProp } from "./frieren-model.ts";
import { getLimbRotations } from "./frieren-pose.ts";
import { createBarbellMesh, createBenchMesh } from "./frieren-props.ts";

const HAND_Y = 0.02;

const benchMesh = createBenchMesh();
const benchBarbellMesh = createBarbellMesh([0, 0, 0], 0.95, 0.19);
const squatBarbellMesh = createBarbellMesh([0, 0.66, -0.24], 1.2);

type Rep = { depth: number; punch: number };

function getRep(beat: number, every: number): Rep {
  const phase = getCycle(beat / every);
  const since = phase * every;
  const punch = Math.exp(-since * 8);
  if (phase < 0.55) {
    return { depth: easings.easeInOutSine(phase / 0.55), punch };
  }
  if (phase < 0.68) {
    return { depth: 1, punch };
  }
  return { depth: 1 - easings.easeInOutCubic((phase - 0.68) / 0.32), punch };
}

function mirror([x, y, depth]: Vector, side: number): Vector {
  return [x * side, y, depth];
}

function getArms(target: (side: number) => Vector, pole: (side: number) => Vector) {
  const [leftArm, leftForearm] = getLimbRotations(
    mirror(SHOULDER, -1),
    mirror(ELBOW, -1),
    [-0.44, HAND_Y, 0],
    target(-1),
    pole(-1),
  );
  const [rightArm, rightForearm] = getLimbRotations(
    SHOULDER,
    ELBOW,
    [0.44, HAND_Y, 0],
    target(1),
    pole(1),
  );
  return { leftArm, leftForearm, rightArm, rightForearm };
}

function getLegs(target: (side: number) => Vector, pole: (side: number) => Vector) {
  const [leftLeg, leftShin] = getLimbRotations(
    mirror(HIP, -1),
    mirror(KNEE, -1),
    [-HIP[0], ANKLE_Y, 0],
    target(-1),
    pole(-1),
  );
  const [rightLeg, rightShin] = getLimbRotations(
    HIP,
    KNEE,
    [HIP[0], ANKLE_Y, 0],
    target(1),
    pole(1),
  );
  return { leftLeg, leftShin, rightLeg, rightShin };
}

function getLiftParams(yaw: number, pitch: number) {
  return z.object({
    every: z.number().min(0.5).max(8).default(2),
    size: z.number().min(8).max(32).default(20),
    yaw: z.number().min(-180).max(180).default(yaw),
    pitch: z.number().min(-60).max(60).default(pitch),
    punch: z.number().min(0).max(0.3).default(0.06),
  });
}

export const himmelBench = defineEffect({
  id: "himmel-bench",
  name: "Himmel bench press",
  kind: "pixel",
  params: getLiftParams(80, 25),
  render(image, { params, beat }) {
    const rep = getRep(beat, params.every);
    const raster = createRaster();
    const placement = {
      x: WIDTH / 2,
      y: HEIGHT / 2 - params.size * 0.3,
      size: params.size * (1 + params.punch * rep.punch),
      rotate: getRotation(toRadians(params.pitch), toRadians(params.yaw), 0),
    };
    const offset: Vector = [0, 0.21, 0.1];
    const height = 0.5 - 0.28 * rep.depth;
    drawProp(raster, benchMesh, placement);
    drawProp(raster, benchBarbellMesh, placement, 0, undefined, [
      0,
      offset[1] + height,
      offset[2] - 0.32,
    ]);
    const strain = rep.depth > 0.9 ? Math.sin(beat * 80) * 0.03 : 0;
    drawHero(raster, "himmel", {
      ...placement,
      orient: getRotation(toRadians(-90), 0, 0),
      offset,
      hidden: ["cape"],
      pose: {
        head: getRotation(toRadians(28), 0, strain),
        ...getArms(
          (side) => [side * 0.42, 0.32, height],
          (side) => [side, 0, -0.6],
        ),
        ...getLegs(
          (side) => [side * 0.22, -0.52, -0.2],
          (side) => [side * 0.3, 0, 1],
        ),
      },
    });
    resolveRaster(raster, image);
  },
});

export const himmelSquat = defineEffect({
  id: "himmel-squat",
  name: "Himmel squat",
  kind: "pixel",
  params: getLiftParams(30, 12),
  render(image, { params, beat }) {
    const rep = getRep(beat, params.every);
    const raster = createRaster();
    const placement = {
      x: WIDTH / 2,
      y: HEIGHT / 2 + 2,
      size: params.size * (1 + params.punch * rep.punch),
      rotate: getRotation(toRadians(params.pitch), toRadians(params.yaw), 0),
    };
    const drop = 0.3 * rep.depth;
    const back = 0.16 * rep.depth;
    const lean = toRadians(38 * rep.depth);
    drawHero(raster, "himmel", {
      ...placement,
      offset: [0, -drop, -back],
      attachments: [{ joint: "torso", mesh: squatBarbellMesh }],
      pose: {
        torso: getRotation(lean, 0, 0),
        head: getRotation(-lean * 0.8, 0, 0),
        cape: getRotation(-lean * 0.9, 0, 0),
        ...getArms(
          (side) => [side * 0.62, 0.66, -0.2],
          (side) => [side * 0.4, -1, -0.2],
        ),
        ...getLegs(
          (side) => [side * 0.18, ANKLE_Y + drop, back + 0.02],
          (side) => [side * 0.35, 0, 1],
        ),
      },
    });
    resolveRaster(raster, image);
  },
});
