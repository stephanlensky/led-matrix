import type { Color } from "../frame.ts";
import { isInsideHeart } from "./heart.ts";
import {
  type Raster,
  type Vector,
  addBox,
  createMesh,
  drawMesh,
  getMatrix,
  getRotation,
  getTranslationMatrix,
  multiplyMatrices,
  type ColorBuffer,
} from "../mesh.ts";
import {
  type CatPlacement,
  getCatProjector,
  getNormalShader,
  mix,
  scale,
  WHITE,
  setMixedColor,
  setScaledColor,
} from "./cat-model.ts";

type LaptopPart = "case" | "keys" | "pad" | "bezel" | "screen";

export type LaptopScreen = (u: number, v: number) => Color;

export type Laptop = {
  getScreenColor: LaptopScreen;
  lid?: number;
  color?: Color;
  logo?: Color;
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
  { getScreenColor, lid = 0.25, color = LAPTOP_COLOR, logo }: Laptop,
): void {
  const pad = mix(color, KEYS, 0.3);
  const getColor = (
    part: LaptopPart,
    [x, y, z]: Vector,
    shade: number,
    out: ColorBuffer,
  ): Color => {
    if (logo && part === "case" && y > BASE_HALF[1] * 3 && z < -LID_HALF[2] * 1.5) {
      const logoX = x / (LID_HALF[1] * 0.45);
      const logoY = (y - LID_HALF[1]) / (LID_HALF[1] * 0.45) + 0.12;
      if (isInsideHeart(logoX, logoY)) {
        return setMixedColor(out, logo, WHITE, 0.3 * Math.max(0, logoY - 0.4));
      }
    }
    if (part === "screen") {
      return getScreenColor(
        (x / SCREEN_HALF[0] + 1) / 2,
        ((y - LID_HALF[1] - 0.03) / SCREEN_HALF[1] + 1) / 2,
      );
    }
    if (part === "keys") {
      return setScaledColor(out, KEYS, shade);
    }
    if (part === "bezel") {
      return BEZEL;
    }
    return setScaledColor(out, part === "pad" ? pad : color, shade);
  };
  const rotateMatrix = getMatrix(placement.rotate);
  drawMesh(raster, baseMesh, {
    project: getCatProjector(placement),
    getShade: getNormalShader(rotateMatrix),
    getColor,
  });
  const tilt = getMatrix(getRotation(-lid, 0, 0));
  drawMesh(raster, lidMesh, {
    project: getCatProjector(placement, multiplyMatrices(getTranslationMatrix(HINGE), tilt)),
    getShade: getNormalShader(multiplyMatrices(rotateMatrix, tilt)),
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

export function getHeartScreen(background: Color, heart: Color, kick: number): LaptopScreen {
  const size = 0.75 * (1 + 0.25 * kick);
  const aspect = SCREEN_HALF[0] / SCREEN_HALF[1];
  return (u, v) => {
    const x = ((u - 0.5) * 2 * aspect) / size;
    const y = ((v - 0.5) * 2) / size + 0.12;
    if (!isInsideHeart(x, y)) {
      return scale(background, 0.35 + 0.25 * (1 - v));
    }
    return mix(heart, [255, 255, 255], 0.15 + 0.35 * kick + 0.3 * Math.max(0, y - 0.6));
  };
}

export function getSplitHeartScreen(
  background: Color,
  left: Color,
  right: Color,
  kick: number,
): LaptopScreen {
  const getLeft = getHeartScreen(background, left, kick);
  const getRight = getHeartScreen(background, right, kick);
  return (u, v) => (u < 0.5 ? getLeft(u, v) : getRight(u, v));
}
