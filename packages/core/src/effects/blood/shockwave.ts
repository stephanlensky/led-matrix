import { z } from "zod";
import { colorSchema, parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import { HEIGHT, WIDTH, setRgbaPixel } from "../../frame.ts";
import { createRandom, getRandomBetween, hashSeed } from "../../random.ts";
import {
  BLOOD_COLOR,
  type Point,
  drawDot,
  drawStreak,
  getBallisticPosition,
  getModulo,
  getNoise,
  getScaledColor,
} from "./shared.ts";

const RING_SEED = 0xb10c0;
const TEXTURE_SEED = 0xb10c1;
const CENTER: Point = [WIDTH / 2 - 0.5, HEIGHT / 2 - 0.5];
const LIFE = 1;
const DROPLET_GRAVITY = 160;

export const bloodShockwave = defineEffect({
  id: "blood-shockwave",
  name: "Blood shockwave",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default(BLOOD_COLOR),
    perBeat: z.number().int().min(1).max(4).default(1),
    speed: z.number().min(20).max(200).default(70),
    thickness: z.number().min(1).max(12).default(5),
    droplets: z.number().int().min(0).max(96).default(32),
    period: z.number().int().min(1).max(256).default(8),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const ringsPerPeriod = params.period * params.perBeat;
    const first = Math.floor((beat - LIFE) * params.perBeat) + 1;
    const last = Math.floor(beat * params.perBeat);
    for (let ring = first; ring <= last; ring++) {
      const age = beat - ring / params.perBeat;
      const fade = 1 - age / LIFE;
      const random = createRandom(hashSeed(RING_SEED, getModulo(ring, ringsPerPeriod)));
      const phases = [random(), random()].map((value) => value * Math.PI * 2);
      const radius = age * params.speed;
      const halfThickness = (params.thickness * fade + 1) / 2;
      const isAccent = getModulo(ring, params.perBeat) === 0;
      const ringShade = (isAccent ? 1.25 : 0.9) * fade;
      for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
          const offsetX = x - CENTER[0];
          const offsetY = y - CENTER[1];
          const angle = Math.atan2(offsetY, offsetX);
          const edge =
            radius *
            (1 +
              0.07 * Math.sin(7 * angle + (phases[0] ?? 0)) +
              0.04 * Math.sin(13 * angle + (phases[1] ?? 0)));
          const distance = Math.abs(Math.hypot(offsetX, offsetY) - edge);
          if (distance < halfThickness) {
            const shade = ringShade * (0.7 + 0.3 * getNoise(TEXTURE_SEED, x, y));
            setRgbaPixel(image, x, y, getScaledColor(color, shade));
          }
        }
      }
      if (age < 0.2) {
        const core = 7 * (1 - age / 0.2);
        for (let y = -Math.ceil(core); y <= core; y++) {
          for (let x = -Math.ceil(core); x <= core; x++) {
            if (Math.hypot(x, y) <= core) {
              setRgbaPixel(
                image,
                Math.round(CENTER[0] + x),
                Math.round(CENTER[1] + y),
                getScaledColor(color, ringShade),
              );
            }
          }
        }
      }
      for (let index = 0; index < params.droplets; index++) {
        const angle = random() * Math.PI * 2;
        const speed = params.speed * getRandomBetween(random, 0.85, 1.15);
        const velocity: Point = [Math.cos(angle) * speed, Math.sin(angle) * speed];
        const head = getBallisticPosition(CENTER, velocity, DROPLET_GRAVITY, age);
        const tail = getBallisticPosition(
          CENTER,
          velocity,
          DROPLET_GRAVITY,
          Math.max(0, age - 0.05),
        );
        const dropletColor = getScaledColor(color, ringShade * getRandomBetween(random, 0.8, 1.2));
        drawStreak(image, tail, head, dropletColor);
        drawDot(image, head, random() < 0.3 ? 2 : 1, dropletColor);
      }
    }
  },
});
