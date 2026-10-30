import { z } from "zod";
import { defineEffect } from "../../effect.ts";
import { HEIGHT, type RgbaImage, WIDTH, setRgbaPixel } from "../../frame.ts";
import { type Palette } from "../../sprite.ts";
import {
  NYAN_HEIGHT,
  NYAN_WIDTH,
  RAINBOW_COLORS,
  WHITE,
  drawScaledSprite,
  drawStars,
  fillBackground,
  getNyanFrame,
  getNyanPalette,
  getNyanSprite,
  getShadedPalette,
  getSolidPalette,
  nyanParams,
  scaleColor,
} from "./shared.ts";

const RANGE_X = WIDTH - NYAN_WIDTH;
const RANGE_Y = HEIGHT - NYAN_HEIGHT;
const PERIOD_X = 48;
const PERIOD_Y = 96;
const TRAIL_FRAMES = 40;

type Position = { x: number; y: number; facing: 1 | -1 };

function getTriangle(frame: number, period: number): number {
  const phase = (((frame / period) % 1) + 1) % 1;
  return phase < 0.5 ? phase * 2 : 2 - phase * 2;
}

function getPosition(frame: number): Position {
  const phaseX = (((frame / PERIOD_X) % 1) + 1) % 1;
  return {
    x: Math.round(getTriangle(frame, PERIOD_X) * RANGE_X),
    y: Math.round(getTriangle(frame, PERIOD_Y) * RANGE_Y),
    facing: phaseX < 0.5 ? 1 : -1,
  };
}

function getCornerAge(frame: number): number {
  const since = ((frame % (PERIOD_Y / 2)) + PERIOD_Y / 2) % (PERIOD_Y / 2);
  return since;
}

function drawTrail(image: RgbaImage, frame: number): void {
  for (let back = TRAIL_FRAMES; back >= 1; back--) {
    const { x, y, facing } = getPosition(frame - back);
    const next = getPosition(frame - back + 1);
    const rear = facing === 1 ? x + 8 : x + NYAN_WIDTH - 9;
    const nextRear = next.facing === 1 ? next.x + 8 : next.x + NYAN_WIDTH - 9;
    const from = Math.min(rear, nextRear);
    const to = Math.max(rear, nextRear);
    const wave = Math.floor((frame - back) / 2) % 2;
    const fade = Math.min(1, back < 4 ? 1 : 1 - (back - 4) / (TRAIL_FRAMES - 4) + 0.15);
    for (let column = from; column <= to; column++) {
      for (const [band, color] of RAINBOW_COLORS.entries()) {
        for (let row = 0; row < 3; row++) {
          setRgbaPixel(image, column, y + 1 + wave + band * 3 + row, scaleColor(color, fade));
        }
      }
    }
  }
}

export const nyanBounce = defineEffect({
  id: "nyan-bounce",
  name: "Nyan bounce",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    ...nyanParams,
    stars: z.number().int().min(0).max(40).default(10),
    corner: z.boolean().default(true),
  }),
  render(image, { params, beat }) {
    fillBackground(image, [0, 0, 0]);
    const frame = getNyanFrame(beat, params.speed);
    drawStars(image, frame, { count: params.stars });
    const cornerAge = getCornerAge(frame);
    drawTrail(image, frame);
    const { x, y, facing } = getPosition(frame);
    let palette: Palette = getNyanPalette(params);
    if (params.corner && cornerAge < 6) {
      const color = RAINBOW_COLORS[cornerAge % RAINBOW_COLORS.length] ?? WHITE;
      palette =
        cornerAge % 2 === 0 ? getSolidPalette(palette, color, WHITE) : getShadedPalette(palette, 1);
      for (let ring = 0; ring < 3; ring++) {
        const radius = cornerAge * 6 + ring * 3;
        const cornerX = x < RANGE_X / 2 ? 0 : WIDTH - 1;
        const cornerY = y < RANGE_Y / 2 ? 0 : HEIGHT - 1;
        for (let step = 0; step < 64; step++) {
          const angle = (step / 64) * Math.PI * 2;
          setRgbaPixel(
            image,
            Math.round(cornerX + Math.cos(angle) * radius),
            Math.round(cornerY + Math.sin(angle) * radius),
            RAINBOW_COLORS[(ring + cornerAge) % RAINBOW_COLORS.length] ?? WHITE,
          );
        }
      }
    }
    drawScaledSprite(image, getNyanSprite(params.cat, frame), x, y, palette, 1, facing === -1);
  },
});
