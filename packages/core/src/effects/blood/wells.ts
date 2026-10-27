import { z } from "zod";
import { colorSchema, parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import { HEIGHT, WIDTH, setRgbaPixel } from "../../frame.ts";
import { createRandom, getRandomBetween, hashSeed } from "../../random.ts";
import {
  BLOOD_COLOR,
  type Point,
  drawStreak,
  fillImage,
  getEnvelope,
  getModulo,
  getScaledColor,
} from "./shared.ts";

const WELL_SEED = 0xb10e0;
const PARTICLE_SEED = 0xb10e1;
const STEPS_PER_BEAT = 30;
const SOFTENING = 12;
const DAMPING = 0.35;
const MAX_SPEED = 160;
const KICK_BEATS = 0.25;
const MARGIN = 10;
const TRAIL = 0.035;
const FLASH_BEATS = 0.2;

type Particle = { x: number; y: number; velocityX: number; velocityY: number; shade: number };

function getWells(segment: number, count: number): Point[] {
  const random = createRandom(hashSeed(WELL_SEED, segment));
  return Array.from({ length: count }, () => [
    getRandomBetween(random, MARGIN, WIDTH - MARGIN),
    getRandomBetween(random, MARGIN, HEIGHT - MARGIN),
  ]);
}

function createParticles(count: number, burst: number): Particle[] {
  const random = createRandom(PARTICLE_SEED);
  return Array.from({ length: count }, () => {
    const angle = random() * Math.PI * 2;
    const speed = burst * getRandomBetween(random, 0.2, 1);
    return {
      x: WIDTH / 2 + getRandomBetween(random, -2, 2),
      y: HEIGHT / 2 + getRandomBetween(random, -2, 2),
      velocityX: Math.cos(angle) * speed,
      velocityY: Math.sin(angle) * speed,
      shade: getRandomBetween(random, 0.6, 1.3),
    };
  });
}

export const bloodWells = defineEffect({
  id: "blood-wells",
  name: "Blood gravity wells",
  kind: "pixel",
  params: z.object({
    color: colorSchema.default(BLOOD_COLOR),
    particles: z.number().int().min(1).max(600).default(260),
    wells: z.number().int().min(1).max(5).default(3),
    every: z.number().int().min(1).max(16).default(2),
    strength: z.number().min(0.2).max(3).default(1),
    burst: z.number().min(0).max(200).default(120),
    period: z.number().int().min(1).max(64).default(16),
    flash: z.number().min(0).max(1).default(0.25),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const elapsed = getModulo(beat, params.period);
    const segmentsPerPeriod = Math.max(1, Math.round(params.period / params.every));
    const particles = createParticles(params.particles, params.burst);
    const gravity = 36_000 * params.strength;
    const steps = Math.floor(elapsed * STEPS_PER_BEAT);
    const delta = 1 / STEPS_PER_BEAT;
    const damping = Math.exp(-DAMPING * delta);
    let segment = -1;
    let wells: Point[] = [];
    for (let step = 0; step < steps; step++) {
      const time = step * delta;
      const current = Math.floor(time / params.every);
      if (current !== segment) {
        segment = current;
        wells = getWells(getModulo(segment, segmentsPerPeriod), params.wells);
      }
      const sinceSwap = time - segment * params.every;
      const pull = gravity * (sinceSwap < KICK_BEATS ? 2 : 1);
      for (const particle of particles) {
        let accelerationX = 0;
        let accelerationY = 0;
        for (const [wellX, wellY] of wells) {
          const offsetX = wellX - particle.x;
          const offsetY = wellY - particle.y;
          const distanceSquared = offsetX ** 2 + offsetY ** 2 + SOFTENING;
          const force = pull / (distanceSquared * Math.sqrt(distanceSquared));
          accelerationX += offsetX * force;
          accelerationY += offsetY * force;
        }
        particle.velocityX = (particle.velocityX + accelerationX * delta) * damping;
        particle.velocityY = (particle.velocityY + accelerationY * delta) * damping;
        const speed = Math.hypot(particle.velocityX, particle.velocityY);
        if (speed > MAX_SPEED) {
          particle.velocityX *= MAX_SPEED / speed;
          particle.velocityY *= MAX_SPEED / speed;
        }
        particle.x += particle.velocityX * delta;
        particle.y += particle.velocityY * delta;
      }
    }

    if (elapsed < FLASH_BEATS && params.flash > 0) {
      fillImage(image, getScaledColor(color, params.flash * (1 - elapsed / FLASH_BEATS) ** 2));
    }

    const visibleSegment = Math.floor(elapsed / params.every);
    const sinceSwap = elapsed - visibleSegment * params.every;
    const wellPulse = getEnvelope(beat, 5);
    for (const [wellX, wellY] of getWells(
      getModulo(visibleSegment, segmentsPerPeriod),
      params.wells,
    )) {
      const radius = 1.5 + wellPulse * 1.5 + Math.max(0, 1 - sinceSwap / KICK_BEATS) * 3;
      for (let y = -Math.ceil(radius); y <= radius; y++) {
        for (let x = -Math.ceil(radius); x <= radius; x++) {
          const distance = Math.hypot(x, y);
          if (distance <= radius) {
            setRgbaPixel(
              image,
              Math.round(wellX) + x,
              Math.round(wellY) + y,
              getScaledColor(color, 0.25 + 0.35 * (1 - distance / radius)),
            );
          }
        }
      }
    }

    for (const { x, y, velocityX, velocityY, shade } of particles) {
      const speed = Math.hypot(velocityX, velocityY);
      const particleColor = getScaledColor(color, shade * (0.55 + 0.6 * Math.min(1, speed / 90)));
      drawStreak(image, [x - velocityX * TRAIL, y - velocityY * TRAIL], [x, y], particleColor);
    }
  },
});
