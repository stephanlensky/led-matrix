import { describe, expect, it } from "vitest";
import { createPlaneProjection } from "./projection.ts";

describe("plane projection", () => {
  it("maps screen points one to one without rotation", () => {
    const point = createPlaneProjection({ x: 0, y: 0, z: 0 }, 100).getPoint(10, -5);
    expect(point?.u).toBeCloseTo(10);
    expect(point?.v).toBeCloseTo(-5);
  });

  it("rotates around the view axis", () => {
    const point = createPlaneProjection({ x: 0, y: 0, z: Math.PI / 2 }, 100).getPoint(10, 0);
    expect(point?.u).toBeCloseTo(0);
    expect(point?.v).toBeCloseTo(-10);
  });

  it("shows the back of the plane after half a turn", () => {
    const point = createPlaneProjection({ x: 0, y: Math.PI, z: 0 }, 100).getPoint(10, 0);
    expect(point?.u).toBeCloseTo(-10);
    expect(point?.facing).toBeLessThan(0);
  });

  it("returns nothing when the plane is edge on", () => {
    expect(
      createPlaneProjection({ x: 0, y: Math.PI / 2, z: 0 }, 100).getPoint(0, 0),
    ).toBeUndefined();
  });
});
