import { type Color, HEIGHT, RGBA_CHANNELS, type RgbaImage, WIDTH } from "./frame.ts";

export type Vector = [x: number, y: number, z: number];

export type Rotation = (vector: Vector) => Vector;

export type Mesh<M extends string = string> = {
  positions: Vector[];
  normals: Vector[];
  triangles: [a: number, b: number, c: number, material: M][];
};

export type Raster = {
  samples: number;
  width: number;
  height: number;
  color: Float32Array;
  depth: Float32Array;
};

export type MeshDrawing<M extends string> = {
  project: (position: Vector) => Vector;
  getShade: (normal: Vector) => number;
  getColor: (material: M, position: Vector, shade: number) => Color;
};

export function normalize([x, y, depth]: Vector): Vector {
  const length = Math.hypot(x, y, depth) || 1;
  return [x / length, y / length, depth / length];
}

export function subtract([ax, ay, az]: Vector, [bx, by, bz]: Vector): Vector {
  return [ax - bx, ay - by, az - bz];
}

export function getRotation(pitch: number, yaw: number, roll: number): Rotation {
  const [sinX, cosX] = [Math.sin(pitch), Math.cos(pitch)];
  const [sinY, cosY] = [Math.sin(yaw), Math.cos(yaw)];
  const [sinZ, cosZ] = [Math.sin(roll), Math.cos(roll)];
  return ([x, y, depth]) => {
    const x1 = x * cosY + depth * sinY;
    const z1 = -x * sinY + depth * cosY;
    const y2 = y * cosX - z1 * sinX;
    const z2 = y * sinX + z1 * cosX;
    return [x1 * cosZ - y2 * sinZ, x1 * sinZ + y2 * cosZ, z2];
  };
}

export function createMesh<M extends string>(): Mesh<M> {
  return { positions: [], normals: [], triangles: [] };
}

export function addEllipsoid<M extends string>(
  mesh: Mesh<M>,
  [cx, cy, cz]: Vector,
  [rx, ry, rz]: Vector,
  material: M,
  rings = 8,
  segments = 12,
): void {
  const start = mesh.positions.length;
  for (let ring = 0; ring <= rings; ring++) {
    const theta = (ring / rings) * Math.PI;
    for (let segment = 0; segment < segments; segment++) {
      const phi = (segment / segments) * Math.PI * 2;
      const x = Math.sin(theta) * Math.cos(phi);
      const y = Math.cos(theta);
      const depth = Math.sin(theta) * Math.sin(phi);
      mesh.positions.push([cx + x * rx, cy + y * ry, cz + depth * rz]);
      mesh.normals.push(normalize([x / rx, y / ry, depth / rz]));
    }
  }
  for (let ring = 0; ring < rings; ring++) {
    for (let segment = 0; segment < segments; segment++) {
      const next = (segment + 1) % segments;
      const a = start + ring * segments + segment;
      const b = start + ring * segments + next;
      const c = start + (ring + 1) * segments + segment;
      const d = start + (ring + 1) * segments + next;
      mesh.triangles.push([a, b, c, material], [b, d, c, material]);
    }
  }
}

export function addCone<M extends string>(
  mesh: Mesh<M>,
  [bx, by, bz]: Vector,
  apex: Vector,
  [rx, rz]: [x: number, z: number],
  material: M,
  segments = 8,
): void {
  const start = mesh.positions.length;
  const height = apex[1] - by;
  mesh.positions.push(apex);
  mesh.normals.push([0, 1, 0]);
  for (let segment = 0; segment < segments; segment++) {
    const phi = (segment / segments) * Math.PI * 2;
    const x = Math.cos(phi);
    const depth = Math.sin(phi);
    mesh.positions.push([bx + x * rx, by, bz + depth * rz]);
    mesh.normals.push(normalize([x * height, (rx + rz) / 2, depth * height]));
  }
  for (let segment = 0; segment < segments; segment++) {
    const next = (segment + 1) % segments;
    mesh.triangles.push([start, start + 1 + segment, start + 1 + next, material]);
  }
}

export function createRaster(samples = 3): Raster {
  const width = WIDTH * samples;
  const height = HEIGHT * samples;
  return {
    samples,
    width,
    height,
    color: new Float32Array(width * height * RGBA_CHANNELS),
    depth: new Float32Array(width * height).fill(-Infinity),
  };
}

export function setRasterSample(raster: Raster, index: number, [r, g, b]: Color): void {
  const offset = index * RGBA_CHANNELS;
  raster.color[offset] = r;
  raster.color[offset + 1] = g;
  raster.color[offset + 2] = b;
  raster.color[offset + 3] = 1;
}

export function drawMesh<M extends string>(
  raster: Raster,
  mesh: Mesh<M>,
  { project, getShade, getColor }: MeshDrawing<M>,
): void {
  const projected = mesh.positions.map((position): Vector => {
    const [x, y, depth] = project(position);
    return [x * raster.samples, y * raster.samples, depth];
  });
  const shades = mesh.normals.map(getShade);

  for (const [a, b, c, material] of mesh.triangles) {
    const [ax, ay, az] = projected[a] ?? [0, 0, 0];
    const [bx, by, bz] = projected[b] ?? [0, 0, 0];
    const [cx, cy, cz] = projected[c] ?? [0, 0, 0];
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < 1e-9) {
      continue;
    }
    const origin: Vector = [0, 0, 0];
    const positionA = mesh.positions[a] ?? origin;
    const positionB = mesh.positions[b] ?? origin;
    const positionC = mesh.positions[c] ?? origin;
    const shadeA = shades[a] ?? 0;
    const shadeB = shades[b] ?? 0;
    const shadeC = shades[c] ?? 0;
    const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const maxX = Math.min(raster.width - 1, Math.ceil(Math.max(ax, bx, cx)));
    const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const maxY = Math.min(raster.height - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = minY; y <= maxY; y++) {
      const py = y + 0.5;
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const weightA = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area;
        const weightB = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area;
        const weightC = 1 - weightA - weightB;
        if (weightA < 0 || weightB < 0 || weightC < 0) {
          continue;
        }
        const depth = weightA * az + weightB * bz + weightC * cz;
        const index = y * raster.width + x;
        if (depth <= (raster.depth[index] ?? Infinity)) {
          continue;
        }
        raster.depth[index] = depth;
        const position: Vector = [
          weightA * positionA[0] + weightB * positionB[0] + weightC * positionC[0],
          weightA * positionA[1] + weightB * positionB[1] + weightC * positionC[1],
          weightA * positionA[2] + weightB * positionB[2] + weightC * positionC[2],
        ];
        const shade = weightA * shadeA + weightB * shadeB + weightC * shadeC;
        setRasterSample(raster, index, getColor(material, position, shade));
      }
    }
  }
}

export function resolveRaster(raster: Raster, image: RgbaImage): void {
  const { samples, width, color } = raster;
  const count = samples * samples;
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      let [r, g, b, a] = [0, 0, 0, 0];
      for (let sampleY = 0; sampleY < samples; sampleY++) {
        for (let sampleX = 0; sampleX < samples; sampleX++) {
          const offset = ((y * samples + sampleY) * width + x * samples + sampleX) * RGBA_CHANNELS;
          r += color[offset] ?? 0;
          g += color[offset + 1] ?? 0;
          b += color[offset + 2] ?? 0;
          a += color[offset + 3] ?? 0;
        }
      }
      if (a === 0) {
        continue;
      }
      const offset = (y * WIDTH + x) * RGBA_CHANNELS;
      image[offset] = r / a;
      image[offset + 1] = g / a;
      image[offset + 2] = b / a;
      image[offset + 3] = (a / count) * 255;
    }
  }
}

export function compositeRaster(raster: Raster, image: RgbaImage): void {
  const { samples, width, color } = raster;
  const count = samples * samples;
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      let [r, g, b, a] = [0, 0, 0, 0];
      for (let sampleY = 0; sampleY < samples; sampleY++) {
        for (let sampleX = 0; sampleX < samples; sampleX++) {
          const offset = ((y * samples + sampleY) * width + x * samples + sampleX) * RGBA_CHANNELS;
          r += color[offset] ?? 0;
          g += color[offset + 1] ?? 0;
          b += color[offset + 2] ?? 0;
          a += color[offset + 3] ?? 0;
        }
      }
      if (a === 0) {
        continue;
      }
      const coverage = a / count;
      const offset = (y * WIDTH + x) * RGBA_CHANNELS;
      const below = (image[offset + 3] ?? 0) / 255;
      const alpha = coverage + below * (1 - coverage);
      for (const [channel, value] of [r, g, b].entries()) {
        image[offset + channel] =
          ((value / a) * coverage + (image[offset + channel] ?? 0) * below * (1 - coverage)) /
          alpha;
      }
      image[offset + 3] = alpha * 255;
    }
  }
}

export function fillRasterCircle(
  raster: Raster,
  centerX: number,
  centerY: number,
  radius: number,
  color: Color,
): void {
  const { samples } = raster;
  const minX = Math.max(0, Math.floor((centerX - radius) * samples));
  const maxX = Math.min(raster.width - 1, Math.ceil((centerX + radius) * samples));
  const minY = Math.max(0, Math.floor((centerY - radius) * samples));
  const maxY = Math.min(raster.height - 1, Math.ceil((centerY + radius) * samples));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (Math.hypot((x + 0.5) / samples - centerX, (y + 0.5) / samples - centerY) <= radius) {
        setRasterSample(raster, y * raster.width + x, color);
      }
    }
  }
}
