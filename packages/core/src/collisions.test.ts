import { describe, expect, it } from "vitest";
import { getPathPosition, simulateBodies } from "./collisions.ts";

const bounds = { left: 0, top: 0, right: 64, bottom: 64 };

describe("simulateBodies", () => {
  it("reflects bodies off walls", () => {
    const { paths, collisions } = simulateBodies(
      [{ x: 32, y: 32, vx: 1, vy: 0, radius: 4 }],
      bounds,
      { duration: 40 },
    );
    expect(collisions[0]).toMatchObject({ time: 28, x: 64, y: 32, bodies: [0] });
    expect(getPathPosition(paths[0] ?? [], 38)).toEqual([50, 32]);
  });

  it("exchanges velocity in a head-on collision of equal bodies", () => {
    const { paths, collisions } = simulateBodies(
      [
        { x: 20, y: 32, vx: 1, vy: 0, radius: 5 },
        { x: 44, y: 32, vx: 0, vy: 0, radius: 5 },
      ],
      bounds,
      { duration: 100, bodyCollisions: 1 },
    );
    expect(collisions).toHaveLength(1);
    expect(collisions[0]).toMatchObject({ time: 14, x: 39, y: 32, bodies: [0, 1] });
    expect(paths[1]?.at(-1)).toEqual({ time: 14, x: 44, y: 32 });
  });

  it("keeps bodies inside the bounds", () => {
    const { paths } = simulateBodies(
      [
        { x: 20, y: 20, vx: 0.8, vy: 0.6, radius: 6 },
        { x: 44, y: 40, vx: -0.3, vy: 0.95, radius: 6 },
      ],
      bounds,
      { duration: 500 },
    );
    for (const point of paths.flat()) {
      expect(point.x).toBeGreaterThanOrEqual(6 - 1e-6);
      expect(point.x).toBeLessThanOrEqual(58 + 1e-6);
      expect(point.y).toBeGreaterThanOrEqual(6 - 1e-6);
      expect(point.y).toBeLessThanOrEqual(58 + 1e-6);
    }
  });
});
