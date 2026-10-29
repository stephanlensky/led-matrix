import type { Color, RgbaImage } from "../frame.ts";
import { easings } from "../keyframes.ts";
import { TAU, getSpan } from "./cat-duo.ts";
import { getOvershoot } from "./cat-wands.ts";
import type { CharacterHead } from "./character-heads.ts";
import { blendPixel } from "./heart.ts";

const WHITE: Color = [255, 255, 255];
const BLACK: Color = [0, 0, 0];

type ThoughtMask = { width: number; height: number; cells: Uint8Array };

const THOUGHT_PAD = [5, 4] as const;
const THOUGHT_BUMP = 3.2;
const thoughtMasks = new Map<string, ThoughtMask>();

function isInsideCloud(x: number, y: number, width: number, height: number): boolean {
  const [centerX, centerY] = [width / 2, height / 2];
  const [radiusX, radiusY] = [centerX - THOUGHT_BUMP, centerY - THOUGHT_BUMP];
  if (((x - centerX) / radiusX) ** 2 + ((y - centerY) / radiusY) ** 2 <= 1) {
    return true;
  }
  const bumps = Math.round((Math.PI * (radiusX + radiusY)) / 5);
  for (let bump = 0; bump < bumps; bump++) {
    const angle = (bump / bumps) * TAU + 0.3;
    const bumpX = centerX + Math.cos(angle) * radiusX;
    const bumpY = centerY + Math.sin(angle) * radiusY;
    if (Math.hypot(x - bumpX, y - bumpY) <= THOUGHT_BUMP) {
      return true;
    }
  }
  return false;
}

export function getThoughtMask(head: CharacterHead): ThoughtMask {
  const width = head.sprite.width + THOUGHT_PAD[0] * 2;
  const height = head.sprite.height + THOUGHT_PAD[1] * 2;
  const key = `${width}x${height}`;
  const cached = thoughtMasks.get(key);
  if (cached) {
    return cached;
  }
  const isInside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && isInsideCloud(x + 0.5, y + 0.5, width, height);
  const cells = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isInside(x, y)) {
        continue;
      }
      const isEdge = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx = 0, dy = 0]) => !isInside(x + dx, y + dy));
      cells[y * width + x] = isEdge ? 2 : 1;
    }
  }
  const mask = { width, height, cells };
  thoughtMasks.set(key, mask);
  return mask;
}

export type ThoughtTiming = { dots: number; scale: number };

export type Thought = {
  x: number;
  y: number;
  head: CharacterHead;
  anchor: readonly [number, number];
  timing: ThoughtTiming;
  bob: number;
};

const THOUGHT_DOTS = [
  { at: 0.3, rows: ["##", "##"] },
  { at: 0.65, rows: [".##.", "####", "####", ".##."] },
] as const;

export function getThoughtTiming(
  story: number,
  [start, end]: readonly [number, number],
): ThoughtTiming {
  const appear = story - start;
  const leave = story - end;
  if (appear < 0) {
    return { dots: 0, scale: 0 };
  }
  if (leave < 0) {
    return {
      dots: appear < 0.25 ? 1 : 2,
      scale: appear < 0.5 ? 0 : getOvershoot(getSpan(appear, 0.5, 1.1)),
    };
  }
  return {
    dots: leave < 0.45 ? 2 : leave < 0.6 ? 1 : 0,
    scale: 1 - easings.easeInCubic(getSpan(leave, 0, 0.35)),
  };
}

function getThoughtColor(
  mask: ThoughtMask,
  thought: Thought,
  x: number,
  y: number,
): Color | undefined {
  const cell = mask.cells[y * mask.width + x] ?? 0;
  if (cell !== 1) {
    return cell === 2 ? WHITE : undefined;
  }
  const { sprite, palette } = thought.head;
  const row = sprite.rows[y - THOUGHT_PAD[1] + thought.bob];
  return palette[row?.[x - THOUGHT_PAD[0]] ?? "."] ?? BLACK;
}

export function drawThought(image: RgbaImage, thought: Thought): void {
  const mask = getThoughtMask(thought.head);
  const { dots, scale: size } = thought.timing;
  const [anchorX, anchorY] = thought.anchor;
  const targetX = anchorX < thought.x ? thought.x + 4 : thought.x + mask.width - 4;
  const targetY = thought.y + mask.height - 3;
  for (const { at, rows } of THOUGHT_DOTS.slice(0, dots)) {
    const left = Math.round(anchorX + (targetX - anchorX) * at - rows.length / 2);
    const top = Math.round(anchorY + (targetY - anchorY) * at - rows.length / 2);
    for (const [row, line] of rows.entries()) {
      for (let column = 0; column < line.length; column++) {
        if (line[column] === "#") {
          blendPixel(image, left + column, top + row, WHITE);
        }
      }
    }
  }
  if (size <= 0.05) {
    return;
  }
  const left = thought.x + (mask.width / 2) * (1 - size);
  const top = thought.y + (mask.height / 2) * (1 - size);
  for (let py = Math.floor(top); py <= top + mask.height * size; py++) {
    for (let px = Math.floor(left); px <= left + mask.width * size; px++) {
      const x = Math.floor((px + 0.5 - left) / size);
      const y = Math.floor((py + 0.5 - top) / size);
      if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) {
        continue;
      }
      const color = getThoughtColor(mask, thought, x, y);
      if (color) {
        blendPixel(image, px, py, color);
      }
    }
  }
}
