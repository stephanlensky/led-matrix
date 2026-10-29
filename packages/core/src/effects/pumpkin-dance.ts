import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { HEIGHT, WIDTH } from "../frame.ts";
import { easings } from "../keyframes.ts";
import { type Rotation, createRaster, getRotation, resolveRaster } from "../mesh.ts";
import { hashSeed } from "../random.ts";
import { TAU, toRadians } from "./cat-duo.ts";
import { VIEW_PITCH, getCycle, getHeadbangAngle } from "./cat-dance.ts";
import { type PumpkinPose, drawPumpkin } from "./pumpkin-model.ts";

export const pumpkinMoves = ["kick", "spin", "jig", "headbang"] as const;

export const pumpkinSyncs = ["together", "alternate", "wave"] as const;

type PumpkinMove = (typeof pumpkinMoves)[number];

type PumpkinSync = (typeof pumpkinSyncs)[number];

type DancerFrame = {
  x: number;
  y: number;
  size: number;
  rotate: Rotation;
  pose: PumpkinPose;
};

type Dancer = { x: number; y: number; phase: number; side: number };

function getPitch(angle: number): Rotation {
  return getRotation(angle, 0, 0);
}

function getRoll(angle: number): Rotation {
  return getRotation(0, 0, angle);
}

function getArmRaise(side: number, degrees: number, forward = 0): Rotation {
  return getRotation(toRadians(-forward), 0, toRadians(side * degrees));
}

function getKick(beat: number, dancer: Dancer, size: number): DancerFrame {
  const phase = beat + dancer.phase;
  const cycle = getCycle(phase);
  const direction = Math.floor(phase) % 2 === 0 ? 1 : -1;
  const isHighKick = getCycle(phase / 4) >= 0.75;
  const kick = Math.sin(Math.min(1, cycle / 0.7) * Math.PI);
  const bounce = Math.abs(Math.sin(phase * Math.PI));
  const right = direction > 0 ? kick : 0;
  const left = direction < 0 ? kick : 0;
  const high = isHighKick ? 1 : 0;
  return {
    x: dancer.x - direction * kick,
    y: dancer.y - bounce * 1.5,
    size,
    rotate: getRotation(VIEW_PITCH, dancer.side * 0.25, toRadians(-6 * direction * kick)),
    pose: {
      torso: getRoll(toRadians(-8 * direction * kick)),
      head: getRoll(toRadians(10 * direction * kick)),
      leftArm: getArmRaise(-1, 30 + 100 * (high ? kick : right), 20 * right),
      rightArm: getArmRaise(1, 30 + 100 * (high ? kick : left), 20 * left),
      leftLeg: getRotation(toRadians(-20 * left), 0, toRadians(-(55 + 35 * high) * left)),
      rightLeg: getRotation(toRadians(-20 * right), 0, toRadians((55 + 35 * high) * right)),
    },
  };
}

function getSpin(beat: number, dancer: Dancer, size: number): DancerFrame {
  const phase = beat + dancer.phase;
  const cycle = getCycle(phase);
  const isSpin = getCycle(phase / 4) >= 0.75;
  const spin = isSpin ? easings.easeInOutCubic(cycle) * TAU : 0;
  const hop = isSpin ? Math.sin(cycle * Math.PI) : 0;
  const step = Math.sin(phase * Math.PI);
  const bounce = Math.abs(step);
  return {
    x: dancer.x + step * 2 * (1 - hop),
    y: dancer.y - bounce * 1.2 - hop * 5,
    size,
    rotate: getRotation(VIEW_PITCH, dancer.side * 0.2 + spin, toRadians(-8 * step * (1 - hop))),
    pose: {
      torso: getRoll(toRadians(6 * step)),
      head: getRoll(toRadians(-12 * step)),
      leftArm: getArmRaise(-1, 85 + 20 * step + 60 * hop),
      rightArm: getArmRaise(1, 85 - 20 * step + 60 * hop),
      leftLeg: getRoll(toRadians(-12 - 20 * Math.max(0, -step) + 20 * hop)),
      rightLeg: getRoll(toRadians(12 + 20 * Math.max(0, step) - 20 * hop)),
    },
  };
}

function getJig(beat: number, dancer: Dancer, size: number): DancerFrame {
  const phase = (beat + dancer.phase) * 2;
  const step = Math.sin(phase * Math.PI);
  const left = Math.max(0, step);
  const right = Math.max(0, -step);
  const bounce = Math.abs(step);
  return {
    x: dancer.x,
    y: dancer.y - bounce * 1.5,
    size,
    rotate: getRotation(VIEW_PITCH, dancer.side * 0.25, toRadians(4 * step)),
    pose: {
      torso: getRoll(toRadians(-5 * step)),
      head: getRotation(toRadians(-6 * bounce), 0, toRadians(14 * step)),
      leftArm: getArmRaise(-1, 40 + 110 * right),
      rightArm: getArmRaise(1, 40 + 110 * left),
      leftLeg: getRotation(toRadians(-70 * left), 0, toRadians(-6)),
      rightLeg: getRotation(toRadians(-70 * right), 0, toRadians(6)),
    },
  };
}

function getHeadbang(beat: number, dancer: Dancer, size: number): DancerFrame {
  const phase = getCycle(beat + dancer.phase);
  const bang = getHeadbangAngle(phase);
  const isBigBang = getCycle((beat + dancer.phase) / 8) >= 0.75;
  const amount = isBigBang ? 1.3 : 0.9;
  return {
    x: dancer.x,
    y: dancer.y + bang * 1.5,
    size,
    rotate: getRotation(VIEW_PITCH, dancer.side * 0.25, 0),
    pose: {
      torso: getPitch(toRadians(5 + 18 * amount * bang)),
      head: getPitch(toRadians(-15 + 25 * amount * bang)),
      leftArm: getArmRaise(-1, isBigBang ? 160 + 15 * bang : 25 + 10 * bang, 15 * bang),
      rightArm: getArmRaise(1, isBigBang ? 160 + 15 * bang : 25 + 10 * bang, 15 * bang),
      leftLeg: getRoll(toRadians(-12)),
      rightLeg: getRoll(toRadians(12)),
    },
  };
}

const moveFrames: Record<PumpkinMove, (beat: number, dancer: Dancer, size: number) => DancerFrame> =
  {
    kick: getKick,
    spin: getSpin,
    jig: getJig,
    headbang: getHeadbang,
  };

function getSyncPhase(sync: PumpkinSync, index: number, count: number): number {
  if (sync === "alternate") {
    return index % 2 === 0 ? 0 : 0.5;
  }
  if (sync === "wave") {
    return -index / count;
  }
  return 0;
}

export const pumpkinDance = defineEffect({
  id: "pumpkin-dance",
  name: "Pumpkin dance",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    move: z.enum(pumpkinMoves).default("kick"),
    speed: z.number().min(0.25).max(4).default(1),
    sync: z.enum(pumpkinSyncs).default("together"),
    count: z.number().int().min(1).max(5).default(1),
    size: z.number().min(4).max(24).default(18),
    spacing: z.number().min(0).max(40).default(21),
    color: colorSchema.default("#ff6a00"),
    bodyColor: colorSchema.default("#2c8a2a"),
    stemColor: colorSchema.default("#5a7a18"),
    glowColor: colorSchema.default("#ffe040"),
    flicker: z.number().min(0).max(1).default(0.35),
  }),
  render(image, { params, beat }) {
    const colors = {
      pumpkin: parseColor(params.color),
      body: parseColor(params.bodyColor),
      stem: parseColor(params.stemColor),
      glow: parseColor(params.glowColor),
    };
    const raster = createRaster();
    const pulse = (1 - getCycle(beat)) ** 2;
    for (let index = 0; index < params.count; index++) {
      const offset = index - (params.count - 1) / 2;
      const dancer: Dancer = {
        x: WIDTH / 2 + offset * params.spacing,
        y: HEIGHT / 2 + 4,
        phase: getSyncPhase(params.sync, index, params.count),
        side: offset === 0 ? 0.6 : -Math.sign(offset),
      };
      const candle = (hashSeed(0x9a3b, index, Math.floor(beat * 8)) % 100) / 100;
      const glow = 1 - params.flicker * (0.6 * candle + 0.4 * (1 - pulse));
      drawPumpkin(
        raster,
        { ...moveFrames[params.move](beat * params.speed, dancer, params.size), glow },
        colors,
      );
    }
    resolveRaster(raster, image);
  },
});
