import { z } from "zod";
import { defineEffect } from "../effect.ts";
import { HEIGHT, WIDTH } from "../frame.ts";
import { easings } from "../keyframes.ts";
import { type Rotation, type Vector, createRaster, getRotation, resolveRaster } from "../mesh.ts";
import { createRandom, getRandomBetween, hashSeed } from "../random.ts";
import { toRadians } from "./cat-duo.ts";
import { getCycle } from "./cat-dance.ts";
import { HERO_CENTER, drawHero, drawProp } from "./frieren-model.ts";
import {
  CHEST_HALF,
  createChestMesh,
  createDanglingHairMesh,
  createLidMesh,
} from "./frieren-props.ts";

const SHAKE_SEED = 0xf41e0;
const GROUND_Y = -0.75;
const CHEST_CENTER: Vector = [-0.4, GROUND_Y + CHEST_HALF[1], 0];
const HINGE: Vector = [CHEST_CENTER[0] - CHEST_HALF[0], CHEST_CENTER[1] + CHEST_HALF[1], 0];
const LID_OPEN = toRadians(62);
const LID_RAISED = toRadians(88);
const LID_CLOSED = toRadians(24);
const VIEW_PITCH = toRadians(18);
const VIEW_YAW = toRadians(-28);

const chestMesh = createChestMesh();
const lidMesh = createLidMesh();

type Impact = {
  lid: number;
  zoom: number;
  squash: number;
  shakeX: number;
  shakeY: number;
  kick: number;
  since: number;
};

function getImpact(beat: number, every: number, zoom: number, shake: number): Impact {
  const index = Math.floor(beat / every);
  const phase = getCycle(beat / every);
  const since = phase * every;
  const isBig = ((index % 4) + 4) % 4 === 0;
  const power = isBig ? 1.5 : 1;
  const punch = Math.exp(-since * 7) * power;
  const wobble = Math.exp(-since * 5) * Math.cos(since * 30);
  let lid: number;
  let windup = 0;
  if (phase < 0.45) {
    lid = LID_CLOSED + (LID_OPEN - LID_CLOSED) * easings.easeOutCubic(phase / 0.45);
  } else if (phase < 0.82) {
    windup = easings.easeInOutSine((phase - 0.45) / 0.37);
    lid = LID_OPEN + (LID_RAISED - LID_OPEN) * windup;
  } else {
    const slam = easings.easeInCubic((phase - 0.82) / 0.18);
    windup = 1 - slam;
    lid = LID_RAISED + (LID_CLOSED - LID_RAISED) * slam;
  }
  const random = createRandom(hashSeed(SHAKE_SEED, index, Math.floor(since * 24)));
  const amplitude = shake * Math.exp(-since * 6) * power;
  return {
    lid,
    zoom: 1 + zoom * (punch - 0.25 * windup),
    squash: 0.07 * wobble * power - 0.03 * windup,
    shakeX: getRandomBetween(random, -1, 1) * amplitude,
    shakeY: getRandomBetween(random, -1, 1) * amplitude,
    kick: punch,
    since,
  };
}

function getSquashedRotation(rotate: Rotation, squash: number): Rotation {
  const groundY = GROUND_Y - HERO_CENTER[1];
  const sideways = 1 + squash * 0.6;
  return ([x, y, depth]) =>
    rotate([x * sideways, groundY + (y - groundY) * (1 - squash), depth * sideways]);
}

export const frierenMimic = defineEffect({
  id: "frieren-mimic",
  name: "Frieren mimic",
  kind: "pixel",
  params: z.object({
    every: z.number().min(0.25).max(8).default(1),
    size: z.number().min(8).max(40).default(20),
    zoom: z.number().min(0).max(0.6).default(0.18),
    shake: z.number().min(0).max(6).default(1.5),
  }),
  render(image, { params, beat }) {
    const impact = getImpact(beat, params.every, params.zoom, params.shake);
    const raster = createRaster();
    const placement = {
      x: WIDTH / 2 + impact.shakeX,
      y: HEIGHT / 2 - params.size * 0.62 + impact.shakeY,
      size: params.size * impact.zoom,
      rotate: getSquashedRotation(getRotation(VIEW_PITCH, VIEW_YAW, 0), impact.squash),
    };
    drawProp(raster, chestMesh, placement, 0, undefined, CHEST_CENTER);
    drawProp(raster, lidMesh, placement, 0, getRotation(0, 0, impact.lid), HINGE);
    drawProp(
      raster,
      createDanglingHairMesh(Math.sin(impact.since * 12) * Math.exp(-impact.since * 4)),
      placement,
      0,
      undefined,
      [CHEST_CENTER[0] + CHEST_HALF[0], HINGE[1], 0],
    );
    const step = Math.floor(beat / params.every);
    const flail = Math.sin(impact.since * 9) * Math.exp(-impact.since * 2.5);
    const left = step % 2 === 0 ? 1 : 0.3;
    const right = 1.3 - left;
    const wiggle = Math.sin(beat * Math.PI * 2);
    drawHero(raster, "frieren", {
      ...placement,
      orient: getRotation(0, toRadians(-90), 0),
      hidden: ["hair", "leftArm", "rightArm", "leftForearm", "rightForearm"],
      offset: [0.6, -0.05 - impact.kick * 0.06, 0],
      pose: {
        torso: getRotation(toRadians(98 + 6 * impact.kick), 0, toRadians(4 * wiggle)),
        head: getRotation(toRadians(20), 0, 0),
        leftArm: getRotation(toRadians(-160), 0, toRadians(-15)),
        rightArm: getRotation(toRadians(-160), 0, toRadians(15)),
        leftLeg: getRotation(toRadians(-12), 0, toRadians(-6)),
        rightLeg: getRotation(toRadians(-12), 0, toRadians(6)),
        leftShin: getRotation(toRadians(95 - 55 * left * Math.max(0, flail)), 0, 0),
        rightShin: getRotation(toRadians(95 - 55 * right * Math.max(0, -flail)), 0, 0),
      },
    });
    resolveRaster(raster, image);
  },
});
