import { type Color, HEIGHT, RGBA_CHANNELS, type RgbaImage, WIDTH } from "./frame.ts";

export type Vector = [x: number, y: number, z: number];

export type Rotation = (vector: Vector) => Vector;

export type Mesh<M extends string = string> = {
  positions: Vector[];
  normals: Vector[];
  triangles: [a: number, b: number, c: number, material: M, isDoubleSided?: boolean][];
};

export type Raster = {
  samples: number;
  width: number;
  height: number;
  color: Float32Array;
  depth: Float32Array;
};

export type ColorBuffer = [r: number, g: number, b: number];

export type Projector = (position: Vector, out?: Vector) => Vector;

export type MeshDrawing<M extends string> = {
  project: Projector;
  getShade: (normal: Vector) => number;
  getColor: (material: M, position: Vector, shade: number, out: ColorBuffer) => Color;
};

export function normalize([x, y, depth]: Vector): Vector {
  const length = Math.hypot(x, y, depth) || 1;
  return [x / length, y / length, depth / length];
}

export function subtract([ax, ay, az]: Vector, [bx, by, bz]: Vector): Vector {
  return [ax - bx, ay - by, az - bz];
}

export function compose(...rotations: Rotation[]): Rotation {
  return (vector) => rotations.reduceRight((value, rotation) => rotation(value), vector);
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

export type Matrix = [
  m00: number,
  m01: number,
  m02: number,
  m03: number,
  m10: number,
  m11: number,
  m12: number,
  m13: number,
  m20: number,
  m21: number,
  m22: number,
  m23: number,
];

export const IDENTITY_MATRIX: Readonly<Matrix> = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

export function getTranslationMatrix([x, y, z]: Vector): Matrix {
  return [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z];
}

// Rotations are affine, so their images of the origin and the unit axes define them fully.
export function getMatrix(rotation: Rotation): Matrix {
  const [tx, ty, tz] = rotation([0, 0, 0]);
  const [ax, ay, az] = rotation([1, 0, 0]);
  const [bx, by, bz] = rotation([0, 1, 0]);
  const [cx, cy, cz] = rotation([0, 0, 1]);
  return [
    ax - tx,
    bx - tx,
    cx - tx,
    tx,
    ay - ty,
    by - ty,
    cy - ty,
    ty,
    az - tz,
    bz - tz,
    cz - tz,
    tz,
  ];
}

export function getLinearMatrix([
  m00,
  m01,
  m02,
  ,
  m10,
  m11,
  m12,
  ,
  m20,
  m21,
  m22,
]: Readonly<Matrix>): Matrix {
  return [m00, m01, m02, 0, m10, m11, m12, 0, m20, m21, m22, 0];
}

export function multiplyMatrices(...matrices: Readonly<Matrix>[]): Matrix {
  return matrices.reduce<Matrix>(
    (
      [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23],
      [b00, b01, b02, b03, b10, b11, b12, b13, b20, b21, b22, b23],
    ) => [
      a00 * b00 + a01 * b10 + a02 * b20,
      a00 * b01 + a01 * b11 + a02 * b21,
      a00 * b02 + a01 * b12 + a02 * b22,
      a00 * b03 + a01 * b13 + a02 * b23 + a03,
      a10 * b00 + a11 * b10 + a12 * b20,
      a10 * b01 + a11 * b11 + a12 * b21,
      a10 * b02 + a11 * b12 + a12 * b22,
      a10 * b03 + a11 * b13 + a12 * b23 + a13,
      a20 * b00 + a21 * b10 + a22 * b20,
      a20 * b01 + a21 * b11 + a22 * b21,
      a20 * b02 + a21 * b12 + a22 * b22,
      a20 * b03 + a21 * b13 + a22 * b23 + a23,
    ],
    [...IDENTITY_MATRIX],
  );
}

export function getModelMatrix([x, y, z]: Vector, rotate: Rotation): Matrix {
  return multiplyMatrices(getMatrix(rotate), getTranslationMatrix([-x, -y, -z]));
}

export function applyMatrix(
  [m00, m01, m02, m03, m10, m11, m12, m13, m20, m21, m22, m23]: Readonly<Matrix>,
  [x, y, z]: Vector,
): Vector {
  return [
    m00 * x + m01 * y + m02 * z + m03,
    m10 * x + m11 * y + m12 * z + m13,
    m20 * x + m21 * y + m22 * z + m23,
  ];
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
    mesh.triangles.push([start, start + 1 + next, start + 1 + segment, material, true]);
  }
}

const BOX_FACES: readonly [normal: Vector, u: Vector, v: Vector][] = [
  [
    [1, 0, 0],
    [0, 0, -1],
    [0, 1, 0],
  ],
  [
    [-1, 0, 0],
    [0, 0, 1],
    [0, 1, 0],
  ],
  [
    [0, 1, 0],
    [1, 0, 0],
    [0, 0, -1],
  ],
  [
    [0, -1, 0],
    [1, 0, 0],
    [0, 0, 1],
  ],
  [
    [0, 0, 1],
    [1, 0, 0],
    [0, 1, 0],
  ],
  [
    [0, 0, -1],
    [-1, 0, 0],
    [0, 1, 0],
  ],
];

export function addBox<M extends string>(
  mesh: Mesh<M>,
  [cx, cy, cz]: Vector,
  [hx, hy, hz]: Vector,
  material: M,
): void {
  for (const [normal, u, v] of BOX_FACES) {
    const start = mesh.positions.length;
    for (const [su, sv] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      mesh.positions.push([
        cx + (normal[0] + su * u[0] + sv * v[0]) * hx,
        cy + (normal[1] + su * u[1] + sv * v[1]) * hy,
        cz + (normal[2] + su * u[2] + sv * v[2]) * hz,
      ]);
      mesh.normals.push(normal);
    }
    mesh.triangles.push(
      [start, start + 1, start + 2, material],
      [start, start + 2, start + 3, material],
    );
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

let projectedBuffer = new Float64Array(0);
let shadeBuffer = new Float64Array(0);
const projectedVector: Vector = [0, 0, 0];
const samplePosition: Vector = [0, 0, 0];
const sampleColor: ColorBuffer = [0, 0, 0];
const ORIGIN: Vector = [0, 0, 0];

function getSpanStart(weight: number, step: number): number {
  return step > 0 ? Math.ceil(-weight / step) - 1 : -Infinity;
}

function getSpanEnd(weight: number, step: number): number {
  return step < 0 ? Math.floor(weight / -step) + 1 : Infinity;
}

export function drawMesh<M extends string>(
  raster: Raster,
  { positions, normals, triangles }: Mesh<M>,
  { project, getShade, getColor }: MeshDrawing<M>,
): void {
  const { samples, width, height, color: colorBuffer, depth: depthBuffer } = raster;
  if (projectedBuffer.length < positions.length * 3) {
    projectedBuffer = new Float64Array(positions.length * 3);
  }
  if (shadeBuffer.length < normals.length) {
    shadeBuffer = new Float64Array(normals.length);
  }
  const projected = projectedBuffer;
  const shades = shadeBuffer;
  for (let index = 0; index < positions.length; index++) {
    const point = project(positions[index] ?? ORIGIN, projectedVector);
    projected[index * 3] = point[0] * samples;
    projected[index * 3 + 1] = point[1] * samples;
    projected[index * 3 + 2] = point[2];
  }
  for (let index = 0; index < normals.length; index++) {
    shades[index] = getShade(normals[index] ?? ORIGIN);
  }

  for (const triangle of triangles) {
    const a = triangle[0];
    const b = triangle[1];
    const c = triangle[2];
    const ax = projected[a * 3] ?? 0;
    const ay = projected[a * 3 + 1] ?? 0;
    const az = projected[a * 3 + 2] ?? 0;
    const bx = projected[b * 3] ?? 0;
    const by = projected[b * 3 + 1] ?? 0;
    const bz = projected[b * 3 + 2] ?? 0;
    const cx = projected[c * 3] ?? 0;
    const cy = projected[c * 3 + 1] ?? 0;
    const cz = projected[c * 3 + 2] ?? 0;
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < 1e-9 || (area > 0 && !triangle[4])) {
      continue;
    }
    const material = triangle[3];
    const positionA = positions[a] ?? ORIGIN;
    const positionB = positions[b] ?? ORIGIN;
    const positionC = positions[c] ?? ORIGIN;
    const pax = positionA[0];
    const pay = positionA[1];
    const paz = positionA[2];
    const pbx = positionB[0];
    const pby = positionB[1];
    const pbz = positionB[2];
    const pcx = positionC[0];
    const pcy = positionC[1];
    const pcz = positionC[2];
    const shadeA = shades[a] ?? 0;
    const shadeB = shades[b] ?? 0;
    const shadeC = shades[c] ?? 0;
    const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(ax, bx, cx)));
    const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(ay, by, cy)));
    const stepA = (by - cy) / area;
    const stepB = (cy - ay) / area;
    const stepC = -stepA - stepB;
    const centerX = minX + 0.5;
    for (let y = minY; y <= maxY; y++) {
      const py = y + 0.5;
      const rowA = ((bx - centerX) * (cy - py) - (by - py) * (cx - centerX)) / area;
      const rowB = ((cx - centerX) * (ay - py) - (cy - py) * (ax - centerX)) / area;
      const rowC = 1 - rowA - rowB;
      const startX = Math.max(
        minX,
        minX + getSpanStart(rowA, stepA),
        minX + getSpanStart(rowB, stepB),
        minX + getSpanStart(rowC, stepC),
      );
      const endX = Math.min(
        maxX,
        minX + getSpanEnd(rowA, stepA),
        minX + getSpanEnd(rowB, stepB),
        minX + getSpanEnd(rowC, stepC),
      );
      const px = startX + 0.5;
      let weightA = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area;
      let weightB = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area;
      let isInside = false;
      for (let x = startX; x <= endX; x++, weightA += stepA, weightB += stepB) {
        const weightC = 1 - weightA - weightB;
        if (weightA < 0 || weightB < 0 || weightC < 0) {
          if (isInside) {
            break;
          }
          continue;
        }
        isInside = true;
        const depth = weightA * az + weightB * bz + weightC * cz;
        const index = y * width + x;
        if (depth <= (depthBuffer[index] ?? Infinity)) {
          continue;
        }
        depthBuffer[index] = depth;
        samplePosition[0] = weightA * pax + weightB * pbx + weightC * pcx;
        samplePosition[1] = weightA * pay + weightB * pby + weightC * pcy;
        samplePosition[2] = weightA * paz + weightB * pbz + weightC * pcz;
        const shade = weightA * shadeA + weightB * shadeB + weightC * shadeC;
        const color = getColor(material, samplePosition, shade, sampleColor);
        const offset = index * RGBA_CHANNELS;
        colorBuffer[offset] = color[0];
        colorBuffer[offset + 1] = color[1];
        colorBuffer[offset + 2] = color[2];
        colorBuffer[offset + 3] = 1;
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
