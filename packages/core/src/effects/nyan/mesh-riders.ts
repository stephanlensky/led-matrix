import { z } from "zod";
import { parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import { type Rotation, compositeRaster, createRaster, getRotation } from "../../mesh.ts";
import { toRadians } from "../cat-duo.ts";
import {
  type HeroId,
  type HeroPlacement,
  type HeroPose,
  drawHero,
  getHeroPoint,
} from "../frieren-model.ts";
import { type HeroRiderId, type RiderId, getTartBob, riderIds } from "./pixel-riders.ts";
import {
  drawNyan,
  drawRainbow,
  drawStars,
  fillBackground,
  getNyanFrame,
  nyanParams,
} from "./shared.ts";

export const meshPoseIds = ["sit", "cheer", "surf"] as const;

export type MeshPoseId = (typeof meshPoseIds)[number];

const SEATS: Readonly<Record<RiderId, readonly [rider: HeroRiderId, x: number][]>> = {
  frieren: [["frieren", 15]],
  himmel: [["himmel", 15]],
  both: [
    ["himmel", 20],
    ["frieren", 9],
  ],
};

function getSitPose(beat: number, kick: number): HeroPose {
  const sway = Math.sin(beat * Math.PI);
  return {
    torso: getRotation(toRadians(-6 + 6 * kick), 0, toRadians(4 * sway)),
    head: getRotation(toRadians(-4 * kick), toRadians(20), 0),
    hair: getRotation(toRadians(25 + 8 * sway), 0, 0),
    cape: getRotation(toRadians(35 + 10 * sway), 0, 0),
    skirt: getRotation(toRadians(-25), 0, 0),
    leftArm: getRotation(toRadians(-20), 0, toRadians(-35)),
    rightArm: getRotation(toRadians(-20), 0, toRadians(35)),
    leftLeg: getRotation(toRadians(-85), 0, toRadians(-6)),
    rightLeg: getRotation(toRadians(-85), 0, toRadians(6)),
    leftShin: getRotation(toRadians(80 + 15 * sway), 0, 0),
    rightShin: getRotation(toRadians(80 - 15 * sway), 0, 0),
  };
}

function getCheerPose(beat: number, kick: number): HeroPose {
  const pump = Math.abs(Math.sin(beat * Math.PI));
  return {
    ...getSitPose(beat, kick),
    torso: getRotation(toRadians(-10), 0, 0),
    head: getRotation(toRadians(-15 - 10 * pump), toRadians(15), 0),
    leftArm: getRotation(0, 0, toRadians(-175 + 20 * pump)),
    rightArm: getRotation(0, 0, toRadians(175 - 20 * pump)),
    leftForearm: getRotation(0, 0, toRadians(-15)),
    rightForearm: getRotation(0, 0, toRadians(15)),
  };
}

function getSurfPose(beat: number, kick: number): HeroPose {
  const wobble = Math.sin((beat / 2) * Math.PI * 2);
  const bend = 15 + 10 * kick;
  return {
    torso: getRotation(toRadians(-8), 0, toRadians(6 * wobble)),
    head: getRotation(toRadians(-5), toRadians(35), 0),
    hair: getRotation(toRadians(35 + 8 * wobble), 0, 0),
    cape: getRotation(toRadians(45 + 10 * wobble), 0, 0),
    skirt: getRotation(toRadians(-15), 0, 0),
    leftArm: getRotation(0, 0, toRadians(-80 - 15 * wobble)),
    rightArm: getRotation(0, 0, toRadians(80 - 15 * wobble)),
    leftLeg: getRotation(toRadians(-bend), 0, toRadians(-14)),
    rightLeg: getRotation(toRadians(-bend), 0, toRadians(14)),
    leftShin: getRotation(toRadians(bend * 2), 0, 0),
    rightShin: getRotation(toRadians(bend * 2), 0, 0),
  };
}

const POSES: Readonly<Record<MeshPoseId, (beat: number, kick: number) => HeroPose>> = {
  sit: getSitPose,
  cheer: getCheerPose,
  surf: getSurfPose,
};

export function getRiderPlacement(
  hero: HeroId,
  pose: MeshPoseId,
  x: number,
  seatY: number,
  size: number,
  rotate: Rotation,
  beat: number,
  kick: number,
): HeroPlacement {
  const placement: HeroPlacement = { x, y: seatY, size, rotate, pose: POSES[pose](beat, kick) };
  const anchor =
    pose === "surf"
      ? getHeroPoint(hero, placement, [0.15, -0.72, 0], "rightShin")
      : getHeroPoint(hero, placement, [0, -0.18, 0], "hips");
  return { ...placement, y: seatY + (seatY - anchor[1]) };
}

export const nyanMeshRiders = defineEffect({
  id: "nyan-mesh-riders",
  name: "Nyan 3D riders",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    ...nyanParams,
    rider: z.enum(riderIds).default("frieren"),
    pose: z.enum(meshPoseIds).default("sit"),
    size: z.number().min(6).max(16).default(12),
    yaw: z.number().min(-90).max(90).default(35),
    stars: z.number().int().min(0).max(40).default(12),
  }),
  render(image, { params, beat }) {
    fillBackground(image, parseColor(params.background));
    const frame = getNyanFrame(beat, params.speed);
    drawStars(image, frame, { count: params.stars });
    const x = 20;
    const y = 38;
    drawRainbow(image, x, y, frame);
    drawNyan(image, params, x, y, frame);
    const seatY = y + getTartBob(frame) + 2;
    const kick = Math.exp(-(beat % 1) * 6);
    const raster = createRaster();
    for (const [rider, seatX] of SEATS[params.rider]) {
      drawHero(
        raster,
        rider,
        getRiderPlacement(
          rider,
          params.pose,
          x + seatX,
          seatY,
          params.size * (params.rider === "both" ? 0.85 : 1),
          getRotation(toRadians(8), toRadians(params.yaw), 0),
          beat,
          kick,
        ),
      );
    }
    compositeRaster(raster, image);
  },
});
