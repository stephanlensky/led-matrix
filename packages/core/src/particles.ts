import { type Random, createRandom, hashSeed } from "./random.ts";

export type ParticleSpawn = {
  x: number;
  y: number;
  vx: number;
  vy: number;
};

export type ParticleEmitter = {
  seed: number;
  rate: number;
  lifetime: number;
  period?: number;
  gravity?: number;
  spawn(random: Random): ParticleSpawn;
};

export type Particle = ParticleSpawn & {
  spawnX: number;
  spawnY: number;
  age: number;
  life: number;
  random: Random;
};

export function getParticles(emitter: ParticleEmitter, time: number): Particle[] {
  if (emitter.rate <= 0 || emitter.lifetime <= 0) {
    return [];
  }
  const periodCount =
    emitter.period === undefined
      ? undefined
      : Math.max(1, Math.round((emitter.period * emitter.rate) / 1000));
  const interval =
    emitter.period === undefined || periodCount === undefined
      ? 1000 / emitter.rate
      : emitter.period / periodCount;
  const gravity = emitter.gravity ?? 0;
  const particles: Particle[] = [];
  const first = Math.floor((time - emitter.lifetime) / interval) + 1;
  for (let index = first; index * interval <= time; index++) {
    const age = time - index * interval;
    const seedIndex =
      periodCount === undefined ? index : ((index % periodCount) + periodCount) % periodCount;
    const random = createRandom(hashSeed(emitter.seed, seedIndex));
    const spawn = emitter.spawn(random);
    const seconds = age / 1000;
    particles.push({
      spawnX: spawn.x,
      spawnY: spawn.y,
      x: spawn.x + spawn.vx * seconds,
      y: spawn.y + spawn.vy * seconds + 0.5 * gravity * seconds ** 2,
      vx: spawn.vx,
      vy: spawn.vy + gravity * seconds,
      age,
      life: age / emitter.lifetime,
      random,
    });
  }
  return particles;
}
