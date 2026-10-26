import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { type Color, HEIGHT, RGBA_CHANNELS, WIDTH } from "../frame.ts";
import { easings } from "../keyframes.ts";

type Vector = [x: number, y: number, z: number];

type Material = "fur" | "eye";

type Mesh = {
  positions: Vector[];
  normals: Vector[];
  triangles: [a: number, b: number, c: number, material: Material][];
};

const SAMPLES = 3;
const SAMPLE_WIDTH = WIDTH * SAMPLES;
const SAMPLE_HEIGHT = HEIGHT * SAMPLES;
const CAMERA_DISTANCE = 6;
const MODEL_CENTER: Vector = [0, 0.2, 0];
const EYES_CENTER: Vector = [0, 0.68, 1.08];
const MAX_ZOOM = 10;
const LIGHT = normalize([-0.4, 0.6, 0.7]);

function normalize([x, y, depth]: Vector): Vector {
  const length = Math.hypot(x, y, depth) || 1;
  return [x / length, y / length, depth / length];
}

function subtract([ax, ay, az]: Vector, [bx, by, bz]: Vector): Vector {
  return [ax - bx, ay - by, az - bz];
}

function addEllipsoid(
  mesh: Mesh,
  [cx, cy, cz]: Vector,
  [rx, ry, rz]: Vector,
  material: Material,
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

function addCone(
  mesh: Mesh,
  [bx, by, bz]: Vector,
  apex: Vector,
  [rx, rz]: [x: number, z: number],
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
    mesh.triangles.push([start, start + 1 + segment, start + 1 + next, "fur"]);
  }
}

function createCatMesh(): Mesh {
  const mesh: Mesh = { positions: [], normals: [], triangles: [] };
  addEllipsoid(mesh, [0, -0.1, -0.2], [0.55, 0.5, 0.9], "fur");
  addEllipsoid(mesh, [0, 0.62, 0.7], [0.5, 0.44, 0.45], "fur");
  addEllipsoid(mesh, [0, 0.48, 1.0], [0.2, 0.14, 0.16], "fur", 6, 10);
  for (const side of [-1, 1]) {
    addCone(mesh, [side * 0.27, 0.92, 0.66], [side * 0.36, 1.38, 0.64], [0.16, 0.1]);
    addEllipsoid(mesh, [side * 0.2, 0.7, 1.05], [0.1, 0.08, 0.05], "eye", 6, 10);
    for (const legZ of [0.35, -0.7]) {
      addEllipsoid(mesh, [side * 0.3, -0.62, legZ], [0.14, 0.32, 0.14], "fur", 6, 8);
    }
  }
  const tailSegments = 10;
  for (let index = 0; index <= tailSegments; index++) {
    const t = index / tailSegments;
    addEllipsoid(
      mesh,
      [
        0.12 * Math.sin(t * Math.PI),
        -0.1 + 1.1 * t ** 1.4,
        -1.0 - 0.4 * Math.sin(t * Math.PI * 0.8),
      ],
      [0.1, 0.1, 0.1],
      "fur",
      5,
      8,
    );
  }
  return mesh;
}

const catMesh = createCatMesh();

function getRotation(pitch: number, yaw: number, roll: number): (vector: Vector) => Vector {
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

type Camera = {
  rotate: (vector: Vector) => Vector;
  size: number;
  zoom: number;
  zoomProgress: number;
};

function getProjector({ rotate, size, zoom, zoomProgress }: Camera): (vector: Vector) => Vector {
  const project = (vector: Vector): Vector => {
    const [x, y, depth] = rotate(subtract(vector, MODEL_CENTER));
    const perspective = CAMERA_DISTANCE / (CAMERA_DISTANCE - depth);
    return [WIDTH / 2 + size * x * perspective, HEIGHT / 2 - size * y * perspective, depth];
  };
  const [focusX, focusY] = project(EYES_CENTER);
  const centerX = focusX + (WIDTH / 2 - focusX) * zoomProgress;
  const centerY = focusY + (HEIGHT / 2 - focusY) * zoomProgress;
  return (vector) => {
    const [x, y, depth] = project(vector);
    return [
      (centerX + (x - focusX) * zoom) * SAMPLES,
      (centerY + (y - focusY) * zoom) * SAMPLES,
      depth,
    ];
  };
}

function renderCat(samples: Float32Array, camera: Camera, fur: Color, eye: Color): void {
  const depthBuffer = new Float32Array(SAMPLE_WIDTH * SAMPLE_HEIGHT).fill(-Infinity);
  const project = getProjector(camera);
  const projected = catMesh.positions.map(project);
  const shades = catMesh.normals.map((normal) => {
    const [x, y, depth] = camera.rotate(normal);
    const diffuse = Math.max(0, x * LIGHT[0] + y * LIGHT[1] + depth * LIGHT[2]);
    const rim = (1 - Math.abs(depth)) ** 3;
    return 0.3 + 0.8 * diffuse + 0.5 * rim;
  });

  for (const [a, b, c, material] of catMesh.triangles) {
    const [ax, ay, az] = projected[a] ?? [0, 0, 0];
    const [bx, by, bz] = projected[b] ?? [0, 0, 0];
    const [cx, cy, cz] = projected[c] ?? [0, 0, 0];
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < 1e-9) {
      continue;
    }
    const shadeA = shades[a] ?? 0;
    const shadeB = shades[b] ?? 0;
    const shadeC = shades[c] ?? 0;
    const color = material === "eye" ? eye : fur;
    const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const maxX = Math.min(SAMPLE_WIDTH - 1, Math.ceil(Math.max(ax, bx, cx)));
    const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const maxY = Math.min(SAMPLE_HEIGHT - 1, Math.ceil(Math.max(ay, by, cy)));
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
        const index = y * SAMPLE_WIDTH + x;
        if (depth <= (depthBuffer[index] ?? Infinity)) {
          continue;
        }
        depthBuffer[index] = depth;
        const shade =
          material === "eye" ? 1 : weightA * shadeA + weightB * shadeB + weightC * shadeC;
        const offset = index * RGBA_CHANNELS;
        samples[offset] = color[0] * shade;
        samples[offset + 1] = color[1] * shade;
        samples[offset + 2] = color[2] * shade;
        samples[offset + 3] = 1;
      }
    }
  }
}

const EYE_OFFSET = 15.5;
const EYE_HALF_WIDTH = 15;
const EYE_HALF_HEIGHT = 11;
const EYE_SLANT = 0.18;
const PUPIL_HALF_WIDTH = 2.6;
const HIGHLIGHT_RADIUS = 1.8;

function getEyeColor(
  x: number,
  y: number,
  blink: number,
  eye: Color,
  highlight: Color,
): Color | undefined {
  for (const side of [-1, 1]) {
    const dx = x - (WIDTH / 2 + side * EYE_OFFSET);
    const outward = dx * side;
    const dy = y - HEIGHT / 2 + outward * EYE_SLANT;
    const edge = 1 - (dx / EYE_HALF_WIDTH) ** 2;
    if (edge <= 0) {
      continue;
    }
    const halfHeight = EYE_HALF_HEIGHT * edge;
    const top = -halfHeight + 1.6 * halfHeight * blink;
    const bottom = halfHeight - 0.4 * halfHeight * blink;
    if (dy < top || dy > bottom) {
      return undefined;
    }
    if (Math.hypot(dx + 5 * side, dy + 5) < HIGHLIGHT_RADIUS) {
      return highlight;
    }
    const pupil =
      PUPIL_HALF_WIDTH * Math.sqrt(Math.max(0, 1 - (dy / (EYE_HALF_HEIGHT * 0.95)) ** 2));
    if (Math.abs(dx) < pupil) {
      return [0, 0, 0];
    }
    const radius = Math.hypot(dx / EYE_HALF_WIDTH, dy / EYE_HALF_HEIGHT);
    const rim = Math.min(1, (bottom - dy) / 1.5, (dy - top) / 1.5);
    const shade = (1.15 - 0.6 * radius) * (0.4 + 0.6 * rim);
    return [eye[0] * shade, eye[1] * shade, eye[2] * shade];
  }
  return undefined;
}

function renderEyes(
  samples: Float32Array,
  scale: number,
  blink: number,
  eye: Color,
  highlight: Color,
): void {
  for (let y = 0; y < SAMPLE_HEIGHT; y++) {
    const eyeY = HEIGHT / 2 + ((y + 0.5) / SAMPLES - HEIGHT / 2) / scale;
    for (let x = 0; x < SAMPLE_WIDTH; x++) {
      const eyeX = WIDTH / 2 + ((x + 0.5) / SAMPLES - WIDTH / 2) / scale;
      const color = getEyeColor(eyeX, eyeY, blink, eye, highlight) ?? [0, 0, 0];
      const offset = (y * SAMPLE_WIDTH + x) * RGBA_CHANNELS;
      samples[offset] = color[0];
      samples[offset + 1] = color[1];
      samples[offset + 2] = color[2];
      samples[offset + 3] = 1;
    }
  }
}

function getBlink(phase: number, centers: readonly number[], duration: number): number {
  let blink = 0;
  for (const center of centers) {
    const distance = Math.abs(phase - center) / (duration / 2);
    if (distance < 1) {
      blink = Math.max(blink, easings.easeInOutSine(1 - distance));
    }
  }
  return blink;
}

function smoothstep(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export const cat = defineEffect({
  id: "cat",
  name: "Staring cat",
  kind: "pixel",
  params: z.object({
    color: colorSchema.default("#4b1d7a"),
    eyeColor: colorSchema.default("#30e830"),
    highlightColor: colorSchema.default("#e0ffe0"),
    size: z.number().min(6).max(24).default(15),
    turns: z.number().int().min(1).max(16).default(3),
    tiltX: z.number().min(-60).max(60).default(20),
    tiltZ: z.number().min(-60).max(60).default(18),
    stare: z.number().min(0).max(0.9).default(0.4),
    zoom: z.number().min(0.01).max(0.2).default(0.03),
    blink: z.number().min(0.01).max(0.3).default(0.05),
  }),
  render(image, { params, progress }) {
    const fur = parseColor(params.color);
    const eye = parseColor(params.eyeColor);
    const highlight = parseColor(params.highlightColor);
    const stareStart = 1 - params.stare;
    const stareEnd = 1 - params.zoom;
    const eyesStart = stareStart + params.zoom;

    let zoomProgress = 0;
    let eyesMix = 0;
    let eyesScale = 1;
    let blink = 0;
    let spin = 0;
    if (progress < stareStart) {
      spin = (progress / stareStart) * params.turns * Math.PI * 2;
    } else if (progress < eyesStart || progress >= stareEnd) {
      zoomProgress =
        progress < eyesStart
          ? (progress - stareStart) / params.zoom
          : 1 - (progress - stareEnd) / params.zoom;
      eyesMix = smoothstep((zoomProgress - 0.6) / 0.4);
      eyesScale = 0.6 + 0.4 * easings.easeOutCubic(eyesMix);
    } else {
      zoomProgress = 1;
      eyesMix = 1;
      const phase = (progress - eyesStart) / (stareEnd - eyesStart);
      blink = getBlink(phase, [0.45, 0.45 + params.blink * 2.2], params.blink);
    }

    const samples = new Float32Array(SAMPLE_WIDTH * SAMPLE_HEIGHT * RGBA_CHANNELS);
    if (eyesMix < 1) {
      const tilt = 1 - smoothstep(zoomProgress * 2);
      renderCat(
        samples,
        {
          rotate: getRotation(toRadians(params.tiltX) * tilt, spin, toRadians(params.tiltZ) * tilt),
          size: params.size,
          zoom: 1 + (MAX_ZOOM - 1) * easings.easeInCubic(zoomProgress),
          zoomProgress: easings.easeInOutCubic(zoomProgress),
        },
        fur,
        eye,
      );
    }
    if (eyesMix > 0) {
      const eyes = new Float32Array(samples.length);
      renderEyes(eyes, eyesScale, blink, eye, highlight);
      for (let index = 0; index < samples.length; index++) {
        samples[index] = (samples[index] ?? 0) * (1 - eyesMix) + (eyes[index] ?? 0) * eyesMix;
      }
    }

    const count = SAMPLES * SAMPLES;
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        let [r, g, b, a] = [0, 0, 0, 0];
        for (let sampleY = 0; sampleY < SAMPLES; sampleY++) {
          for (let sampleX = 0; sampleX < SAMPLES; sampleX++) {
            const offset =
              ((y * SAMPLES + sampleY) * SAMPLE_WIDTH + x * SAMPLES + sampleX) * RGBA_CHANNELS;
            r += samples[offset] ?? 0;
            g += samples[offset + 1] ?? 0;
            b += samples[offset + 2] ?? 0;
            a += samples[offset + 3] ?? 0;
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
  },
});
