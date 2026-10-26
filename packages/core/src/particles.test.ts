import { describe, expect, it } from "vitest";
import { getParticles } from "./particles.ts";

const emitter = {
  seed: 1,
  rate: 4,
  lifetime: 1000,
  gravity: 10,
  spawn: (random: () => number) => ({ x: random() * 64, y: 0, vx: 0, vy: 0 }),
};

describe("getParticles", () => {
  it("keeps particles alive for their lifetime and applies gravity", () => {
    const particles = getParticles(emitter, 2000);
    expect(particles.map((particle) => particle.age)).toEqual([750, 500, 250, 0]);
    expect(particles[0]?.y).toBeCloseTo(0.5 * 10 * 0.75 ** 2);
  });

  it("is deterministic and repeats seamlessly over a period", () => {
    const periodic = { ...emitter, period: 2000 };
    const atEnd = getParticles(periodic, 1999.999);
    const wrapped = getParticles(periodic, 3999.999);
    expect(wrapped.map((particle) => particle.x)).toEqual(atEnd.map((particle) => particle.x));
    expect(getParticles(periodic, -0.001).map((particle) => particle.x)).toEqual(
      atEnd.map((particle) => particle.x),
    );
  });

  it("holds particles at their spawn point before they start moving", () => {
    const spawnTimes: number[] = [];
    const held = getParticles(
      {
        ...emitter,
        hold: 500,
        spawn: (random: () => number, spawnTime: number) => {
          spawnTimes.push(spawnTime);
          return emitter.spawn(random);
        },
      },
      2000,
    );
    expect(held.map((particle) => particle.isHeld)).toEqual([false, false, true, true]);
    expect(held[1]?.y).toBe(0);
    expect(held[0]?.y).toBeCloseTo(0.5 * 10 * 0.25 ** 2);
    expect(spawnTimes).toEqual([1250, 1500, 1750, 2000]);
  });
});
