import { z } from "zod";
import { defineEffect } from "../effect.ts";
import { HEIGHT, WIDTH } from "../frame.ts";
import { easings } from "../keyframes.ts";
import { type Rotation, createRaster, getRotation, resolveRaster } from "../mesh.ts";
import { TAU, toRadians } from "./cat-duo.ts";
import { VIEW_PITCH, getCycle, getHeadbangAngle } from "./cat-dance.ts";
import { type HunterPose, drawHunter, hunterIds } from "./hunter-model.ts";

export const hunterMoves = ["headbang", "sway", "jump", "pump", "twist", "point"] as const;

export const hunterSyncs = ["together", "alternate", "wave"] as const;

export type HunterMove = (typeof hunterMoves)[number];

type HunterSync = (typeof hunterSyncs)[number];

export type DancerFrame = {
  x: number;
  y: number;
  size: number;
  rotate: Rotation;
  pose: HunterPose;
};

export type Dancer = { x: number; phase: number; side: number };

export const BASE_Y = HEIGHT / 2 + 3;

function getPitch(angle: number): Rotation {
  return getRotation(angle, 0, 0);
}

function getRoll(angle: number): Rotation {
  return getRotation(0, 0, angle);
}

function getArmRaise(side: number, degrees: number, forward = 0): Rotation {
  return getRotation(toRadians(-forward), 0, toRadians(side * degrees));
}

function getHeadbang(beat: number, dancer: Dancer, size: number): DancerFrame {
  const phase = getCycle(beat + dancer.phase);
  const bang = getHeadbangAngle(phase);
  const trail = getHeadbangAngle(getCycle(phase - 0.15));
  const isBigBang = getCycle(beat / 8) >= 0.75;
  const amount = isBigBang ? 1.3 : 0.9;
  const fist = isBigBang ? 160 + 15 * bang : 25;
  return {
    x: dancer.x,
    y: BASE_Y + bang,
    size,
    rotate: getRotation(VIEW_PITCH, dancer.side * 0.3, 0),
    pose: {
      torso: getPitch(toRadians(5 + 20 * amount * bang)),
      head: getPitch(toRadians(-20 + 50 * amount * bang)),
      hair: getRotation(toRadians(-40 * trail + 15), 0, toRadians(15 * Math.sin(beat * Math.PI))),
      leftArm: getArmRaise(-1, fist, 15 * bang),
      rightArm: getArmRaise(1, 145 + 20 * bang),
      leftLeg: getRoll(toRadians(-10)),
      rightLeg: getRoll(toRadians(10)),
    },
  };
}

function getSway(beat: number, dancer: Dancer, size: number): DancerFrame {
  const swing = Math.sin(((beat + dancer.phase) / 2) * TAU);
  const trail = Math.sin(((beat + dancer.phase) / 2 - 0.1) * TAU);
  const dip = Math.abs(Math.cos(((beat + dancer.phase) / 2) * TAU));
  return {
    x: dancer.x + swing * 2,
    y: BASE_Y + (1 - dip),
    size,
    rotate: getRotation(VIEW_PITCH, dancer.side * 0.3, toRadians(6 * swing)),
    pose: {
      torso: getRoll(toRadians(-10 * swing)),
      head: getRoll(toRadians(14 * swing)),
      hair: getRoll(toRadians(-30 * trail)),
      leftArm: getArmRaise(-1, 20 - 12 * swing, 20 * swing),
      rightArm: getArmRaise(1, 20 + 12 * swing, -20 * swing),
      leftLeg: getRoll(toRadians(-8 + 6 * swing)),
      rightLeg: getRoll(toRadians(8 + 6 * swing)),
    },
  };
}

function getJump(beat: number, dancer: Dancer, size: number): DancerFrame {
  const phase = getCycle(beat + dancer.phase);
  const height = 4 * phase * (1 - phase);
  const squash = phase < 0.12 ? 1 - phase / 0.12 : phase > 0.9 ? (phase - 0.9) / 0.1 : 0;
  const spin = Math.floor(beat + dancer.phase) % 4 === 3 ? easings.easeInOutCubic(phase) * TAU : 0;
  const reach = 30 + 140 * height;
  return {
    x: dancer.x,
    y: BASE_Y - height * 8 + squash * 1.5,
    size: size * (1 - squash * 0.06),
    rotate: getRotation(VIEW_PITCH, dancer.side * 0.3 + spin, 0),
    pose: {
      torso: getPitch(toRadians(15 * squash)),
      head: getPitch(toRadians(-10 * height + 15 * squash)),
      hair: getPitch(toRadians(50 * height - 15 * squash)),
      leftArm: getArmRaise(-1, reach),
      rightArm: getArmRaise(1, reach),
      leftLeg: getRotation(toRadians(25 * height), 0, toRadians(-20 * height)),
      rightLeg: getRotation(toRadians(-35 * height), 0, toRadians(20 * height)),
    },
  };
}

function getPump(beat: number, dancer: Dancer, size: number): DancerFrame {
  const phase = beat + dancer.phase;
  const pump = 0.5 + 0.5 * Math.cos(phase * TAU);
  const lean = Math.sin((phase / 2) * TAU);
  return {
    x: dancer.x + lean,
    y: BASE_Y - pump,
    size,
    rotate: getRotation(VIEW_PITCH, dancer.side * 0.25, toRadians(4 * lean)),
    pose: {
      torso: getRoll(toRadians(-6 * lean)),
      head: getRotation(toRadians(-10 + 20 * (1 - pump)), 0, toRadians(-10 * lean)),
      hair: getRotation(toRadians(-20 * pump), 0, toRadians(20 * lean)),
      leftArm: getArmRaise(-1, 115 + 55 * pump),
      rightArm: getArmRaise(1, 115 + 55 * (1 - pump)),
      leftLeg: getRoll(toRadians(-8)),
      rightLeg: getRoll(toRadians(8)),
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
    rotate: getRotation(VIEW_PITCH, toRadians(35 * twist), 0),
    pose: {
      torso: getRotation(0, toRadians(-25 * twist), 0),
      head: getRotation(0, toRadians(-20 * twist), 0),
      hair: getRotation(0, toRadians(-40 * twist), toRadians(-20 * twist)),
      leftArm: getArmRaise(-1, 55 + 15 * step, 30 * twist),
      rightArm: getArmRaise(1, 55 - 15 * step, -30 * twist),
      leftLeg: getPitch(toRadians(-25 * Math.max(0, step))),
      rightLeg: getPitch(toRadians(-25 * Math.max(0, -step))),
    },
  };
}

function getPoint(beat: number, dancer: Dancer, size: number): DancerFrame {
  const phase = beat + dancer.phase;
  const index = Math.floor(phase);
  const direction = index % 2 === 0 ? 1 : -1;
  const snap = easings.easeOutCubic(Math.min(1, getCycle(phase) / 0.25));
  const side = -direction + 2 * direction * snap;
  const right = Math.max(0, side);
  const left = Math.max(0, -side);
  return {
    x: dancer.x + side * 1.5,
    y: BASE_Y + (1 - snap) * 0.8,
    size,
    rotate: getRotation(VIEW_PITCH, dancer.side * 0.3, 0),
    pose: {
      torso: getRoll(toRadians(-8 * side)),
      head: getRoll(toRadians(-10 * side)),
      hair: getRoll(toRadians(25 * side)),
      leftArm: getArmRaise(-1, 25 + 105 * left, 30 * left),
      rightArm: getArmRaise(1, 25 + 105 * right, 30 * right),
      leftLeg: getRoll(toRadians(-5 - 25 * left)),
      rightLeg: getRoll(toRadians(5 + 25 * right)),
    },
  };
}

export const hunterMoveFrames: Record<
  HunterMove,
  (beat: number, dancer: Dancer, size: number) => DancerFrame
> = {
  headbang: getHeadbang,
  sway: getSway,
  jump: getJump,
  pump: getPump,
  twist: getTwist,
  point: getPoint,
};

const syncPhases: Record<HunterSync, readonly number[]> = {
  together: [0, 0, 0],
  alternate: [0, 0.5, 0],
  wave: [0, -1 / 3, -2 / 3],
};

export const hunterDance = defineEffect({
  id: "hunter-dance",
  name: "Hunter dance",
  kind: "pixel",
  params: z.object({
    move: z.enum(hunterMoves).default("headbang"),
    sync: z.enum(hunterSyncs).default("together"),
    size: z.number().min(4).max(20).default(14),
    spacing: z.number().min(0).max(30).default(20),
  }),
  render(image, { params, beat }) {
    const raster = createRaster();
    for (const [index, hunter] of hunterIds.entries()) {
      const side = 1 - index;
      const dancer: Dancer = {
        x: WIDTH / 2 - side * params.spacing,
        phase: syncPhases[params.sync][index] ?? 0,
        side,
      };
      drawHunter(raster, hunter, hunterMoveFrames[params.move](beat, dancer, params.size));
    }
    resolveRaster(raster, image);
  },
});
