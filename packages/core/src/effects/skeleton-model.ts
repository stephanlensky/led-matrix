import type { Color } from "../frame.ts";
import {
  IDENTITY_MATRIX,
  type Matrix,
  type Mesh,
  type Raster,
  type Rotation,
  type Vector,
  addEllipsoid,
  createMesh,
  drawMesh,
  getLinearMatrix,
  getMatrix,
  getModelMatrix,
  multiplyMatrices,
  subtract,
} from "../mesh.ts";
import { getNormalShader, mix, scale } from "./cat-model.ts";
import { type ModelPlacement, getJointMatrices, getProjector } from "./hunter-model.ts";
import { type SkullHeadColors, drawSkullHead } from "./skull-model.ts";

type SkeletonPart = "bone" | "joint";

export type SkeletonJoint =
  | "pelvis"
  | "torso"
  | "head"
  | "leftArm"
  | "leftForearm"
  | "rightArm"
  | "rightForearm"
  | "leftLeg"
  | "leftShin"
  | "rightLeg"
  | "rightShin";

export type SkeletonPose = Partial<Record<SkeletonJoint, Rotation>>;

export type SkeletonPlacement = ModelPlacement & {
  pose?: SkeletonPose;
  jaw?: number;
  glow?: number;
  flash?: number;
};

type SkeletonGroup = { joint: SkeletonJoint; mesh: Mesh<SkeletonPart> };

const MODEL_CENTER: Vector = [0, 0.36, 0];
const SKULL_SCALE = 0.6;
const SKULL_OFFSET: Vector = [0, 1.28, -0.06];
const WHITE: Color = [255, 255, 255];

const JOINT_PARENTS: readonly (readonly [joint: SkeletonJoint, parent?: SkeletonJoint])[] = [
  ["pelvis"],
  ["torso", "pelvis"],
  ["head", "torso"],
  ["leftArm", "torso"],
  ["leftForearm", "leftArm"],
  ["rightArm", "torso"],
  ["rightForearm", "rightArm"],
  ["leftLeg", "pelvis"],
  ["leftShin", "leftLeg"],
  ["rightLeg", "pelvis"],
  ["rightShin", "rightLeg"],
];

const PIVOTS: Record<SkeletonJoint, Vector> = {
  pelvis: [0, 0, 0],
  torso: [0, 0.08, 0],
  head: [0, 0.95, 0],
  leftArm: [-0.3, 0.84, 0],
  leftForearm: [-0.34, 0.48, 0],
  rightArm: [0.3, 0.84, 0],
  rightForearm: [0.34, 0.48, 0],
  leftLeg: [-0.14, -0.04, 0],
  leftShin: [-0.15, -0.48, 0],
  rightLeg: [0.14, -0.04, 0],
  rightShin: [0.15, -0.48, 0],
};

const SIDES = [
  [-1, "leftArm", "leftForearm", "leftLeg", "leftShin"],
  [1, "rightArm", "rightForearm", "rightLeg", "rightShin"],
] as const;

const RIBS = [
  [0.78, 0.25, 0.16],
  [0.68, 0.27, 0.18],
  [0.58, 0.26, 0.18],
  [0.48, 0.22, 0.16],
] as const;

function getPoint(from: Vector, to: Vector, t: number): Vector {
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
  ];
}

function addBone(
  mesh: Mesh<SkeletonPart>,
  from: Vector,
  to: Vector,
  radius: number,
  knob = radius * 1.4,
): void {
  const length = Math.hypot(...subtract(to, from));
  const steps = Math.max(1, Math.ceil(length / radius));
  for (let step = 0; step <= steps; step++) {
    addEllipsoid(mesh, getPoint(from, to, step / steps), [radius, radius, radius], "bone", 4, 6);
  }
  addEllipsoid(mesh, from, [knob, knob, knob], "joint", 4, 6);
  addEllipsoid(mesh, to, [knob, knob, knob], "joint", 4, 6);
}

function addRib(
  mesh: Mesh<SkeletonPart>,
  side: number,
  y: number,
  radiusX: number,
  radiusZ: number,
): void {
  const steps = 7;
  for (let step = 0; step <= steps; step++) {
    const angle = 0.35 + (step / steps) * (Math.PI - 0.6);
    addEllipsoid(
      mesh,
      [side * radiusX * Math.sin(angle), y + 0.05 * (angle / Math.PI), radiusZ * Math.cos(angle)],
      [0.04, 0.032, 0.04],
      "bone",
      4,
      6,
    );
  }
}

function createSkeletonGroups(): SkeletonGroup[] {
  const pelvis = createMesh<SkeletonPart>();
  addEllipsoid(pelvis, [0, 0.02, -0.04], [0.07, 0.1, 0.05], "bone", 5, 8);
  const torso = createMesh<SkeletonPart>();
  for (let y = 0.1; y < 0.98; y += 0.08) {
    addEllipsoid(torso, [0, y, -0.06], [0.055, 0.032, 0.05], "joint", 4, 6);
  }
  addEllipsoid(torso, [0, 0.64, 0.15], [0.04, 0.15, 0.03], "bone", 5, 6);
  const groups: SkeletonGroup[] = [
    { joint: "pelvis", mesh: pelvis },
    { joint: "torso", mesh: torso },
  ];
  for (const [side, armJoint, forearmJoint, legJoint, shinJoint] of SIDES) {
    addEllipsoid(pelvis, [side * 0.13, 0.06, 0], [0.12, 0.1, 0.07], "bone", 5, 8);
    for (const [y, radiusX, radiusZ] of RIBS) {
      addRib(torso, side, y, radiusX, radiusZ);
    }
    addBone(torso, [side * 0.05, 0.86, 0.08], [side * 0.28, 0.86, 0], 0.035, 0.05);
    const arm = createMesh<SkeletonPart>();
    addBone(arm, PIVOTS[armJoint], PIVOTS[forearmJoint], 0.05, 0.07);
    groups.push({ joint: armJoint, mesh: arm });
    const forearm = createMesh<SkeletonPart>();
    const wrist: Vector = [side * 0.36, 0.16, 0];
    addBone(forearm, PIVOTS[forearmJoint], wrist, 0.045, 0.055);
    addEllipsoid(forearm, [side * 0.37, 0.08, 0], [0.07, 0.08, 0.04], "bone", 5, 8);
    groups.push({ joint: forearmJoint, mesh: forearm });
    const leg = createMesh<SkeletonPart>();
    addBone(leg, PIVOTS[legJoint], PIVOTS[shinJoint], 0.06, 0.08);
    groups.push({ joint: legJoint, mesh: leg });
    const shin = createMesh<SkeletonPart>();
    addBone(shin, PIVOTS[shinJoint], [side * 0.15, -0.88, 0], 0.05, 0.06);
    addEllipsoid(shin, [side * 0.15, -0.94, 0.07], [0.08, 0.05, 0.14], "bone", 5, 8);
    groups.push({ joint: shinJoint, mesh: shin });
  }
  return groups;
}

const skeletonGroups = createSkeletonGroups();

const SKULL_MATRIX: Matrix = [
  SKULL_SCALE,
  0,
  0,
  SKULL_OFFSET[0],
  0,
  SKULL_SCALE,
  0,
  SKULL_OFFSET[1],
  0,
  0,
  SKULL_SCALE,
  SKULL_OFFSET[2],
];

export function drawSkeleton(
  raster: Raster,
  placement: SkeletonPlacement,
  colors: SkullHeadColors,
): void {
  const modelMatrix = getModelMatrix(MODEL_CENTER, placement.rotate);
  const rotateMatrix = getMatrix(placement.rotate);
  const jointMatrices = getJointMatrices(JOINT_PARENTS, PIVOTS, placement.pose ?? {});
  const flash = placement.flash ?? 0;
  for (const { joint, mesh } of skeletonGroups) {
    const jointMatrix = jointMatrices.get(joint) ?? IDENTITY_MATRIX;
    drawMesh(raster, mesh, {
      project: getProjector(multiplyMatrices(modelMatrix, jointMatrix), placement),
      getShade: getNormalShader(multiplyMatrices(rotateMatrix, getLinearMatrix(jointMatrix))),
      getColor: (part, _vector, shade) =>
        mix(scale(colors.bone, part === "joint" ? shade * 0.85 : shade), WHITE, flash),
    });
  }
  const head = jointMatrices.get("head");
  if (head) {
    drawSkullHead(
      raster,
      placement,
      multiplyMatrices(modelMatrix, head, SKULL_MATRIX),
      multiplyMatrices(rotateMatrix, getLinearMatrix(head)),
      colors,
      placement,
    );
  }
}
