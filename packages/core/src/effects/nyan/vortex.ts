import { z } from "zod";
import { defineEffect } from "../../effect.ts";
import { HEIGHT, WIDTH, setRgbaPixel } from "../../frame.ts";
import { createRandom, hashSeed } from "../../random.ts";
import { type Sprite, rotateSprite } from "../../sprite.ts";
import {
  type NyanCatId,
  RAINBOW_COLORS,
  WHITE,
  drawScaledSprite,
  drawStar,
  fillBackground,
  getNyanFrame,
  getNyanPalette,
  getNyanSprite,
  mixColor,
  nyanParams,
} from "./shared.ts";

const STAR_SEED = 0x60f7;
const rotations = new Map<string, Sprite>();

function getRotatedSprite(cat: NyanCatId, frame: number, turns: number): Sprite {
  const index = ((frame % 6) + 6) % 6;
  const key = `${cat}:${index}:${turns}`;
  const cached = rotations.get(key);
  if (cached) {
    return cached;
  }
  const sprite = rotateSprite(getNyanSprite(cat, index), turns);
  rotations.set(key, sprite);
  return sprite;
}

export const nyanVortex = defineEffect({
  id: "nyan-vortex",
  name: "Nyan vortex",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    ...nyanParams,
    every: z.number().min(0.25).max(4).default(1),
    spin: z.number().int().min(0).max(4).default(1),
    shape: z.enum(["square", "circle"]).default("square"),
    stars: z.number().int().min(0).max(60).default(28),
  }),
  render(image, { params, beat }) {
    fillBackground(image, [0, 0, 0]);
    const frame = getNyanFrame(beat, params.speed);
    const pulse = beat / params.every;
    const index = Math.floor(pulse);
    const since = (pulse - index) * params.every;
    const centerX = WIDTH / 2 - 0.5;
    const centerY = HEIGHT / 2 - 0.5;
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const dx = x - centerX;
        const dy = y - centerY;
        const distance =
          params.shape === "square" ? Math.max(Math.abs(dx), Math.abs(dy)) : Math.hypot(dx, dy);
        for (let ring = 0; ring < 3; ring++) {
          const age = since + ring * params.every;
          const radius = 4 + age * 26;
          const inside = radius - distance;
          if (inside < 0 || inside >= RAINBOW_COLORS.length * 2) {
            continue;
          }
          setRgbaPixel(image, x, y, RAINBOW_COLORS[Math.floor(inside / 2)] ?? WHITE);
          break;
        }
      }
    }
    for (let star = 0; star < params.stars; star++) {
      const random = createRandom(hashSeed(STAR_SEED, star));
      const angle = random() * Math.PI * 2 + (beat / 16) * Math.PI * 2;
      const rate = random() < 0.5 ? 0.25 : 0.5;
      const life = (((beat * rate + random()) % 1) + 1) % 1;
      const distance = 4 + life * life * 48;
      drawStar(
        image,
        centerX + Math.cos(angle) * distance,
        centerY + Math.sin(angle) * distance,
        Math.floor(life * 6),
        mixColor(WHITE, RAINBOW_COLORS[star % RAINBOW_COLORS.length] ?? WHITE, 0.3),
      );
    }
    const turns = params.spin === 0 ? 0 : (index * params.spin) % 4;
    const sprite = getRotatedSprite(params.cat, frame, turns);
    drawScaledSprite(
      image,
      sprite,
      Math.round(centerX - sprite.width / 2 + 0.5),
      Math.round(centerY - sprite.height / 2 + 0.5),
      getNyanPalette(params),
    );
  },
});
