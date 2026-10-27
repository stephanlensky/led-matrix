import { parseColor } from "../color.ts";
import type { Color } from "../frame.ts";
import {
  type Mesh,
  type Raster,
  type Rotation,
  type Vector,
  addEllipsoid,
  createMesh,
  drawMesh,
  subtract,
} from "../mesh.ts";
import { getShade, mix, scale } from "./cat-model.ts";

type HunterPart = "skin" | "eye" | "hair" | "top" | "sleeve" | "arm" | "bottoms" | "leg" | "shoe";

type Outfit = (part: HunterPart, position: Vector) => Color;

type HairStyle = "bob" | "braid" | "ponytail";

export type HunterJoint =
  | "torso"
  | "head"
  | "hair"
  | "leftArm"
  | "rightArm"
  | "leftLeg"
  | "rightLeg";

export type HunterPose = Partial<Record<HunterJoint, Rotation>>;

export type ModelPlacement = {
  x: number;
  y: number;
  size: number;
  rotate: Rotation;
  depth?: number;
};

export type HunterPlacement = ModelPlacement & { pose?: HunterPose };

type HunterGroup = { joint?: HunterJoint; mesh: Mesh<HunterPart> };

type HunterModel = { pivots: Record<HunterJoint, Vector>; groups: HunterGroup[] };

export type JointTransform = { position: Rotation; normal: Rotation };

const CAMERA_DISTANCE = 6;
const MODEL_CENTER: Vector = [0, 0.4, 0];

const JOINT_PARENTS: readonly [joint: HunterJoint, parent?: HunterJoint][] = [
  ["torso"],
  ["head", "torso"],
  ["hair", "head"],
  ["leftArm", "torso"],
  ["rightArm", "torso"],
  ["leftLeg"],
  ["rightLeg"],
];

const HAIR_PIVOTS: Readonly<Record<HairStyle, Vector>> = {
  bob: [0, 1.35, -0.45],
  braid: [0, 1.0, -0.42],
  ponytail: [0, 1.62, -0.25],
};

const SIDES = [
  [-1, "leftArm", "leftLeg"],
  [1, "rightArm", "rightLeg"],
] as const;

function addHairChain(
  mesh: Mesh<HunterPart>,
  getPoint: (t: number) => Vector,
  getRadius: (t: number) => number,
  segments: number,
  braid: boolean,
): void {
  for (let index = 0; index <= segments; index++) {
    const t = index / segments;
    const [x, y, z] = getPoint(t);
    const radius = getRadius(t);
    const offset = braid ? (index % 2 === 0 ? -1 : 1) * radius * 0.35 : 0;
    addEllipsoid(mesh, [x + offset, y, z], [radius, radius * 1.1, radius], "hair", 5, 8);
  }
}

function addHair(head: Mesh<HunterPart>, hair: Mesh<HunterPart>, style: HairStyle): void {
  addEllipsoid(head, [0, 1.15, -0.07], [0.53, 0.47, 0.46], "hair");
  if (style === "bob") {
    addEllipsoid(head, [0, 1.36, 0.28], [0.44, 0.14, 0.2], "hair", 6, 10);
    for (const side of [-1, 1]) {
      addEllipsoid(head, [side * 0.42, 0.95, -0.04], [0.16, 0.32, 0.34], "hair", 6, 10);
    }
    addEllipsoid(hair, [0, 1.38, -0.5], [0.2, 0.2, 0.18], "hair", 6, 10);
  } else if (style === "braid") {
    addEllipsoid(head, [0, 1.52, -0.1], [0.32, 0.15, 0.32], "hair", 6, 10);
    addHairChain(
      hair,
      (t) => [0, 1.0 - 1.3 * t, -0.42 - 0.08 * Math.sin(t * Math.PI)],
      (t) => 0.14 - 0.05 * t,
      9,
      true,
    );
  } else {
    addEllipsoid(head, [0, 1.62, -0.2], [0.18, 0.14, 0.18], "hair", 6, 10);
    addHairChain(
      hair,
      (t) => [
        0,
        1.64 - 1.85 * t ** 1.2,
        -0.3 - 0.35 * Math.sin(Math.min(1, t * 2) * Math.PI * 0.5),
      ],
      (t) => 0.21 - 0.1 * t,
      12,
      false,
    );
  }
}

function createHunterModel(style: HairStyle, baggy: boolean, skirt: boolean): HunterModel {
  const hips = createMesh<HunterPart>();
  addEllipsoid(
    hips,
    skirt ? [0, -0.02, 0] : [0, 0, 0],
    skirt ? [0.36, 0.22, 0.29] : [0.3, 0.2, 0.24],
    "bottoms",
  );
  const torso = createMesh<HunterPart>();
  addEllipsoid(torso, [0, 0.22, 0], [0.28, 0.18, 0.23], "skin");
  addEllipsoid(torso, [0, 0.44, 0], [0.33, 0.2, 0.25], "top");
  const head = createMesh<HunterPart>();
  addEllipsoid(head, [0, 1.05, 0.02], [0.5, 0.46, 0.46], "skin");
  const hair = createMesh<HunterPart>();
  addHair(head, hair, style);
  const groups: HunterGroup[] = [
    { mesh: hips },
    { joint: "torso", mesh: torso },
    { joint: "head", mesh: head },
    { joint: "hair", mesh: hair },
  ];
  const pivots: Record<HunterJoint, Vector> = {
    torso: [0, 0.1, 0],
    head: [0, 0.6, 0],
    hair: HAIR_PIVOTS[style],
    leftArm: [-0.33, 0.5, 0],
    rightArm: [0.33, 0.5, 0],
    leftLeg: [-0.15, -0.1, 0],
    rightLeg: [0.15, -0.1, 0],
  };
  const legRadius = baggy ? 0.18 : 0.14;
  for (const [side, armJoint, legJoint] of SIDES) {
    addEllipsoid(head, [side * 0.18, 1.04, 0.44], [0.09, 0.11, 0.04], "eye", 5, 8);
    const arm = createMesh<HunterPart>();
    addEllipsoid(arm, [side * 0.4, 0.38, 0], [0.12, 0.13, 0.12], "sleeve", 6, 8);
    addEllipsoid(arm, [side * 0.43, 0.18, 0], [0.11, 0.14, 0.11], "arm", 6, 8);
    addEllipsoid(arm, [side * 0.44, 0.02, 0], [0.1, 0.09, 0.1], "skin", 5, 8);
    groups.push({ joint: armJoint, mesh: arm });
    const leg = createMesh<HunterPart>();
    addEllipsoid(leg, [side * 0.15, -0.35, 0], [legRadius, 0.28, legRadius], "leg");
    addEllipsoid(leg, [side * 0.15, -0.62, 0.07], [0.15, 0.1, 0.21], "shoe", 6, 8);
    groups.push({ joint: legJoint, mesh: leg });
  }
  return { pivots, groups };
}

const SKIN = parseColor("#f0a882");
const EYE = parseColor("#180818");
const DARK = parseColor("#383848");
const YELLOW = parseColor("#f8c020");
const PINK = parseColor("#f03088");

function getLegSide(x: number): number {
  return x < 0 ? -1 : 1;
}

const ZOEY_OUTFIT: Outfit = (part, [x, y]) => {
  const pants = parseColor("#3848b8");
  const outfit: Record<HunterPart, Color> = {
    skin: SKIN,
    eye: EYE,
    hair: parseColor("#4a2a8a"),
    top: parseColor("#30e070"),
    sleeve: SKIN,
    arm: SKIN,
    bottoms: pants,
    leg: y < -0.4 && x * getLegSide(x) > 0.2 ? YELLOW : pants,
    shoe: y < -0.66 ? YELLOW : DARK,
  };
  return outfit[part];
};

const RUMI_OUTFIT: Outfit = (part, [x, y, z]) => {
  const outfit: Record<HunterPart, Color> = {
    skin: SKIN,
    eye: EYE,
    hair: parseColor("#9a78f0"),
    top: Math.abs(x) < 0.12 && z > 0.1 ? parseColor("#f4f0f0") : YELLOW,
    sleeve: YELLOW,
    arm: YELLOW,
    bottoms: y > 0.1 ? PINK : DARK,
    leg: y > -0.42 ? SKIN : z > 0.05 && Math.abs(x - getLegSide(x) * 0.15) < 0.035 ? PINK : DARK,
    shoe: DARK,
  };
  return outfit[part];
};

const MIRA_OUTFIT: Outfit = (part, [x, y, z]) => {
  const isPrint = z > 0.1 && Math.abs(x) < 0.18 && y > 0.36 && y < 0.56;
  const outfit: Record<HunterPart, Color> = {
    skin: SKIN,
    eye: EYE,
    hair: parseColor("#ff4898"),
    top: isPrint ? parseColor("#80c8ff") : DARK,
    sleeve: DARK,
    arm: SKIN,
    bottoms: YELLOW,
    leg: y > -0.22 ? SKIN : z > 0.05 && y > -0.48 && y < -0.34 ? PINK : DARK,
    shoe: DARK,
  };
  return outfit[part];
};

export const hunterIds = ["zoey", "rumi", "mira"] as const;

export type HunterId = (typeof hunterIds)[number];

const hunters: Readonly<Record<HunterId, { model: HunterModel; outfit: Outfit }>> = {
  zoey: { model: createHunterModel("bob", true, false), outfit: ZOEY_OUTFIT },
  rumi: { model: createHunterModel("braid", false, false), outfit: RUMI_OUTFIT },
  mira: { model: createHunterModel("ponytail", false, true), outfit: MIRA_OUTFIT },
};

export function getJointTransforms<J extends string>(
  parents: readonly (readonly [joint: J, parent?: J])[],
  pivots: Record<J, Vector>,
  pose: Partial<Record<J, Rotation>>,
): Map<J, JointTransform> {
  const transforms = new Map<J, JointTransform>();
  for (const [joint, parentJoint] of parents) {
    const parent = parentJoint ? transforms.get(parentJoint) : undefined;
    const parentPosition = parent?.position ?? ((vector: Vector) => vector);
    const parentNormal = parent?.normal ?? ((vector: Vector) => vector);
    const rotation = pose[joint] ?? ((vector: Vector) => vector);
    const origin = rotation([0, 0, 0]);
    const pivot = pivots[joint];
    transforms.set(joint, {
      position: (vector) => {
        const [x, y, z] = rotation(subtract(vector, pivot));
        return parentPosition([x + pivot[0], y + pivot[1], z + pivot[2]]);
      },
      normal: (vector) => parentNormal(subtract(rotation(vector), origin)),
    });
  }
  return transforms;
}

export function getModelProjector(
  center: Vector,
  { x: centerX, y: centerY, size, rotate, depth: depthOffset = 0 }: ModelPlacement,
): (vector: Vector) => Vector {
  return (vector) => {
    const [x, y, depth] = rotate(subtract(vector, center));
    const perspective = CAMERA_DISTANCE / (CAMERA_DISTANCE - depth);
    return [
      centerX + size * x * perspective,
      centerY - size * y * perspective,
      depth + depthOffset,
    ];
  };
}

export function drawHunter(
  raster: Raster,
  hunter: HunterId,
  placement: HunterPlacement,
  flash = 0,
): void {
  const { model, outfit } = hunters[hunter];
  const project = getModelProjector(MODEL_CENTER, placement);
  const transforms = getJointTransforms(JOINT_PARENTS, model.pivots, placement.pose ?? {});
  for (const { joint, mesh } of model.groups) {
    const transform = joint ? transforms.get(joint) : undefined;
    const position = transform?.position ?? ((vector: Vector) => vector);
    const normal = transform?.normal ?? ((vector: Vector) => vector);
    drawMesh(raster, mesh, {
      project: (vector) => project(position(vector)),
      getShade: (vector) => getShade(placement.rotate(normal(vector))),
      getColor: (part, vector, shade) => {
        const color = outfit(part, vector);
        return mix(part === "eye" ? color : scale(color, shade), [255, 255, 255], flash);
      },
    });
  }
}
