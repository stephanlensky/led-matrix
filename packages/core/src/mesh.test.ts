import { describe, expect, it } from "vitest";
import {
  type Mesh,
  type Vector,
  addBox,
  addCone,
  addEllipsoid,
  createMesh,
  createRaster,
  drawMesh,
  subtract,
} from "./mesh.ts";

function getInwardTriangleCount(mesh: Mesh): number {
  const origin: Vector = [0, 0, 0];
  return mesh.triangles.filter(([a, b, c]) => {
    const positionA = mesh.positions[a] ?? origin;
    const [ux, uy, uz] = subtract(mesh.positions[b] ?? origin, positionA);
    const [vx, vy, vz] = subtract(mesh.positions[c] ?? origin, positionA);
    const [nx, ny, nz] = [a, b, c]
      .map((index) => mesh.normals[index] ?? origin)
      .reduce(([sx, sy, sz], [x, y, z]) => [sx + x, sy + y, sz + z], origin);
    return (uy * vz - uz * vy) * nx + (uz * vx - ux * vz) * ny + (ux * vy - uy * vx) * nz < -1e-9;
  }).length;
}

function getDrawnSamples(mesh: Mesh): number {
  const raster = createRaster(1);
  drawMesh(raster, mesh, {
    project: ([x, y, z]) => [32 + x * 20, 32 - y * 20, z],
    getShade: () => 1,
    getColor: () => [255, 255, 255],
  });
  return raster.depth.filter((depth) => depth > -Infinity).length;
}

describe("mesh winding", () => {
  it("winds ellipsoid triangles counterclockwise from outside", () => {
    const mesh = createMesh();
    addEllipsoid(mesh, [0, 0, 0], [1, 2, 3], "body");
    expect(getInwardTriangleCount(mesh)).toBe(0);
  });

  it("winds box triangles counterclockwise from outside", () => {
    const mesh = createMesh();
    addBox(mesh, [0, 0, 0], [1, 2, 3], "body");
    expect(getInwardTriangleCount(mesh)).toBe(0);
  });

  it("winds cone triangles counterclockwise from outside", () => {
    const mesh = createMesh();
    addCone(mesh, [0, 0, 0], [0, 1, 0], [0.5, 0.5], "ear");
    expect(getInwardTriangleCount(mesh)).toBe(0);
  });
});

describe("back-face culling", () => {
  it("skips triangles facing away from the camera", () => {
    const mesh = createMesh();
    mesh.positions.push([0, 0, 0], [1, 0, 0], [0, 1, 0]);
    mesh.normals.push([0, 0, 1], [0, 0, 1], [0, 0, 1]);
    mesh.triangles.push([0, 1, 2, "front"]);
    expect(getDrawnSamples(mesh)).toBeGreaterThan(0);
    mesh.triangles[0] = [0, 2, 1, "back"];
    expect(getDrawnSamples(mesh)).toBe(0);
  });

  it("draws double-sided triangles from both sides", () => {
    const mesh = createMesh();
    mesh.positions.push([0, 0, 0], [1, 0, 0], [0, 1, 0]);
    mesh.normals.push([0, 0, 1], [0, 0, 1], [0, 0, 1]);
    mesh.triangles.push([0, 2, 1, "back", true]);
    expect(getDrawnSamples(mesh)).toBeGreaterThan(0);
  });
});
