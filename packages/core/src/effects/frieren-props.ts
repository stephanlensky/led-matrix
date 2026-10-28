import { type Mesh, type Vector, addBox, addEllipsoid, createMesh, normalize } from "../mesh.ts";
import type { PropPart } from "./frieren-model.ts";

export const CHEST_HALF: Vector = [0.48, 0.32, 0.66];
const WALL = 0.05;
const TOOTH_RADIUS: Vector = [0.045, 0.11, 0.045];

function addHalfCylinder(
  mesh: Mesh<PropPart>,
  [cx, cy, cz]: Vector,
  [rx, ry, hz]: Vector,
  material: PropPart,
  segments = 10,
): void {
  const start = mesh.positions.length;
  for (let segment = 0; segment <= segments; segment++) {
    const angle = (segment / segments) * Math.PI;
    const x = -Math.cos(angle);
    const y = Math.sin(angle);
    for (const z of [-1, 1]) {
      mesh.positions.push([cx + x * rx, cy + y * ry, cz + z * hz]);
      mesh.normals.push(normalize([x / rx, y / ry, 0]));
    }
  }
  for (let segment = 0; segment < segments; segment++) {
    const a = start + segment * 2;
    mesh.triangles.push([a, a + 1, a + 3, material], [a, a + 3, a + 2, material]);
  }
  for (const z of [-1, 1]) {
    const center = mesh.positions.length;
    mesh.positions.push([cx, cy, cz + z * hz]);
    mesh.normals.push([0, 0, z]);
    for (let segment = 0; segment <= segments; segment++) {
      const angle = (segment / segments) * Math.PI;
      mesh.positions.push([cx - Math.cos(angle) * rx, cy + Math.sin(angle) * ry, cz + z * hz]);
      mesh.normals.push([0, 0, z]);
    }
    for (let segment = 0; segment < segments; segment++) {
      mesh.triangles.push([center, center + 1 + segment, center + 2 + segment, material]);
    }
  }
}

export function createChestMesh(): Mesh<PropPart> {
  const mesh = createMesh<PropPart>();
  const [hx, hy, hz] = CHEST_HALF;
  addBox(mesh, [hx - WALL, 0, 0], [WALL, hy, hz], "chest");
  addBox(mesh, [-hx + WALL, 0, 0], [WALL, hy, hz], "chest");
  for (const side of [-1, 1]) {
    addBox(mesh, [0, 0, side * (hz - WALL)], [hx, hy, WALL], "chest");
    for (const end of [-1, 1]) {
      addBox(
        mesh,
        [end * (hx - 0.02), 0, side * (hz - 0.02)],
        [0.05, hy + 0.01, 0.05],
        "chestTrim",
      );
    }
    addBox(mesh, [hx + 0.005, 0, side * hz * 0.45], [0.02, hy, 0.04], "chestTrim");
  }
  addBox(mesh, [0, -hy + WALL, 0], [hx, WALL, hz], "mouth");
  addBox(mesh, [hx + 0.005, hy - 0.03, 0], [0.025, 0.035, hz + 0.01], "chestTrim");
  addBox(mesh, [hx + 0.005, -hy + 0.03, 0], [0.025, 0.035, hz + 0.01], "chestTrim");
  addBox(mesh, [0, -hy + 0.12, 0], [hx - WALL * 2, 0.06, hz - WALL * 2], "mouth");
  addEllipsoid(mesh, [0.05, -hy + 0.2, 0], [0.28, 0.06, 0.24], "tongue", 5, 10);
  const teeth = 5;
  for (let index = 0; index < teeth; index++) {
    const z = -hz + 0.14 + (index / (teeth - 1)) * (hz * 2 - 0.28);
    addEllipsoid(mesh, [hx - WALL, hy + 0.06, z], TOOTH_RADIUS, "tooth", 4, 6);
  }
  for (const side of [-1, 1]) {
    for (const x of [0.15, -0.1]) {
      addEllipsoid(mesh, [x, hy + 0.06, side * (hz - WALL)], TOOTH_RADIUS, "tooth", 4, 6);
    }
  }
  return mesh;
}

export function createLidMesh(): Mesh<PropPart> {
  const mesh = createMesh<PropPart>();
  const [hx, , hz] = CHEST_HALF;
  const depth = hx * 2;
  addHalfCylinder(mesh, [hx, 0, 0], [hx, 0.2, hz], "chest");
  addBox(mesh, [hx, 0.005, 0], [hx - 0.02, 0.01, hz - 0.02], "mouth");
  for (const t of [0.22, 0.78]) {
    const angle = t * Math.PI;
    addBox(
      mesh,
      [hx - Math.cos(angle) * hx, Math.sin(angle) * 0.2, 0],
      [0.04, 0.04, hz + 0.015],
      "chestTrim",
    );
  }
  const teeth = 6;
  for (let index = 0; index < teeth; index++) {
    const z = -hz + 0.1 + (index / (teeth - 1)) * (hz * 2 - 0.2);
    const length = index % 2 === 0 ? 1.3 : 1;
    addEllipsoid(
      mesh,
      [depth - WALL, -0.07 * length, z],
      [TOOTH_RADIUS[0], TOOTH_RADIUS[1] * length, TOOTH_RADIUS[2]],
      "tooth",
      4,
      6,
    );
  }
  for (const side of [-1, 1]) {
    for (const x of [0.25, 0.5]) {
      addEllipsoid(mesh, [x, -0.07, side * (hz - WALL)], TOOTH_RADIUS, "tooth", 4, 6);
    }
  }
  return mesh;
}

export function createDanglingHairMesh(sway: number): Mesh<PropPart> {
  const mesh = createMesh<PropPart>();
  const segments = 10;
  for (const side of [-1, 1]) {
    for (let index = 0; index <= segments; index++) {
      const t = index / segments;
      const radius = 0.075 - 0.035 * t;
      addEllipsoid(
        mesh,
        [
          0.06 + 0.12 * Math.sin(Math.min(1, t * 3) * Math.PI * 0.5) + sway * t * t * 0.15,
          0.08 - 0.62 * t ** 1.3,
          side * (0.16 + 0.06 * t) + sway * side * t * 0.05,
        ],
        [radius, radius * 1.2, radius],
        "silverHair",
        4,
        8,
      );
    }
  }
  return mesh;
}

export function createBarbellMesh(
  [cx, cy, cz]: Vector = [0, 0, 0],
  length = 0.95,
  radius = 0.24,
): Mesh<PropPart> {
  const mesh = createMesh<PropPart>();
  addEllipsoid(mesh, [cx, cy, cz], [length, 0.03, 0.03], "metal", 4, 16);
  for (const side of [-1, 1]) {
    const plate = (offset: number, size: Vector, part: PropPart) =>
      addEllipsoid(mesh, [cx + side * (length - offset), cy, cz], size, part, 6, 12);
    plate(0.24, [0.05, radius, radius], "plate");
    plate(0.13, [0.04, radius * 0.75, radius * 0.75], "smallPlate");
    plate(0.33, [0.03, 0.06, 0.06], "metal");
  }
  return mesh;
}

export function createBenchMesh(): Mesh<PropPart> {
  const mesh = createMesh<PropPart>();
  addBox(mesh, [0, -0.1, -0.15], [0.26, 0.06, 0.85], "cushion");
  for (const z of [-0.8, 0.5]) {
    addBox(mesh, [0, -0.42, z], [0.2, 0.26, 0.04], "metal");
    addBox(mesh, [0, -0.66, z], [0.3, 0.03, 0.08], "metal");
  }
  for (const side of [-1, 1]) {
    addBox(mesh, [side * 0.62, 0.05, -0.75], [0.03, 0.75, 0.03], "metal");
    addBox(mesh, [side * 0.62, -0.68, -0.75], [0.08, 0.02, 0.14], "metal");
    addBox(mesh, [side * 0.62, 0.62, -0.68], [0.04, 0.02, 0.07], "metal");
  }
  return mesh;
}

export function createBedMesh(): Mesh<PropPart> {
  const mesh = createMesh<PropPart>();
  addBox(mesh, [0, -0.3, 0], [0.75, 0.08, 1.3], "wood");
  addBox(mesh, [0, -0.12, 0], [0.7, 0.1, 1.25], "sheet");
  addBox(mesh, [0, 0.05, -1.32], [0.78, 0.5, 0.06], "darkWood");
  addBox(mesh, [0, -0.15, 1.32], [0.78, 0.3, 0.06], "darkWood");
  for (const x of [-0.72, 0.72]) {
    for (const z of [-1.28, 1.28]) {
      addBox(mesh, [x, -0.5, z], [0.06, 0.2, 0.06], "darkWood");
    }
  }
  addEllipsoid(mesh, [0, 0.02, -0.98], [0.5, 0.12, 0.24], "pillow", 6, 12);
  return mesh;
}

export function createBlanketMesh(height: number): Mesh<PropPart> {
  const mesh = createMesh<PropPart>();
  addHalfCylinder(mesh, [0, -0.05, 0.3], [0.72, height, 0.85], "blanket");
  addHalfCylinder(mesh, [0, -0.05, -0.52], [0.73, height + 0.01, 0.07], "blanketTrim");
  return mesh;
}
