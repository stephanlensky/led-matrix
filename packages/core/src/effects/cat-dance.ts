import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { HEIGHT, WIDTH } from "../frame.ts";
import { easings } from "../keyframes.ts";
import {
  type Rotation,
  type Vector,
  compose,
  createRaster,
  getRotation,
  resolveRaster,
} from "../mesh.ts";
import { TAU, catIds, coatParams, getCoats, toRadians } from "./cat-duo.ts";
import { type CatFace, drawEyes, eyeStyles, getCatFace, getEyelessCoat } from "./cat-face.ts";
import { type CatPose, drawCat } from "./cat-model.ts";

export const danceMoves = [
  "headbang",
  "sway",
  "hop",
  "paws-up",
  "twist",
  "conga",
  "wiggle",
  "twerk",
  "front-twerk",
  "booty-shake",
] as const;

export type DanceMove = (typeof danceMoves)[number];

export const catDancers = ["both", ...catIds] as const;

type DancerFrame = {
  x: number;
  y: number;
  size: number;
  rotate: Rotation;
  pose: CatPose;
};

type Dancer = { x: number; phase: number; side: number };

export const VIEW_PITCH = toRadians(12);
export const BASE_Y = HEIGHT / 2 + 6;

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

function getWiggle(beat: number, dancer: Dancer, size: number): DancerFrame {
  const phase = beat + dancer.phase;
  const step = Math.cos(phase * Math.PI);
  const lift = Math.abs(Math.sin(phase * Math.PI));
  const stand = toRadians(-62);
  const clasp = toRadians(-95 + 15 * lift);
  return {
    x: dancer.x + step * 3,
    y: BASE_Y - 3 - lift * 1.5,
    size,
    rotate: getRotation(VIEW_PITCH + stand, dancer.side * 0.2, toRadians(-10 * step)),
    pose: {
      head: getRotation(-stand + toRadians(-8), toRadians(-10 * step), toRadians(18 * step)),
      tail: getRotation(toRadians(60), 0, toRadians(45 * step)),
      frontLeftLeg: getRotation(clasp, 0, toRadians(-30)),
      frontRightLeg: getRotation(clasp, 0, toRadians(30)),
      backLeftLeg: getPitch(-stand + toRadians(-25 * lift * Math.max(0, -step))),
      backRightLeg: getPitch(-stand + toRadians(-25 * lift * Math.max(0, step))),
    },
  };
}

function getTwerk(beat: number, dancer: Dancer, size: number): DancerFrame {
  const phase = beat + dancer.phase;
  const bounce = getHeadbangAngle(getCycle(phase));
  const shake = Math.sin(phase * Math.PI);
  const lean = toRadians(35 + 20 * bounce);
  const bend = toRadians(-35 * bounce);
  return {
    x: dancer.x + shake,
    y: BASE_Y + 2 - bounce * 2,
    size,
    rotate: compose(
      getRotation(VIEW_PITCH, Math.PI - dancer.side * 0.5, 0),
      getRotation(lean, toRadians(14 * shake), toRadians(-18 * shake)),
    ),
    pose: {
      head: getRotation(-lean - toRadians(15), dancer.side * toRadians(-90), toRadians(15 * shake)),
      tail: getRotation(toRadians(20 - 40 * bounce), 0, toRadians(60 * shake)),
      frontLeftLeg: getPitch(-lean + toRadians(-20)),
      frontRightLeg: getPitch(-lean + toRadians(-20)),
      backLeftLeg: getPitch(-lean + bend),
      backRightLeg: getPitch(-lean + bend),
    },
  };
}

const BOW_PIVOT: Vector = [0, -0.4, 0.4];

function getBowFrame(
  dancer: Dancer,
  size: number,
  bow: number,
  motion: Rotation,
  pose: CatPose,
): DancerFrame {
  const view = compose(getRotation(VIEW_PITCH, dancer.side * 0.75, 0), getPitch(bow));
  const rotate = compose(view, motion);
  const [restX, restY] = view(BOW_PIVOT);
  const [movedX, movedY] = rotate(BOW_PIVOT);
  return {
    x: dancer.x + size * (restX - movedX),
    y: BASE_Y + 1 - size * (restY - movedY),
    size,
    rotate,
    pose,
  };
}

function getFrontTwerk(beat: number, dancer: Dancer, size: number): DancerFrame {
  const phase = beat + dancer.phase;
  const bounce = getHeadbangAngle(getCycle(phase * 2));
  const shake = Math.sin(phase * Math.PI);
  const bow = toRadians(25);
  const lift = toRadians(35 * bounce);
  const tilt = bow + lift;
  return getBowFrame(dancer, size, bow, getRotation(lift, 0, toRadians(-8 * shake)), {
    head: getRotation(-tilt + toRadians(-10), dancer.side * toRadians(-35), 0),
    tail: getRotation(toRadians(40 - 50 * bounce), 0, toRadians(40 * shake)),
    frontLeftLeg: getPitch(-tilt - toRadians(55)),
    frontRightLeg: getPitch(-tilt - toRadians(55)),
    backLeftLeg: getPitch(-tilt),
    backRightLeg: getPitch(-tilt),
  });
}

function getBootyShake(beat: number, dancer: Dancer, size: number): DancerFrame {
  const phase = beat + dancer.phase;
  const hip = Math.cos(phase * TAU);
  const bow = toRadians(30);
  const swing = toRadians(-30 * hip);
  return getBowFrame(dancer, size, bow, getRotation(0, swing, toRadians(8 * hip)), {
    head: getRotation(-bow + toRadians(-10), dancer.side * toRadians(-35) - swing, 0),
    tail: getRotation(toRadians(30), 0, toRadians(70 * hip)),
    frontLeftLeg: getPitch(-bow - toRadians(55)),
    frontRightLeg: getPitch(-bow - toRadians(55)),
    backLeftLeg: getPitch(-bow),
    backRightLeg: getPitch(-bow),
  });
}

export const catMoveFrames: Record<
  DanceMove,
  (beat: number, dancer: Dancer, size: number, progress: number) => DancerFrame
> = {
  headbang: getHeadbang,
  sway: getSway,
  hop: getHop,
  "paws-up": getPawsUp,
  twist: getTwist,
  conga: getConga,
  wiggle: getWiggle,
  twerk: getTwerk,
  "front-twerk": getFrontTwerk,
  "booty-shake": getBootyShake,
};

export const catDance = defineEffect({
  id: "cat-dance",
  name: "Cat dance",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    ...coatParams,
    move: z.enum(danceMoves).default("headbang"),
    speed: z.number().min(0.25).max(4).default(1),
    size: z.number().min(4).max(16).default(10),
    offbeat: z.boolean().default(false),
    dancers: z.enum(catDancers).default("both"),
    spacing: z.number().min(0).max(40).default(28),
    eyes: z.enum(eyeStyles).default("open"),
    heartColor: colorSchema.default("#ff2a6d"),
  }),
  render(image, { params, beat, progress }) {
    const [tabbyCoat, blackCoat] = getCoats(params);
    const offset = params.offbeat ? 0.5 : 0;
    const isSolo = params.dancers !== "both";
    const spacing = isSolo ? 0 : params.spacing;
    const dancers: [Dancer, typeof tabbyCoat, string][] = (
      [
        [
          "tabby",
          { x: WIDTH / 2 - spacing / 2, phase: offset, side: 1 },
          tabbyCoat,
          params.tabbyEyeColor,
        ],
        ["black", { x: WIDTH / 2 + spacing / 2, phase: 0, side: -1 }, blackCoat, params.eyeColor],
      ] as const
    )
      .filter(([cat]) => !isSolo || cat === params.dancers)
      .map(([, dancer, coat, eyeColor]) => [dancer, coat, eyeColor]);
    const raster = createRaster();
    const faces: [CatFace, string][] = [];
    for (const [dancer, coat, eyeColor] of dancers) {
      const frame = catMoveFrames[params.move](beat * params.speed, dancer, params.size, progress);
      drawCat(raster, frame, params.eyes === "open" ? coat : getEyelessCoat(coat));
      faces.push([getCatFace(frame), eyeColor]);
    }
    resolveRaster(raster, image);
    if (params.eyes !== "open") {
      const pop = 1 + 0.3 * Math.exp(-getCycle(beat) * 6);
      for (const [face, eyeColor] of faces) {
        drawEyes(
          image,
          face,
          params.eyes,
          parseColor(eyeColor),
          parseColor(params.heartColor),
          pop,
          params.size * 0.32,
        );
      }
    }
  },
});
