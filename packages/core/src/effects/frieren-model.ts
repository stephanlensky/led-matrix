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
} from "../mesh.ts";
import { getShade, mix, scale } from "./cat-model.ts";
import { type ModelPlacement, getJointTransforms, getModelProjector } from "./hunter-model.ts";

type HeroPart =
  | "skin"
  | "eye"
  | "hair"
  | "top"
  | "capelet"
  | "skirt"
  | "sleeve"
  | "forearm"
  | "leg"
  | "shin"
  | "shoe"
  | "cape";

export type PropPart =
  | "metal"
  | "plate"
  | "smallPlate"
  | "wood"
  | "darkWood"
  | "cushion"
  | "sheet"
  | "pillow"
  | "blanket"
  | "blanketTrim"
  | "chest"
  | "chestTrim"
  | "mouth"
  | "tooth"
  | "tongue"
  | "silverHair";

type Outfit = (part: HeroPart, position: Vector) => Color;

export type HeroJoint =
  | "hips"
  | "skirt"
  | "torso"
  | "head"
  | "hair"
  | "cape"
  | "leftArm"
  | "leftForearm"
  | "rightArm"
  | "rightForearm"
  | "leftLeg"
  | "leftShin"
  | "rightLeg"
  | "rightShin";

export type HeroPose = Partial<Record<HeroJoint, Rotation>>;

export type HeroAttachment = { joint: HeroJoint; mesh: Mesh<PropPart> };

export type HeroEyes = "open" | "closed" | "hidden";

export type HeroPlacement = ModelPlacement & {
  pose?: HeroPose;
  orient?: Rotation;
  offset?: Vector;
  eyes?: HeroEyes;
  attachments?: readonly HeroAttachment[];
  hidden?: readonly HeroJoint[];
  flash?: number;
};

type HeroGroup = { joint?: HeroJoint; mesh: Mesh<HeroPart> };

type HeroModel = { pivots: Record<HeroJoint, Vector>; groups: HeroGroup[] };

type HeroStyle = "frieren" | "himmel";

export const HERO_CENTER: Vector = [0, 0.4, 0];

const JOINT_PARENTS: readonly [joint: HeroJoint, parent?: HeroJoint][] = [
  ["hips"],
  ["torso"],
  ["skirt", "torso"],
  ["head", "torso"],
  ["hair", "head"],
  ["cape", "torso"],
  ["leftArm", "torso"],
  ["leftForearm", "leftArm"],
  ["rightArm", "torso"],
  ["rightForearm", "rightArm"],
  ["leftLeg"],
  ["leftShin", "leftLeg"],
  ["rightLeg"],
  ["rightShin", "rightLeg"],
];

const SIDES = [
  [-1, "leftArm", "leftForearm", "leftLeg", "leftShin"],
  [1, "rightArm", "rightForearm", "rightLeg", "rightShin"],
] as const;

export const SHOULDER: Vector = [0.33, 0.52, 0];
export const ELBOW: Vector = [0.42, 0.26, 0];
export const HIP: Vector = [0.15, -0.1, 0];
export const KNEE: Vector = [0.15, -0.37, 0];
export const ANKLE_Y = -0.6;
export const SOLE_Y = -0.72;

function addChain(
  mesh: Mesh<HeroPart>,
  getPoint: (t: number) => Vector,
  getRadius: (t: number) => number,
  segments: number,
  part: HeroPart,
): void {
  for (let index = 0; index <= segments; index++) {
    const t = index / segments;
    const radius = getRadius(t);
    addEllipsoid(mesh, getPoint(t), [radius, radius * 1.15, radius], part, 5, 8);
  }
}

function addFrierenHair(head: Mesh<HeroPart>, hair: Mesh<HeroPart>): void {
  addEllipsoid(head, [0, 1.15, -0.07], [0.53, 0.47, 0.46], "hair");
  addEllipsoid(head, [0, 1.34, 0.28], [0.44, 0.15, 0.2], "hair", 6, 10);
  for (const side of [-1, 1]) {
    addEllipsoid(head, [side * 0.38, 0.92, 0.12], [0.12, 0.3, 0.22], "hair", 6, 10);
    addEllipsoid(head, [side * 0.36, 1.38, -0.12], [0.13, 0.11, 0.13], "hair", 5, 8);
    addChain(
      head,
      (t) => [side * (0.48 + 0.3 * t), 1.0 + 0.16 * t, 0.02 - 0.06 * t],
      (t) => 0.08 - 0.055 * t,
      4,
      "skin",
    );
    addChain(
      hair,
      (t) => [
        side * (0.42 + 0.22 * Math.sin(Math.min(1, t * 2.5) * Math.PI * 0.5)),
        1.36 - 1.42 * t,
        -0.16 - 0.1 * Math.sin(t * Math.PI),
      ],
      (t) => 0.13 - 0.06 * t,
      12,
      "hair",
    );
  }
}

function addHimmelHair(head: Mesh<HeroPart>, hair: Mesh<HeroPart>): void {
  addEllipsoid(head, [0, 1.17, -0.05], [0.54, 0.48, 0.47], "hair");
  addEllipsoid(head, [0, 1.33, 0.29], [0.46, 0.17, 0.2], "hair", 6, 10);
  for (const side of [-1, 1]) {
    addEllipsoid(head, [side * 0.42, 0.98, 0.02], [0.14, 0.28, 0.3], "hair", 6, 10);
    addEllipsoid(head, [side * 0.2, 1.3, 0.38], [0.14, 0.14, 0.1], "hair", 5, 8);
  }
  addEllipsoid(hair, [0, 0.98, -0.36], [0.32, 0.26, 0.16], "hair", 6, 10);
}

function createHeroModel(style: HeroStyle, eyes: HeroEyes): HeroModel {
  const isFrieren = style === "frieren";
  const hips = createMesh<HeroPart>();
  addEllipsoid(hips, [0, 0, 0], [0.3, 0.2, 0.24], "leg");
  const torso = createMesh<HeroPart>();
  addEllipsoid(torso, [0, 0.22, 0], [0.28, 0.18, 0.23], "top");
  addEllipsoid(torso, [0, 0.44, 0], [0.33, 0.2, 0.25], "top");
  addEllipsoid(torso, [0, 0.62, 0], [0.13, 0.07, 0.13], "capelet", 5, 8);
  const skirt = createMesh<HeroPart>();
  if (isFrieren) {
    addEllipsoid(skirt, [0, 0.02, 0], [0.37, 0.3, 0.31], "skirt");
    addEllipsoid(torso, [0, 0.47, 0], [0.4, 0.17, 0.31], "capelet");
  } else {
    addEllipsoid(skirt, [0, 0.06, 0], [0.34, 0.24, 0.28], "skirt");
  }
  const head = createMesh<HeroPart>();
  addEllipsoid(head, [0, 1.05, 0.02], [0.5, 0.46, 0.46], "skin");
  const hair = createMesh<HeroPart>();
  if (isFrieren) {
    addFrierenHair(head, hair);
  } else {
    addHimmelHair(head, hair);
  }
  const cape = createMesh<HeroPart>();
  if (!isFrieren) {
    addEllipsoid(cape, [0, 0.54, -0.04], [0.42, 0.13, 0.31], "cape");
    addEllipsoid(cape, [0, 0.12, -0.3], [0.44, 0.52, 0.09], "cape");
  }
  const groups: HeroGroup[] = [
    { joint: "hips", mesh: hips },
    { joint: "torso", mesh: torso },
    { joint: "skirt", mesh: skirt },
    { joint: "head", mesh: head },
    { joint: "hair", mesh: hair },
    { joint: "cape", mesh: cape },
  ];
  const pivots: Record<HeroJoint, Vector> = {
    hips: [0, 0, 0],
    skirt: [0, 0, 0],
    torso: [0, 0.1, 0],
    head: [0, 0.6, 0],
    hair: isFrieren ? [0, 1.38, -0.14] : [0, 1.2, -0.38],
    cape: [0, 0.6, -0.22],
    leftArm: [-SHOULDER[0], SHOULDER[1], 0],
    leftForearm: [-ELBOW[0], ELBOW[1], 0],
    rightArm: SHOULDER,
    rightForearm: ELBOW,
    leftLeg: [-HIP[0], HIP[1], 0],
    leftShin: [-KNEE[0], KNEE[1], 0],
    rightLeg: HIP,
    rightShin: KNEE,
  };
  for (const [side, armJoint, forearmJoint, legJoint, shinJoint] of SIDES) {
    if (eyes === "closed") {
      addEllipsoid(head, [side * 0.18, 1.0, 0.45], [0.1, 0.03, 0.03], "eye", 4, 8);
    } else if (eyes === "open") {
      addEllipsoid(head, [side * 0.18, 1.04, 0.44], [0.09, 0.11, 0.04], "eye", 5, 8);
    }
    const arm = createMesh<HeroPart>();
    addEllipsoid(arm, [side * 0.4, 0.38, 0], [0.12, 0.15, 0.12], "sleeve", 6, 8);
    groups.push({ joint: armJoint, mesh: arm });
    const forearm = createMesh<HeroPart>();
    addEllipsoid(forearm, [side * 0.43, 0.15, 0], [0.11, 0.13, 0.11], "forearm", 6, 8);
    addEllipsoid(forearm, [side * 0.44, 0.02, 0], [0.1, 0.09, 0.1], "skin", 5, 8);
    groups.push({ joint: forearmJoint, mesh: forearm });
    const leg = createMesh<HeroPart>();
    addEllipsoid(leg, [side * HIP[0], -0.23, 0], [0.14, 0.17, 0.14], "leg", 6, 8);
    groups.push({ joint: legJoint, mesh: leg });
    const shin = createMesh<HeroPart>();
    addEllipsoid(shin, [side * KNEE[0], -0.48, 0], [0.13, 0.16, 0.13], "shin", 6, 8);
    addEllipsoid(shin, [side * KNEE[0], -0.63, 0.07], [0.15, 0.09, 0.2], "shoe", 6, 8);
    groups.push({ joint: shinJoint, mesh: shin });
  }
  return { pivots, groups };
}

const SKIN = parseColor("#f6c2a0");
const GOLD = parseColor("#d8a838");

function getHemColor(x: number, y: number, z: number, hem: Color, inside: Color): Color {
  return Math.hypot(x / 0.37, z / 0.31) > 0.62 ? hem : inside;
}

const FRIEREN_OUTFIT: Outfit = (part, [x, y, z]) => {
  const white = parseColor("#f4f2ee");
  const tights = parseColor("#3c4060");
  const boot = parseColor("#8a6440");
  const outfit: Record<HeroPart, Color> = {
    skin: SKIN,
    eye: parseColor("#1e7860"),
    hair: parseColor("#e4e0f4"),
    top: y > 0.5 ? parseColor("#303038") : white,
    capelet: y < 0.36 || y > 0.6 ? GOLD : white,
    skirt: y < -0.18 ? getHemColor(x, y, z, GOLD, parseColor("#7a7c94")) : white,
    sleeve: white,
    forearm: y < 0.08 ? GOLD : white,
    leg: tights,
    shin: y < -0.4 ? boot : tights,
    shoe: boot,
    cape: white,
  };
  return outfit[part];
};

const HIMMEL_OUTFIT: Outfit = (part, [x, y, z]) => {
  const blue = parseColor("#2c48b0");
  const white = parseColor("#eeeef4");
  const boot = parseColor("#262838");
  const isToggle = Math.abs(x) < 0.06 && z > 0.15 && y > 0.3;
  const outfit: Record<HeroPart, Color> = {
    skin: SKIN,
    eye: parseColor("#1c3c78"),
    hair: parseColor("#8cc0ec"),
    top: isToggle ? white : y > 0.22 && y < 0.28 ? white : blue,
    capelet: parseColor("#a8a8b8"),
    skirt: y < -0.12 ? white : blue,
    sleeve: blue,
    forearm: y < 0.08 ? white : blue,
    leg: white,
    shin: y < -0.42 ? boot : white,
    shoe: boot,
    cape: parseColor("#e6dcc0"),
  };
  return outfit[part];
};

export const PROP_COLORS: Readonly<Record<PropPart, Color>> = {
  metal: parseColor("#b8bcc8"),
  plate: parseColor("#d83838"),
  smallPlate: parseColor("#f0c030"),
  wood: parseColor("#a06a3a"),
  darkWood: parseColor("#5c3820"),
  cushion: parseColor("#8a2c40"),
  sheet: parseColor("#f0ece4"),
  pillow: parseColor("#fafaf6"),
  blanket: parseColor("#3858b8"),
  blanketTrim: parseColor("#e8d8a8"),
  chest: parseColor("#b03a28"),
  chestTrim: parseColor("#d8b050"),
  mouth: parseColor("#4a0c14"),
  tooth: parseColor("#f4ecd8"),
  tongue: parseColor("#c83c50"),
  silverHair: parseColor("#e4e0f4"),
};

export const heroIds = ["frieren", "himmel"] as const;

export type HeroId = (typeof heroIds)[number];

const outfits: Readonly<Record<HeroId, Outfit>> = {
  frieren: FRIEREN_OUTFIT,
  himmel: HIMMEL_OUTFIT,
};

const models = new Map<string, HeroModel>();

function getHeroModel(hero: HeroId, eyes: HeroEyes): HeroModel {
  const key = `${hero}:${eyes}`;
  const cached = models.get(key);
  if (cached) {
    return cached;
  }
  const model = createHeroModel(hero, eyes);
  models.set(key, model);
  return model;
}

function identity(vector: Vector): Vector {
  return vector;
}

function getSceneTransform(placement: HeroPlacement): {
  position: Rotation;
  normal: Rotation;
} {
  const orient = placement.orient ?? identity;
  const [ox, oy, oz] = placement.offset ?? [0, 0, 0];
  return {
    position: (vector) => {
      const [x, y, z] = orient(vector);
      return [x + ox, y + oy, z + oz];
    },
    normal: (vector) => placement.rotate(orient(vector)),
  };
}

export function drawProp(
  raster: Raster,
  mesh: Mesh<PropPart>,
  placement: ModelPlacement,
  flash = 0,
  orient: Rotation = identity,
  offset: Vector = [0, 0, 0],
): void {
  const project = getModelProjector(HERO_CENTER, placement);
  const scene = getSceneTransform({ ...placement, orient, offset });
  drawMesh(raster, mesh, {
    project: (vector) => project(scene.position(vector)),
    getShade: (vector) => getShade(scene.normal(vector)),
    getColor: (part, _vector, shade) =>
      mix(scale(PROP_COLORS[part], shade), [255, 255, 255], flash),
  });
}

export function getHeroPoint(
  hero: HeroId,
  placement: HeroPlacement,
  point: Vector,
  joint?: HeroJoint,
): Vector {
  const model = getHeroModel(hero, placement.eyes ?? "open");
  const transforms = getJointTransforms(JOINT_PARENTS, model.pivots, placement.pose ?? {});
  const position = (joint ? transforms.get(joint)?.position : undefined) ?? identity;
  const project = getModelProjector(HERO_CENTER, placement);
  return project(getSceneTransform(placement).position(position(point)));
}

export function drawHero(raster: Raster, hero: HeroId, placement: HeroPlacement): void {
  const model = getHeroModel(hero, placement.eyes ?? "open");
  const outfit = outfits[hero];
  const flash = placement.flash ?? 0;
  const project = getModelProjector(HERO_CENTER, placement);
  const scene = getSceneTransform(placement);
  const transforms = getJointTransforms(JOINT_PARENTS, model.pivots, placement.pose ?? {});
  const getTransform = (joint?: HeroJoint) => {
    const transform = joint ? transforms.get(joint) : undefined;
    return {
      position: transform?.position ?? identity,
      normal: transform?.normal ?? identity,
    };
  };
  for (const { joint, mesh } of model.groups) {
    if (joint && placement.hidden?.includes(joint)) {
      continue;
    }
    const { position, normal } = getTransform(joint);
    drawMesh(raster, mesh, {
      project: (vector) => project(scene.position(position(vector))),
      getShade: (vector) => getShade(scene.normal(normal(vector))),
      getColor: (part, vector, shade) => {
        const color = outfit(part, vector);
        return mix(part === "eye" ? color : scale(color, shade), [255, 255, 255], flash);
      },
    });
  }
  for (const { joint, mesh } of placement.attachments ?? []) {
    const { position, normal } = getTransform(joint);
    drawMesh(raster, mesh, {
      project: (vector) => project(scene.position(position(vector))),
      getShade: (vector) => getShade(scene.normal(normal(vector))),
      getColor: (part, _vector, shade) =>
        mix(scale(PROP_COLORS[part], shade), [255, 255, 255], flash),
    });
  }
}
