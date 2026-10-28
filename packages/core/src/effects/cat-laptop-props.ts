import type { Color } from "../frame.ts";
import { type Raster, type Vector, addBox, createMesh, drawMesh, getRotation } from "../mesh.ts";
import { type CatPlacement, getCatProjector, getShade, mix, scale } from "./cat-model.ts";

type LaptopPart = "case" | "keys" | "pad" | "bezel" | "screen";

export type LaptopScreen = (u: number, v: number) => Color;

export type Laptop = {
  getScreenColor: LaptopScreen;
  lid?: number;
  color?: Color;
};

const BASE_HALF: Vector = [0.85, 0.04, 0.55];
const LID_HALF: Vector = [0.85, 0.56, 0.03];
const SCREEN_HALF: Vector = [0.77, 0.48, 0.01];
const HINGE: Vector = [0, BASE_HALF[1] * 2, -BASE_HALF[2]];
const LAPTOP_COLOR: Color = [176, 180, 192];
const KEYS: Color = [44, 46, 54];
const BEZEL: Color = [16, 16, 20];

function createBaseMesh() {
  const mesh = createMesh<LaptopPart>();
  addBox(mesh, [0, BASE_HALF[1], 0], BASE_HALF, "case");
  addBox(mesh, [0, BASE_HALF[1] * 2, -0.12], [0.72, 0.005, 0.3], "keys");
  addBox(mesh, [0, BASE_HALF[1] * 2, 0.37], [0.24, 0.005, 0.12], "pad");
  return mesh;
}

function createLidMesh() {
  const mesh = createMesh<LaptopPart>();
  addBox(mesh, [0, LID_HALF[1], -LID_HALF[2]], LID_HALF, "case");
  addBox(mesh, [0, LID_HALF[1], 0.002], [LID_HALF[0] - 0.02, LID_HALF[1] - 0.02, 0.004], "bezel");
  addBox(mesh, [0, LID_HALF[1] + 0.03, 0.008], SCREEN_HALF, "screen");
  return mesh;
}

const baseMesh = createBaseMesh();
const lidMesh = createLidMesh();

function getLidRotation(lid: number) {
  const tilt = getRotation(-lid, 0, 0);
  return (vector: Vector): Vector => {
    const [x, y, z] = tilt(vector);
    return [x + HINGE[0], y + HINGE[1], z + HINGE[2]];
  };
}

export function getLaptopScreenPoint(u: number, v: number, lid = 0.25): Vector {
  return getLidRotation(lid)([
    (u * 2 - 1) * SCREEN_HALF[0],
    LID_HALF[1] + 0.03 + (v * 2 - 1) * SCREEN_HALF[1],
    0.02,
  ]);
}

export function drawLaptop(
  raster: Raster,
  placement: CatPlacement,
  { getScreenColor, lid = 0.25, color = LAPTOP_COLOR }: Laptop,
): void {
  const project = getCatProjector(placement);
  const getColor = (part: LaptopPart, [x, y]: Vector, shade: number): Color => {
    if (part === "screen") {
      return getScreenColor(
        (x / SCREEN_HALF[0] + 1) / 2,
        ((y - LID_HALF[1] - 0.03) / SCREEN_HALF[1] + 1) / 2,
      );
    }
    if (part === "keys") {
      return scale(KEYS, shade);
    }
    if (part === "bezel") {
      return BEZEL;
    }
    if (part === "pad") {
      return scale(mix(color, KEYS, 0.3), shade);
    }
    return scale(color, shade);
  };
  drawMesh(raster, baseMesh, {
    project,
    getShade: (normal) => getShade(placement.rotate(normal)),
    getColor,
  });
  const tilt = getRotation(-lid, 0, 0);
  const transform = getLidRotation(lid);
  drawMesh(raster, lidMesh, {
    project: (vector) => project(transform(vector)),
    getShade: (normal) => getShade(placement.rotate(tilt(normal))),
    getColor,
  });
}

export function getEqualizerScreen(
  levels: readonly number[],
  glow: Color,
  bar: Color,
  peak: Color,
): LaptopScreen {
  return (u, v) => {
    const background = scale(glow, 0.35 + 0.25 * (1 - v));
    const slot = u * levels.length;
    const index = Math.floor(slot);
    const inBar = Math.abs(slot - index - 0.5) < 0.32;
    const level = levels[index] ?? 0;
    if (!inBar || v < 0.1 || v > 0.1 + 0.8 * level) {
      return background;
    }
    return mix(bar, peak, (v - 0.1) / 0.8);
  };
}
