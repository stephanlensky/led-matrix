import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { HEIGHT, WIDTH } from "../frame.ts";
import { easings } from "../keyframes.ts";
import { type Rotation, type Vector, createRaster, getRotation, resolveRaster } from "../mesh.ts";
import { TAU, toRadians } from "./cat-duo.ts";
import { VIEW_PITCH, getCycle } from "./cat-dance.ts";
import { type SkeletonPose, drawSkeleton } from "./skeleton-model.ts";

export const skeletonMoves = ["jig", "rattle", "charleston", "toss"] as const;

export const skeletonSyncs = ["together", "alternate", "wave"] as const;

type SkeletonMove = (typeof skeletonMoves)[number];

type SkeletonSync = (typeof skeletonSyncs)[number];

type DancerFrame = {
  x: number;
  y: number;
  size: number;
  rotate: Rotation;
  pose: SkeletonPose;
  jaw: number;
  glow: number;
};

type Dancer = { x: number; y: number; phase: number; side: number; index: number };

const SKULL_CENTER: Vector = [0, 0.45, 0];

function getRoll(angle: number): Rotation {
  return getRotation(0, 0, angle);
}

function getDegrees(pitch: number, yaw: number, roll: number): Rotation {
  return getRotation(toRadians(pitch), toRadians(yaw), toRadians(roll));
}

function getOffset(rotation: Rotation, [offsetX, offsetY, offsetZ]: Vector): Rotation {
  return (vector) => {
    const [x, y, depth] = rotation(vector);
    return [x + offsetX, y + offsetY, depth + offsetZ];
  };
}

function getRotationAround(rotation: Rotation, [centerX, centerY, centerZ]: Vector): Rotation {
  return ([x, y, depth]) => {
    const [rotatedX, rotatedY, rotatedZ] = rotation([x - centerX, y - centerY, depth - centerZ]);
    return [rotatedX + centerX, rotatedY + centerY, rotatedZ + centerZ];
  };
}

function getPulse(phase: number): number {
  return (1 - getCycle(phase)) ** 3;
}

function getJig(beat: number, dancer: Dancer, size: number): DancerFrame {
  const phase = beat + dancer.phase;
  const step = Math.sin(phase * Math.PI);
  const left = Math.max(0, step);
  const right = Math.max(0, -step);
  const bob = Math.abs(Math.cos(phase * Math.PI));
  const flail = Math.sin(phase * TAU * 2);
  return {
    x: dancer.x + step * 2,
    y: dancer.y + 2 - bob * 1.5,
    size,
    rotate: getRotation(VIEW_PITCH, dancer.side * 0.2, toRadians(-5 * step)),
    pose: {
      torso: getRoll(toRadians(6 * step)),
      head: getDegrees(-8 * bob, 0, -16 * step),
      leftArm: getDegrees(-15, 0, -(75 + 25 * flail)),
      leftForearm: getDegrees(-20, 0, -(70 + 40 * flail)),
      rightArm: getDegrees(-15, 0, 75 - 25 * flail),
      rightForearm: getDegrees(-20, 0, 70 - 40 * flail),
      leftLeg: getDegrees(-30 * left, 0, -(28 + 40 * left)),
      leftShin: getDegrees(15, 0, 50 + 30 * left),
      rightLeg: getDegrees(-30 * right, 0, 28 + 40 * right),
      rightShin: getDegrees(15, 0, -(50 + 30 * right)),
    },
    jaw: 0.6 * getPulse(phase * 2),
    glow: 0.3 + 0.7 * getPulse(phase),
  };
}

function getRattle(beat: number, dancer: Dancer, size: number): DancerFrame {
  const phase = beat + dancer.phase;
  const isBigBurst = getCycle(phase / 4) >= 0.75;
  const burst = getPulse(phase) * (isBigBurst ? 1 : 0.4);
  const spread = burst * 0.3;
  const shake = (seed: number) => Math.sin(phase * TAU * 6 + seed * 2.1 + dancer.index);
  const tremble = 4 + 10 * burst;
  return {
    x: dancer.x + shake(0) * 0.6,
    y: dancer.y + 2 - shake(1) * 0.4,
    size,
    rotate: getRotation(VIEW_PITCH, dancer.side * 0.25, toRadians(shake(2) * tremble * 0.3)),
    pose: {
      torso: getOffset(getRoll(toRadians(shake(3) * tremble * 0.5)), [0, spread * 0.4, 0]),
      head: getOffset(getDegrees(-15 * burst, 0, shake(4) * tremble * 1.5), [0, spread * 0.6, 0]),
      leftArm: getOffset(getDegrees(-20, 0, -(35 + 60 * burst + shake(5) * tremble)), [
        -spread,
        spread * 0.3,
        0,
      ]),
      leftForearm: getOffset(getDegrees(-30, 0, 30 + shake(6) * tremble * 2), [
        -spread * 0.5,
        0,
        0,
      ]),
      rightArm: getOffset(getDegrees(-20, 0, 35 + 60 * burst + shake(7) * tremble), [
        spread,
        spread * 0.3,
        0,
      ]),
      rightForearm: getOffset(getDegrees(-30, 0, -30 + shake(8) * tremble * 2), [
        spread * 0.5,
        0,
        0,
      ]),
      leftLeg: getOffset(getRoll(toRadians(-10 + shake(9) * tremble * 0.6)), [
        -spread * 0.5,
        -spread * 0.3,
        0,
      ]),
      leftShin: getOffset(getRoll(toRadians(shake(10) * tremble * 0.6)), [0, -spread * 0.4, 0]),
      rightLeg: getOffset(getRoll(toRadians(10 + shake(11) * tremble * 0.6)), [
        spread * 0.5,
        -spread * 0.3,
        0,
      ]),
      rightShin: getOffset(getRoll(toRadians(shake(12) * tremble * 0.6)), [0, -spread * 0.4, 0]),
    },
    jaw: 0.5 + 0.5 * shake(13),
    glow: 0.3 + 0.7 * burst,
  };
}

function getCharleston(beat: number, dancer: Dancer, size: number): DancerFrame {
  const phase = beat + dancer.phase;
  const swing = Math.sin((phase / 2) * TAU);
  const front = Math.max(0, swing);
  const back = Math.max(0, -swing);
  const swivel = Math.sin(phase * TAU);
  const bob = Math.abs(Math.cos(phase * Math.PI));
  const jazz = 15 * Math.sin(phase * TAU * 2);
  return {
    x: dancer.x + swivel * 0.8,
    y: dancer.y + 1 - bob,
    size,
    rotate: getRotation(VIEW_PITCH, dancer.side * 0.2 + 0.35 * swing, 0),
    pose: {
      pelvis: getDegrees(0, -15 * swivel, 0),
      torso: getDegrees(-10 * front + 8 * back, 15 * swivel, 0),
      head: getDegrees(0, -10 * swivel, 10 * swing),
      leftArm: getDegrees(70 * front - 60 * back, 0, -(20 + 20 * back)),
      leftForearm: getDegrees(-50 - 30 * back, 0, jazz),
      rightArm: getDegrees(-60 * front + 70 * back, 0, 20 + 20 * front),
      rightForearm: getDegrees(-50 - 30 * front, 0, jazz),
      leftLeg: getDegrees(-75 * front + 10 * back, 20 * swivel, -6 + 10 * swivel),
      leftShin: getDegrees(15 * (1 - front), 0, -8 * swivel),
      rightLeg: getDegrees(-10 * front + 40 * back, 20 * swivel, 6 + 10 * swivel),
      rightShin: getDegrees(15 + 70 * back, 0, -8 * swivel),
    },
    jaw: 0.4 * getPulse(phase),
    glow: 0.3 + 0.7 * getPulse(phase),
  };
}

function getToss(beat: number, dancer: Dancer, size: number): DancerFrame {
  const phase = beat + dancer.phase;
  const isToss = getCycle(phase / 4) >= 0.75;
  const cycle = getCycle(phase);
  const flight = isToss ? 4 * cycle * (1 - cycle) : 0;
  const spin = isToss ? easings.easeInOutCubic(cycle) * 360 : 0;
  const nod = Math.sin(phase * TAU);
  const shimmy = Math.sin(phase * Math.PI) * (1 - flight);
  const crouch = isToss ? Math.sin(cycle * Math.PI) ** 0.5 : 0;
  const head = getDegrees(-spin, 0, 15 * nod * (1 - flight));
  return {
    x: dancer.x + shimmy,
    y: dancer.y + 1 - Math.abs(nod) * 0.8 * (1 - crouch) + size * 0.24 * crouch,
    size,
    rotate: getRotation(VIEW_PITCH, dancer.side * 0.25, 0),
    pose: {
      torso: getDegrees(-10 * crouch, 0, -8 * shimmy),
      head: getOffset(getRotationAround(head, SKULL_CENTER), [0, flight * 0.35, 0]),
      leftArm: getDegrees(-20 * flight, 0, -(25 + 20 * shimmy + 130 * flight)),
      leftForearm: getDegrees(-40 + 40 * flight, 0, 20 * (1 - flight)),
      rightArm: getDegrees(-20 * flight, 0, 25 - 20 * shimmy + 130 * flight),
      rightForearm: getDegrees(-40 + 40 * flight, 0, -20 * (1 - flight)),
      leftLeg: getDegrees(-45 * crouch, 0, -10 + 6 * shimmy - 10 * crouch),
      leftShin: getDegrees(90 * crouch + 10 * Math.max(0, -shimmy), 0, 0),
      rightLeg: getDegrees(-45 * crouch, 0, 10 + 6 * shimmy + 10 * crouch),
      rightShin: getDegrees(90 * crouch + 10 * Math.max(0, shimmy), 0, 0),
    },
    jaw: isToss ? flight : 0.4 * getPulse(phase),
    glow: isToss ? 1 : 0.3 + 0.7 * getPulse(phase),
  };
}

const moveFrames: Record<
  SkeletonMove,
  (beat: number, dancer: Dancer, size: number) => DancerFrame
> = {
  jig: getJig,
  rattle: getRattle,
  charleston: getCharleston,
  toss: getToss,
};

function getSyncPhase(sync: SkeletonSync, index: number, count: number): number {
  if (sync === "alternate") {
    return index % 2 === 0 ? 0 : 1;
  }
  if (sync === "wave") {
    return -index / count;
  }
  return 0;
}

export const skeletonDance = defineEffect({
  id: "skeleton-dance",
  name: "Skeleton dance",
  kind: "pixel",
  params: z.object({
    move: z.enum(skeletonMoves).default("jig"),
    sync: z.enum(skeletonSyncs).default("together"),
    count: z.number().int().min(1).max(5).default(1),
    size: z.number().min(4).max(24).default(20),
    spacing: z.number().min(0).max(40).default(21),
    boneColor: colorSchema.default("#f0e8d0"),
    eyeColor: colorSchema.default("#40ff60"),
  }),
  render(image, { params, beat }) {
    const colors = { bone: parseColor(params.boneColor), eye: parseColor(params.eyeColor) };
    const raster = createRaster();
    for (let index = 0; index < params.count; index++) {
      const offset = index - (params.count - 1) / 2;
      const dancer: Dancer = {
        x: WIDTH / 2 + offset * params.spacing,
        y: HEIGHT / 2,
        phase: getSyncPhase(params.sync, index, params.count),
        side: offset === 0 ? 0.6 : -Math.sign(offset),
        index,
      };
      drawSkeleton(raster, moveFrames[params.move](beat, dancer, params.size), colors);
    }
    resolveRaster(raster, image);
  },
});
