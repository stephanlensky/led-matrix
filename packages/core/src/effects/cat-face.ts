import type { Color, RgbaImage } from "../frame.ts";
import type { Vector } from "../mesh.ts";
import { type CatPlacement, type Coat, getCatPoint, mix, scale } from "./cat-model.ts";
import { blendPixel, drawHeart } from "./heart.ts";

export const eyeStyles = ["open", "happy", "hearts"] as const;

export type EyeStyle = (typeof eyeStyles)[number];

export type CatFace = { eyes: Vector[]; isFacing: boolean; isVisible: boolean[]; top: Vector };

const EYE: Vector = [0.2, 0.7, 1.08];
const HEAD_CENTER: Vector = [0, 0.62, 0.7];
const HEAD_TOP: Vector = [0, 1.25, 0.65];
const WHITE: Color = [255, 255, 255];
const HAPPY_EYE = [
  [-2, 1],
  [-1, 0],
  [0, -1],
  [1, 0],
  [2, 1],
] as const;
const SMALL_HAPPY_EYE = [
  [-1, 0],
  [0, -1],
  [1, 0],
] as const;

export function getEyelessCoat(coat: Coat): Coat {
  return (part, position, shade) => coat(part === "eye" ? "head" : part, position, shade);
}

export function getCatFace(placement: CatPlacement): CatFace {
  const eyes = [-1, 1].map((eye) => getCatPoint(placement, [eye * EYE[0], EYE[1], EYE[2]], "head"));
  const center = getCatPoint(placement, HEAD_CENTER, "head");
  const isVisible = eyes.map(([, , depth]) => depth > center[2] + 0.1);
  return {
    eyes,
    isFacing: isVisible.every(Boolean),
    isVisible,
    top: getCatPoint(placement, HEAD_TOP, "head"),
  };
}

export function drawEyes(
  image: RgbaImage,
  { eyes, isFacing }: CatFace,
  style: EyeStyle,
  eyeColor: Color,
  heartColor: Color,
  pop: number,
  size = 5.5,
): void {
  if (style === "open" || !isFacing) {
    return;
  }
  for (const [x, y] of eyes) {
    if (style === "hearts") {
      drawHeart(image, {
        x,
        y: y - 0.5,
        size: size * pop,
        color: mix(heartColor, WHITE, 0.15),
        outline: scale(heartColor, 0.35),
      });
      continue;
    }
    const left = Math.round(x - 0.5);
    const top = Math.round(y - 1);
    for (const [dx, dy] of size < 5 ? SMALL_HAPPY_EYE : HAPPY_EYE) {
      blendPixel(image, left + dx, top + dy, eyeColor);
    }
  }
}
