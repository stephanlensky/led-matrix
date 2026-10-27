import type { Color } from "../frame.ts";
import {
  type Mesh,
  type Raster,
  type Rotation,
  type Vector,
  addEllipsoid,
  createMesh,
  drawMesh,
  getRotation,
  subtract,
} from "../mesh.ts";
import { getShade, mix, scale } from "./cat-model.ts";
import { type ModelPlacement, getModelProjector } from "./hunter-model.ts";

type SkullPart = "bone" | "jaw";
type TrumpetPart = "brass" | "valve" | "bell";

export type SkullColors = { bone: Color; brass: Color; eye: Color };

export type SkullHeadColors = Pick<SkullColors, "bone" | "eye">;

export type SkullHeadOptions = { jaw?: number; glow?: number; flash?: number };

export type SkullPlacement = ModelPlacement & {
  jaw?: number;
  flare?: number;
  glow?: number;
  flash?: number;
};

const MODEL_CENTER: Vector = [0, 0.05, 0.6];
const JAW_PIVOT: Vector = [0, -0.12, 0.02];
const MOUTH: Vector = [0, -0.24, 0.5];
const TRUMPET_ROTATION = getRotation(0.18, 0, 0);
const BELL_START = 1.5;
const BELL_END = 2.05;
const BELL_RADIUS = 0.3;
const WHITE: Color = [255, 255, 255];
const SOCKET: Color = [10, 6, 4];

function addTube(
  mesh: Mesh<TrumpetPart>,
  from: Vector,
  to: Vector,
  radius: number,
  part: TrumpetPart,
): void {
  const length = Math.hypot(...subtract(to, from));
  const steps = Math.max(1, Math.ceil(length / (radius * 1.5)));
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    addEllipsoid(
      mesh,
      [
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t,
        from[2] + (to[2] - from[2]) * t,
      ],
      [radius, radius, radius],
      part,
      4,
      8,
    );
  }
}

function addBend(mesh: Mesh<TrumpetPart>, z: number, direction: number, radius: number): void {
  const steps = 6;
  for (let step = 0; step <= steps; step++) {
    const angle = (step / steps) * Math.PI;
    addEllipsoid(
      mesh,
      [0, -0.11 + 0.11 * Math.cos(angle), z + direction * 0.11 * Math.sin(angle)],
      [radius, radius, radius],
      "brass",
      4,
      8,
    );
  }
}

function getBellRadius(t: number): number {
  return 0.045 + (BELL_RADIUS - 0.045) * t ** 3;
}

function createTrumpet(): Mesh<TrumpetPart> {
  const mesh = createMesh<TrumpetPart>();
  const radius = 0.045;
  addEllipsoid(mesh, [0, 0, 0.02], [0.07, 0.07, 0.08], "brass", 5, 8);
  addTube(mesh, [0, 0, 0.08], [0, 0, BELL_START], radius, "brass");
  addTube(mesh, [0, -0.22, 0.5], [0, -0.22, 1.15], radius, "brass");
  addBend(mesh, 0.5, -1, radius);
  addBend(mesh, 1.15, 1, radius);
  for (const z of [0.68, 0.83, 0.98]) {
    addEllipsoid(mesh, [0, -0.08, z], [0.055, 0.17, 0.055], "valve", 5, 8);
    addEllipsoid(mesh, [0, 0.13, z], [0.05, 0.03, 0.05], "brass", 4, 8);
  }
  const discs = 14;
  for (let disc = 0; disc <= discs; disc++) {
    const t = disc / discs;
    const bellRadius = getBellRadius(t);
    addEllipsoid(
      mesh,
      [0, 0, BELL_START + (BELL_END - BELL_START) * t],
      [bellRadius, bellRadius, 0.04],
      "bell",
      4,
      20,
    );
  }
  return mesh;
}

function createSkull(): [skull: Mesh<SkullPart>, jaw: Mesh<SkullPart>] {
  const skull = createMesh<SkullPart>();
  addEllipsoid(skull, [0, 0.3, -0.05], [0.5, 0.48, 0.58], "bone", 10, 14);
  addEllipsoid(skull, [0, -0.06, 0.26], [0.38, 0.3, 0.32], "bone", 8, 12);
  for (const side of [-1, 1]) {
    addEllipsoid(skull, [side * 0.3, -0.02, 0.3], [0.13, 0.11, 0.14], "bone", 5, 8);
  }
  const jaw = createMesh<SkullPart>();
  addEllipsoid(jaw, [0, -0.33, 0.27], [0.29, 0.11, 0.27], "jaw", 6, 12);
  return [skull, jaw];
}

const trumpetMesh = createTrumpet();
const [skullMesh, jawMesh] = createSkull();

function isSocket([x, y, z]: Vector): boolean {
  if (z < 0.2) {
    return false;
  }
  const eye = Math.hypot((Math.abs(x) - 0.19) / 0.14, (y - 0.1) / 0.13) < 1;
  const noseHeight = (y + 0.02) / 0.15;
  const nose = noseHeight <= 0 && noseHeight >= -1 && Math.abs(x) < 0.07 * (1 + noseHeight * 0.6);
  return eye || nose;
}

function isEye([x, y, z]: Vector): boolean {
  return z > 0.2 && Math.hypot((Math.abs(x) - 0.19) / 0.06, (y - 0.08) / 0.06) < 1;
}

function isToothGap([x, y, z]: Vector, top: number, bottom: number): boolean {
  if (z < 0.35 || y > top || y < bottom) {
    return false;
  }
  return Math.abs(((x * 11 + 0.5) % 1) - 0.5) < 0.12 || y > top - 0.02 || y < bottom + 0.02;
}

function getBoneColor(
  position: Vector,
  shade: number,
  colors: SkullHeadColors,
  glow: number,
): Color {
  if (isEye(position) && glow > 0) {
    return mix(SOCKET, colors.eye, glow);
  }
  if (isSocket(position) || isToothGap(position, -0.2, -0.32)) {
    return SOCKET;
  }
  return scale(colors.bone, shade);
}

function getBrassColor(part: TrumpetPart, [x, y, z]: Vector, shade: number, brass: Color): Color {
  if (part === "bell" && z > BELL_END - 0.03 && Math.hypot(x, y) < BELL_RADIUS * 0.75) {
    return scale(brass, 0.3);
  }
  const base = scale(brass, part === "valve" ? shade * 0.8 : shade);
  return mix(base, WHITE, Math.min(0.6, Math.max(0, shade - 1.05) * 1.5));
}

function getJawRotation(open: number): Rotation {
  const rotation = getRotation(open * 0.35, 0, 0);
  return (vector) => {
    const [x, y, z] = rotation(subtract(vector, JAW_PIVOT));
    return [x + JAW_PIVOT[0], y + JAW_PIVOT[1], z + JAW_PIVOT[2]];
  };
}

function getFlare(flare: number): Rotation {
  return ([x, y, z]) => {
    const t = Math.min(1, Math.max(0, (z - BELL_START) / (BELL_END - BELL_START)));
    const amount = 1 + flare * t ** 2;
    return [x * amount, y * amount, z + flare * 0.15 * t];
  };
}

export function getBellPoint(placement: SkullPlacement, ahead = 0): Vector {
  const project = getModelProjector(MODEL_CENTER, placement);
  const [x, y, z] = TRUMPET_ROTATION([0, 0, BELL_END + ahead]);
  return project([x + MOUTH[0], y + MOUTH[1], z + MOUTH[2]]);
}

export function drawSkullHead(
  raster: Raster,
  project: (vector: Vector) => Vector,
  getNormalShade: (normal: Vector) => number,
  colors: SkullHeadColors,
  { jaw = 0, glow = 0, flash = 0 }: SkullHeadOptions = {},
): void {
  const jawRotation = getJawRotation(jaw);
  for (const [mesh, transform] of [
    [skullMesh, (vector: Vector) => vector],
    [jawMesh, jawRotation],
  ] as const) {
    drawMesh(raster, mesh, {
      project: (vector) => project(transform(vector)),
      getShade: getNormalShade,
      getColor: (_part, position, shade) =>
        mix(getBoneColor(position, shade, colors, glow), WHITE, flash),
    });
  }
}

export function drawSkull(raster: Raster, placement: SkullPlacement, colors: SkullColors): void {
  const project = getModelProjector(MODEL_CENTER, placement);
  const flare = getFlare(placement.flare ?? 0);
  const getNormalShade = (normal: Vector) => getShade(placement.rotate(normal));
  drawSkullHead(raster, project, getNormalShade, colors, placement);
  drawMesh(raster, trumpetMesh, {
    project: (vector) => {
      const [x, y, z] = TRUMPET_ROTATION(flare(vector));
      return project([x + MOUTH[0], y + MOUTH[1], z + MOUTH[2]]);
    },
    getShade: (normal) => getNormalShade(TRUMPET_ROTATION(normal)),
    getColor: (part, position, shade) => getBrassColor(part, position, shade, colors.brass),
  });
}
