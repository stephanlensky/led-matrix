import { z } from "zod";
import { defineEffect } from "../../effect.ts";
import { type Color, HEIGHT, type RgbaImage, WIDTH, setRgbaPixel } from "../../frame.ts";
import { createRandom, getRandomBetween, hashSeed } from "../../random.ts";
import {
  NYAN_HEIGHT,
  NYAN_WIDTH,
  RAINBOW_COLORS,
  WHITE,
  drawNyan,
  drawRainbowTrail,
  drawStars,
  fillBackground,
  getNyanFrame,
  getNyanPalette,
  getRainbowShape,
  getSolidPalette,
  mixColor,
  nyanParams,
  scaleColor,
} from "./shared.ts";

const STREAK_SEED = 0x4a2d;
const SHAKE_SEED = 0x5ac3;

function drawStreaks(
  image: RgbaImage,
  beat: number,
  count: number,
  speed: number,
  length: number,
): void {
  for (let streak = 0; streak < count; streak++) {
    const random = createRandom(hashSeed(STREAK_SEED, streak));
    const y = Math.floor(random() * HEIGHT);
    const offset = random();
    const rate = Math.max(0.25, Math.round(speed * (0.6 + random() * 0.8) * 4) / 4);
    const travel = (((beat * rate + offset) % 1) + 1) % 1;
    const head = WIDTH + length - travel * (WIDTH + length * 2);
    const color = mixColor(RAINBOW_COLORS[streak % RAINBOW_COLORS.length] ?? WHITE, WHITE, 0.6);
    for (let step = 0; step < length; step++) {
      setRgbaPixel(image, Math.round(head + step), y, scaleColor(color, 1 - step / length));
    }
  }
}

function getShake(beat: number, amount: number, axis: number): number {
  const random = createRandom(hashSeed(SHAKE_SEED, Math.floor(beat * 8), axis));
  return Math.round(getRandomBetween(random, -amount, amount));
}

function drawRing(
  image: RgbaImage,
  centerX: number,
  centerY: number,
  radius: number,
  amount: number,
): void {
  for (const [band, color] of RAINBOW_COLORS.entries()) {
    const bandRadius = radius - band * 1.5;
    if (bandRadius <= 0) {
      continue;
    }
    const steps = Math.ceil(bandRadius * 8);
    for (let step = 0; step < steps; step++) {
      const angle = (step / steps) * Math.PI * 2;
      setRgbaPixel(
        image,
        Math.round(centerX + Math.cos(angle) * bandRadius),
        Math.round(centerY + Math.sin(angle) * bandRadius * 0.8),
        scaleColor(color, amount),
      );
    }
  }
}

function flash(image: RgbaImage, color: Color, amount: number): void {
  if (amount <= 0) {
    return;
  }
  for (let offset = 0; offset < image.length; offset += 4) {
    image[offset] = (image[offset] ?? 0) + (color[0] - (image[offset] ?? 0)) * amount;
    image[offset + 1] = (image[offset + 1] ?? 0) + (color[1] - (image[offset + 1] ?? 0)) * amount;
    image[offset + 2] = (image[offset + 2] ?? 0) + (color[2] - (image[offset + 2] ?? 0)) * amount;
    image[offset + 3] = 255;
  }
}

export const nyanHardstyle = defineEffect({
  id: "nyan-hardstyle",
  name: "Nyan hardstyle",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    ...nyanParams,
    phase: z.enum(["build", "drop"]).default("drop"),
    every: z.number().min(0.25).max(4).default(1),
    strobe: z.number().min(0).max(1).default(0.85),
  }),
  render(image, { params, beat, progress }) {
    fillBackground(image, [0, 0, 0]);
    if (params.phase === "build") {
      const intensity = progress;
      const frame = getNyanFrame(beat, params.speed * (1 + intensity * 2));
      const stutter = intensity > 0.75 ? Math.floor(beat * 4) % 2 : 0;
      if (intensity < 0.4) {
        drawStars(image, frame, { count: 14 });
      }
      drawStreaks(
        image,
        beat,
        Math.round(4 + intensity * 26),
        0.5 + intensity * 3,
        Math.round(2 + intensity * 14),
      );
      const shake = intensity * intensity * 4;
      const x = 15 + getShake(beat, shake, 0);
      const y = 21 + getShake(beat, shake, 1);
      const { shift } = getRainbowShape(frame);
      drawRainbowTrail(image, x + 14 - shift, y, frame, {
        amount: stutter ? 0.35 : 1,
      });
      drawNyan(image, params, x, y, frame, {
        palette: stutter ? getSolidPalette(getNyanPalette(params), WHITE) : undefined,
      });
      flash(image, WHITE, Math.max(0, (intensity - 0.9) * 10) ** 2);
      return;
    }
    const pulse = beat / params.every;
    const index = Math.floor(pulse);
    const since = (pulse - index) * params.every;
    const kick = Math.exp(-since * 7);
    const color = RAINBOW_COLORS[((index % 6) + 6) % 6] ?? WHITE;
    const frame = getNyanFrame(beat, params.speed * 2);
    flash(image, color, params.strobe * Math.exp(-since * 14));
    drawStreaks(image, beat, 22, 3, 12);
    const isPunch = since < 0.12 * params.every;
    const scale = isPunch ? 2 : 1;
    const shake = Math.round(3 * kick);
    const centerX = WIDTH / 2 + getShake(beat, shake, 0);
    const centerY = HEIGHT / 2 + getShake(beat, shake, 1);
    const x = Math.round(centerX - (NYAN_WIDTH * scale) / 2 + (isPunch ? 6 : 0));
    const y = Math.round(centerY - (NYAN_HEIGHT * scale) / 2);
    for (let ring = 0; ring < 2; ring++) {
      const age = since + ring * params.every;
      drawRing(
        image,
        centerX + 4,
        centerY,
        6 + age * 44,
        Math.max(0, 1 - age / (params.every * 1.4)),
      );
    }
    const bandHeight = 3 * scale + Math.round(2 * kick);
    const top = y + Math.round((NYAN_HEIGHT * scale - bandHeight * 6) / 2) - 1;
    const { shift } = getRainbowShape(frame);
    drawRainbowTrail(image, x + (14 - shift) * scale, top, frame, {
      bandHeight,
      segment: 8 * scale,
      amplitude: scale + Math.round(kick),
    });
    drawNyan(image, params, x, y, frame, { scale });
  },
});
