import type { Color } from "../frame.ts";
import {
  type Mesh,
  type Raster,
  type Rotation,
  type Vector,
  addCone,
  addEllipsoid,
  createMesh,
  drawMesh,
} from "../mesh.ts";
import { getShade, mix, scale } from "./cat-model.ts";
import { type ModelPlacement, getJointTransforms, getModelProjector } from "./hunter-model.ts";

type PumpkinPart = "pumpkin" | "stem" | "body" | "hand" | "shoe";

export type PumpkinJoint = "torso" | "head" | "leftArm" | "rightArm" | "leftLeg" | "rightLeg";

export type PumpkinPose = Partial<Record<PumpkinJoint, Rotation>>;

export type PumpkinColors = {
  pumpkin: Color;
  stem: Color;
  body: Color;
  glow: Color;
};

export type PumpkinPlacement = ModelPlacement & {
  pose?: PumpkinPose;
  glow?: number;
  flash?: number;
};

type PumpkinGroup = { joint: PumpkinJoint; mesh: Mesh<PumpkinPart> };

const MODEL_CENTER: Vector = [0, 0.62, 0];
const HEAD_CENTER: Vector = [0, 0.86, 0];
const HEAD_RADIUS: Vector = [0.8, 0.54, 0.68];
const RIBS = 8;

const JOINT_PARENTS: readonly (readonly [joint: PumpkinJoint, parent?: PumpkinJoint])[] = [
  ["torso"],
  ["head", "torso"],
  ["leftArm", "torso"],
  ["rightArm", "torso"],
  ["leftLeg"],
  ["rightLeg"],
];

const PIVOTS: Record<PumpkinJoint, Vector> = {
  torso: [0, 0.02, 0],
  head: [0, 0.4, 0],
  leftArm: [-0.27, 0.3, 0],
  rightArm: [0.27, 0.3, 0],
  leftLeg: [-0.15, 0.02, 0],
  rightLeg: [0.15, 0.02, 0],
};

const SIDES = [
  [-1, "leftArm", "leftLeg"],
  [1, "rightArm", "rightLeg"],
] as const;

function createPumpkinGroups(): PumpkinGroup[] {
  const head = createMesh<PumpkinPart>();
  const [centerX, centerY, centerZ] = HEAD_CENTER;
  const [radiusX, radiusY, radiusZ] = HEAD_RADIUS;
  for (let rib = 0; rib < RIBS; rib++) {
    const angle = (rib / RIBS) * Math.PI * 2;
    addEllipsoid(
      head,
      [
        centerX + Math.sin(angle) * radiusX * 0.35,
        centerY,
        centerZ + Math.cos(angle) * radiusZ * 0.35,
      ],
      [radiusX * 0.68, radiusY, radiusZ * 0.68],
      "pumpkin",
      8,
      12,
    );
  }
  addCone(
    head,
    [0.04, centerY + radiusY * 0.85, -0.02],
    [0.24, centerY + radiusY + 0.24, 0.02],
    [0.1, 0.07],
    "stem",
    6,
  );
  const torso = createMesh<PumpkinPart>();
  addEllipsoid(torso, [0, 0.2, 0], [0.32, 0.26, 0.26], "body");
  const groups: PumpkinGroup[] = [
    { joint: "torso", mesh: torso },
    { joint: "head", mesh: head },
  ];
  for (const [side, armJoint, legJoint] of SIDES) {
    const arm = createMesh<PumpkinPart>();
    addEllipsoid(arm, [side * 0.38, 0.22, 0], [0.1, 0.13, 0.1], "body", 6, 8);
    addEllipsoid(arm, [side * 0.42, 0.08, 0], [0.12, 0.12, 0.12], "hand", 5, 8);
    groups.push({ joint: armJoint, mesh: arm });
    const leg = createMesh<PumpkinPart>();
    addEllipsoid(leg, [side * 0.16, -0.06, 0], [0.12, 0.12, 0.12], "body", 6, 8);
    addEllipsoid(leg, [side * 0.18, -0.18, 0.08], [0.16, 0.09, 0.2], "shoe", 5, 8);
    groups.push({ joint: legJoint, mesh: leg });
  }
  return groups;
}

const pumpkinGroups = createPumpkinGroups();

const EYES = [
  { u: -0.36, v: 0.3, radius: 0.27, pupilU: 0.1, pupilV: -0.06 },
  { u: 0.35, v: 0.2, radius: 0.19, pupilU: -0.08, pupilV: 0.02 },
] as const;

const PUPIL_RADIUS = 0.09;

function getEyeCarve(u: number, v: number): boolean {
  return EYES.some((eye) => {
    const isEye = Math.hypot(u - eye.u, v - eye.v) < eye.radius;
    const isPupil = Math.hypot(u - eye.u - eye.pupilU, v - eye.v - eye.pupilV) < PUPIL_RADIUS;
    return isEye && !isPupil;
  });
}

function getMouthCarve(u: number, v: number): boolean {
  const x = (u - 0.05) / 0.55;
  if (Math.abs(x) > 1) {
    return false;
  }
  const curve = 1 - x ** 2;
  const tilt = 0.08 * x;
  const top = -0.18 + tilt - 0.08 * curve;
  const bottom = -0.24 + tilt - 0.36 * curve;
  if (v > top || v < bottom) {
    return false;
  }
  const isBuckTooth = Math.abs(u + 0.06) < 0.09 && v > top - 0.16;
  return !isBuckTooth;
}

function getCarve(u: number, v: number): boolean {
  return getEyeCarve(u, v) || getMouthCarve(u, v);
}

const RIM_OFFSETS = [
  [0.07, 0],
  [-0.07, 0],
  [0, 0.07],
  [0, -0.07],
] as const;

export function getFaceCarve([x, y, z]: Vector): "carve" | "rim" | undefined {
  if (z < 0.15) {
    return undefined;
  }
  const u = x / HEAD_RADIUS[0];
  const v = (y - HEAD_CENTER[1]) / HEAD_RADIUS[1];
  if (getCarve(u, v)) {
    return "carve";
  }
  return RIM_OFFSETS.some(([offsetU, offsetV]) => getCarve(u + offsetU, v + offsetV))
    ? "rim"
    : undefined;
}

function getRib([x, , z]: Vector): number {
  const angle = Math.atan2(x, z);
  return 0.78 + 0.22 * Math.abs(Math.cos((angle * RIBS) / 2));
}

function getPartColor(
  part: PumpkinPart,
  position: Vector,
  shade: number,
  colors: PumpkinColors,
  glow: number,
): Color {
  if (part === "pumpkin") {
    const carve = getFaceCarve(position);
    if (carve === "carve") {
      return scale(colors.glow, glow);
    }
    return scale(colors.pumpkin, shade * getRib(position) * (carve === "rim" ? 0.35 : 1));
  }
  if (part === "stem") {
    return scale(colors.stem, shade);
  }
  if (part === "hand") {
    return scale(mix(colors.body, [255, 255, 255], 0.25), shade);
  }
  if (part === "shoe") {
    return scale(mix(colors.body, [0, 0, 0], 0.6), shade);
  }
  return scale(colors.body, shade);
}

export function drawPumpkin(
  raster: Raster,
  placement: PumpkinPlacement,
  colors: PumpkinColors,
): void {
  const project = getModelProjector(MODEL_CENTER, placement);
  const transforms = getJointTransforms(JOINT_PARENTS, PIVOTS, placement.pose ?? {});
  const glow = placement.glow ?? 1;
  const flash = placement.flash ?? 0;
  for (const { joint, mesh } of pumpkinGroups) {
    const transform = transforms.get(joint);
    const position = transform?.position ?? ((vector: Vector) => vector);
    const normal = transform?.normal ?? ((vector: Vector) => vector);
    drawMesh(raster, mesh, {
      project: (vector) => project(position(vector)),
      getShade: (vector) => getShade(placement.rotate(normal(vector))),
      getColor: (part, vector, shade) =>
        mix(getPartColor(part, vector, shade, colors, glow), colors.glow, flash),
    });
  }
}
