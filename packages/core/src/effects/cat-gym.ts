import { z } from "zod";
import { defineEffect } from "../effect.ts";
import { HEIGHT, WIDTH } from "../frame.ts";
import {
  type Rotation,
  type Vector,
  compose,
  createRaster,
  getRotation,
  resolveRaster,
  subtract,
} from "../mesh.ts";
import { type CatId, catIds, furParams, getCoat, toRadians } from "./cat-duo.ts";
import {
  type CatPlacement,
  type CatPose,
  drawCat,
  drawCatProp,
  getCatOffset,
  scale,
} from "./cat-model.ts";
import { getSquashedRotation } from "./cat-laptop.ts";
import { HERO_CENTER, PROP_COLORS, type PropPart, drawProp } from "./frieren-model.ts";
import { CHEST_CENTER, GROUND_Y, getImpact } from "./frieren-mimic.ts";
import {
  createBarbellMesh,
  createBenchMesh,
  createChestMesh,
  createLidMesh,
} from "./frieren-props.ts";
import { getRep } from "./himmel-lift.ts";
import type { ModelPlacement } from "./hunter-model.ts";

const benchMesh = createBenchMesh();
const benchBarbellMesh = createBarbellMesh([0, 0, 0], 1.2, 0.24);
const squatBarbellMesh = createBarbellMesh([0, -0.9, 0.35], 1.05, 0.3);
const MIMIC_HALF: Vector = [0.7, 0.55, 0.85];
const mimicMesh = createChestMesh(MIMIC_HALF);
const mimicLidMesh = createLidMesh(MIMIC_HALF);
const MIMIC_CENTER: Vector = [CHEST_CENTER[0], GROUND_Y + MIMIC_HALF[1], 0];
const MIMIC_HINGE: Vector = [MIMIC_CENTER[0] - MIMIC_HALF[0], MIMIC_CENTER[1] + MIMIC_HALF[1], 0];
const ON_BACK = getRotation(0, 0, Math.PI);
const UPRIGHT = toRadians(-75);
const STAND = getRotation(UPRIGHT, 0, 0);
const UNSTAND = getRotation(-UPRIGHT, 0, 0);
const HIP_Y = -0.83;
const LEG_LENGTH = 0.56;
const DIVE = getRotation(toRadians(-90), 0, 0);
const VIEW_PITCH = toRadians(18);
const VIEW_YAW = toRadians(-28);
const TURN = getRotation(0, Math.PI, 0);

function getPropColor(part: PropPart, _position: Vector, shade: number) {
  return scale(PROP_COLORS[part], shade);
}

function getCatPlacement(
  scene: ModelPlacement,
  position: Vector,
  orient: Rotation,
  pose: CatPose,
  view = scene.rotate,
): CatPlacement {
  const [x, y, depth] = getCatOffset(scene.rotate, subtract(position, HERO_CENTER), scene.size);
  return {
    x: scene.x + x,
    y: scene.y + y,
    size: scene.size,
    depth,
    rotate: compose(view, orient),
    pose,
  };
}

function getLiftParams(yaw: number, pitch: number, size: number, cat: CatId) {
  return z.object({
    ...furParams,
    cat: z.enum(catIds).default(cat),
    every: z.number().min(0.5).max(8).default(2),
    size: z.number().min(6).max(32).default(size),
    yaw: z.number().min(-180).max(180).default(yaw),
    pitch: z.number().min(-60).max(60).default(pitch),
    punch: z.number().min(0).max(0.3).default(0.06),
  });
}

export const catBench = defineEffect({
  id: "cat-bench",
  name: "Cat bench press",
  kind: "pixel",
  params: getLiftParams(80, 25, 15, "black"),
  render(image, { params, beat }) {
    const rep = getRep(beat, params.every);
    const raster = createRaster();
    const scene: ModelPlacement = {
      x: WIDTH / 2,
      y: HEIGHT / 2 - params.size * 0.1,
      size: params.size * (1 + params.punch * rep.punch),
      rotate: getRotation(toRadians(params.pitch), toRadians(params.yaw), 0),
    };
    const lifter: Vector = [0, 0.2, 0.45];
    const splay = toRadians(10 + 55 * rep.depth);
    const tilt = toRadians(30 * rep.depth);
    const paw = -0.58 - 0.5 * Math.cos(splay) * Math.cos(tilt);
    drawProp(raster, benchMesh, scene);
    drawProp(raster, benchBarbellMesh, scene, 0, undefined, [
      0,
      lifter[1] - paw,
      lifter[2] - 0.35 + 0.5 * Math.sin(tilt),
    ]);
    const placement = getCatPlacement(scene, lifter, compose(TURN, ON_BACK), {
      head: getRotation(toRadians(100), toRadians(-40), 0),
      frontLeftLeg: getRotation(tilt, 0, -splay),
      frontRightLeg: getRotation(tilt, 0, splay),
      backLeftLeg: getRotation(toRadians(-30), 0, toRadians(-20)),
      backRightLeg: getRotation(toRadians(-30), 0, toRadians(20)),
      tail: getRotation(toRadians(10), 0, 0),
    });
    drawCat(raster, placement, getCoat(params));
    resolveRaster(raster, image);
  },
});

export const catSquat = defineEffect({
  id: "cat-squat",
  name: "Cat squat",
  kind: "pixel",
  params: getLiftParams(12, 10, 13, "black"),
  render(image, { params, beat }) {
    const rep = getRep(beat, params.every);
    const depth = 1 - rep.depth;
    const raster = createRaster();
    const splay = toRadians(60 * depth);
    const foot = HIP_Y - LEG_LENGTH * Math.cos(splay);
    const size = params.size * (1 + params.punch * rep.punch);
    const wobble = depth > 0.9 ? Math.sin(beat * 70) * 0.05 : 0;
    const view = getRotation(toRadians(params.pitch), toRadians(params.yaw), wobble);
    const squash = 0.1 * depth * depth + 0.08 * rep.punch;
    const lift = getRotation(toRadians(-55 + 10 * depth), 0, 0);
    const placement: CatPlacement = {
      x: WIDTH / 2,
      y: HEIGHT / 2 - 2 + (HIP_Y - LEG_LENGTH - foot) * -size,
      size,
      rotate: compose(getSquashedRotation(view, squash, foot), STAND),
      pose: {
        head: UNSTAND,
        frontLeftLeg: lift,
        frontRightLeg: lift,
        backLeftLeg: compose(UNSTAND, getRotation(toRadians(-10 * depth), 0, -splay)),
        backRightLeg: compose(UNSTAND, getRotation(toRadians(-10 * depth), 0, splay)),
        tail: getRotation(toRadians(60 - 50 * depth), toRadians(20 * Math.sin(beat * Math.PI)), 0),
      },
    };
    drawCat(raster, placement, getCoat(params));
    drawCatProp(raster, placement, squatBarbellMesh, getPropColor, "frontLeftLeg");
    resolveRaster(raster, image);
  },
});

export const catMimic = defineEffect({
  id: "cat-mimic",
  name: "Cat mimic",
  kind: "pixel",
  params: z.object({
    ...furParams,
    cat: z.enum(catIds).default("black"),
    every: z.number().min(0.25).max(8).default(1),
    size: z.number().min(8).max(40).default(15),
    zoom: z.number().min(0).max(0.6).default(0.18),
    shake: z.number().min(0).max(6).default(1.5),
  }),
  render(image, { params, beat }) {
    const impact = getImpact(beat, params.every, params.zoom, params.shake);
    const raster = createRaster();
    const view = getRotation(VIEW_PITCH, VIEW_YAW, 0);
    const scene: ModelPlacement = {
      x: WIDTH / 2 + impact.shakeX,
      y: HEIGHT / 2 + params.size * 0.3 + impact.shakeY,
      size: params.size * impact.zoom,
      rotate: getSquashedRotation(view, impact.squash, GROUND_Y - HERO_CENTER[1]),
    };
    drawProp(raster, mimicMesh, scene, 0, undefined, MIMIC_CENTER);
    drawProp(raster, mimicLidMesh, scene, 0, getRotation(0, 0, impact.lid), MIMIC_HINGE);
    const step = Math.floor(beat / params.every);
    const flail = Math.sin(impact.since * 9) * Math.exp(-impact.since * 2.5);
    const left = step % 2 === 0 ? 1 : 0.3;
    const right = 1.3 - left;
    const wiggle = Math.sin(beat * Math.PI * 2);
    const placement = getCatPlacement(
      scene,
      [MIMIC_CENTER[0] + 0.05, 0.5 - impact.kick * 0.08, 0],
      compose(
        getRotation(0, toRadians(90), toRadians(4 * wiggle)),
        getRotation(toRadians(110), 0, 0),
        ON_BACK,
      ),
      {
        frontLeftLeg: DIVE,
        frontRightLeg: DIVE,
        backLeftLeg: getRotation(toRadians(-20 + 70 * left * flail), 0, toRadians(-15)),
        backRightLeg: getRotation(toRadians(-20 - 70 * right * flail), 0, toRadians(15)),
        tail: getRotation(toRadians(20 + 30 * flail), toRadians(40 * wiggle), 0),
      },
      getSquashedRotation(view, impact.squash, 0),
    );
    drawCat(raster, placement, getCoat(params));
    resolveRaster(raster, image);
  },
});
