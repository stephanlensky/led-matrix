import { z } from "zod";
import { colorSchema, parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import { type Color, HEIGHT, type RgbaImage, WIDTH } from "../../frame.ts";
import { scale } from "../cat-model.ts";
import { addScribbles, scribbleParams } from "./scribble.ts";
import {
  TAU,
  addLight,
  clamp,
  createInk,
  drawInk,
  getCycle,
  getNoise,
  mix,
  setPixel,
  speedSchema,
} from "./shared.ts";

const SPLIT = WIDTH / 2;
const HORIZON = 34;
const WAVE_SEED = 0x3a7e;
const WHITE: Color = [255, 255, 255];

type Glow = { x: number; y: number; radius: number; color: Color; phase: number };

const shoreLights: readonly Glow[] = [
  { x: 14, y: 33, radius: 1.6, color: [255, 236, 200], phase: 0 },
  { x: 18, y: 32, radius: 2.2, color: [255, 250, 240], phase: 0.25 },
  { x: 21, y: 33, radius: 1.4, color: [255, 220, 170], phase: 0.5 },
  { x: 25, y: 33, radius: 1.8, color: [255, 70, 130], phase: 0.75 },
  { x: 9, y: 34, radius: 1.2, color: [200, 220, 255], phase: 0.4 },
];

const pierLights: readonly Glow[] = [
  { x: 4, y: 45, radius: 2.4, color: [40, 230, 255], phase: 0 },
  { x: 6, y: 54, radius: 2.8, color: [40, 220, 255], phase: 0.5 },
];

function drawNight(
  image: RgbaImage,
  skyTop: Color,
  skyBottom: Color,
  water: Color,
  beat: number,
): void {
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < SPLIT; x++) {
      if (y < HORIZON) {
        setPixel(image, x, y, mix(skyTop, skyBottom, (y / HORIZON) ** 1.5));
        continue;
      }
      const depth = (y - HORIZON) / (HEIGHT - HORIZON);
      const ripple = getNoise(x * 0.3, y * 0.9 - beat * 0.5, WAVE_SEED);
      setPixel(image, x, y, scale(water, 0.75 + 0.35 * ripple - depth * 0.25));
    }
  }
  for (let x = 0; x < SPLIT; x++) {
    const shore = HORIZON - 1 + Math.round(getNoise(x * 0.25, 0, WAVE_SEED + 1) * 2);
    for (let y = shore; y <= HORIZON; y++) {
      setPixel(image, x, y, scale(skyTop, 0.45));
    }
  }
  for (let y = 40; y < HEIGHT; y++) {
    const edge = Math.floor(12 - (y - 40) * 0.42);
    for (let x = 0; x < edge; x++) {
      setPixel(image, x, y, mix(water, [10, 40, 70], 0.7));
    }
  }
}

function drawGlow(image: RgbaImage, glow: Glow, beat: number, pulse: number): void {
  const kick = Math.exp(-getCycle(beat + glow.phase) * 4) * pulse;
  const radius = glow.radius * (1 + 0.35 * kick);
  const reach = Math.ceil(radius * 2);
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const distance = Math.hypot(dx, dy * 1.2) / radius;
      const amount = clamp(1.15 - distance) ** 1.4 + clamp(1 - distance / 2) * 0.25;
      if (glow.x + dx < SPLIT) {
        addLight(
          image,
          glow.x + dx,
          glow.y + dy,
          mix(glow.color, WHITE, clamp(1 - distance) * 0.5),
          amount,
        );
      }
    }
  }
}

function drawReflection(image: RgbaImage, glow: Glow, beat: number): void {
  for (let y = HORIZON + 1; y < HEIGHT; y++) {
    const fall = (y - HORIZON) / (HEIGHT - HORIZON);
    const wobble = Math.sin(y * 1.3 - beat * TAU * 0.5 + glow.x) * (0.5 + fall * 1.5);
    const shimmer = getNoise(glow.x * 0.5, y * 0.8 - beat * 1.5, WAVE_SEED + 2);
    const amount = (1 - fall) * clamp((shimmer - 0.3) * 2.2) * 0.8;
    if (glow.x + wobble < SPLIT) {
      addLight(image, glow.x + wobble, y, glow.color, amount);
    }
  }
}

export const getYourWish = defineEffect({
  id: "get-your-wish",
  name: "Get your wish",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    speed: speedSchema,
    skyTop: colorSchema.default("#0818a8"),
    skyBottom: colorSchema.default("#2848e0"),
    water: colorSchema.default("#0c2cb0"),
    ink: colorSchema.default("#ffffff"),
    pulse: z.number().min(0).max(1).default(0.6),
    style: scribbleParams.style.default("jagged"),
    drive: scribbleParams.drive,
    tail: scribbleParams.tail.default(8),
  }),
  render(image, { params, beat: musicBeat }) {
    const beat = musicBeat * params.speed;
    drawNight(
      image,
      parseColor(params.skyTop),
      parseColor(params.skyBottom),
      parseColor(params.water),
      beat,
    );
    for (const glow of shoreLights) {
      drawReflection(image, glow, beat);
      drawGlow(image, glow, beat, params.pulse);
    }
    for (const glow of pierLights) {
      drawGlow(image, glow, beat, params.pulse);
    }
    const ink = createInk();
    addScribbles(
      ink,
      {
        ink: params.ink,
        paper: "none",
        mode: "trail",
        style: params.style,
        pens: 1,
        tail: params.tail,
        period: 16,
        drive: params.drive,
        complexity: 10,
      },
      beat,
      { x: SPLIT + 3, y: 3, width: WIDTH - SPLIT - 6, height: HEIGHT - 6 },
    );
    for (let y = 0; y < HEIGHT; y++) {
      ink.fill(0, y * WIDTH, y * WIDTH + SPLIT);
    }
    drawInk(image, ink, params.ink, "none");
  },
});
