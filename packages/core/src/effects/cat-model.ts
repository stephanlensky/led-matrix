import type { Color } from "../frame.ts";
import {
  type Raster,
  type Rotation,
  type Vector,
  addCone,
  addEllipsoid,
  createMesh,
  drawMesh,
  normalize,
  subtract,
} from "../mesh.ts";

type CatPart = "body" | "head" | "muzzle" | "ear" | "leg" | "tail" | "eye";

export type Coat = (part: CatPart, position: Vector, shade: number) => Color;

export type CatPlacement = {
  x: number;
  y: number;
  size: number;
  rotate: Rotation;
  zoom?: number;
  zoomProgress?: number;
  flash?: number;
};

const CAMERA_DISTANCE = 6;
const MODEL_CENTER: Vector = [0, 0.2, 0];
const EYES_CENTER: Vector = [0, 0.68, 1.08];
const LIGHT = normalize([-0.4, 0.6, 0.7]);

function createCatMesh() {
  const mesh = createMesh<CatPart>();
  addEllipsoid(mesh, [0, -0.1, -0.2], [0.55, 0.5, 0.9], "body");
  addEllipsoid(mesh, [0, 0.62, 0.7], [0.5, 0.44, 0.45], "head");
  addEllipsoid(mesh, [0, 0.48, 1.0], [0.2, 0.14, 0.16], "muzzle", 6, 10);
  for (const side of [-1, 1]) {
    addCone(mesh, [side * 0.27, 0.92, 0.66], [side * 0.36, 1.38, 0.64], [0.16, 0.1], "ear");
    addEllipsoid(mesh, [side * 0.2, 0.7, 1.05], [0.1, 0.08, 0.05], "eye", 6, 10);
    for (const legZ of [0.35, -0.7]) {
      addEllipsoid(mesh, [side * 0.3, -0.62, legZ], [0.14, 0.32, 0.14], "leg", 6, 8);
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
      "tail",
      5,
      8,
    );
  }
  return mesh;
}

const catMesh = createCatMesh();

function scale([r, g, b]: Color, amount: number): Color {
  return [r * amount, g * amount, b * amount];
}

function mix([ar, ag, ab]: Color, [br, bg, bb]: Color, amount: number): Color {
  return [ar + (br - ar) * amount, ag + (bg - ag) * amount, ab + (bb - ab) * amount];
}

function getStripe(phase: number, width: number): number {
  const distance = Math.abs((((phase % 1) + 1) % 1) - 0.5) * 2;
  return Math.min(1, Math.max(0, (width - distance) / 0.15 + 0.5));
}

export function getSolidCoat(fur: Color, eye: Color): Coat {
  return (part, _position, shade) => (part === "eye" ? eye : scale(fur, shade));
}

export function getTabbyCoat(fur: Color, stripe: Color, light: Color, eye: Color): Coat {
  return (part, [x, y, z], shade) => {
    if (part === "eye") {
      return eye;
    }
    let amount = 0;
    let base = fur;
    if (part === "body") {
      const dorsal = Math.abs(x) < 0.13 && y > 0.25 ? 1 : 0;
      const sides = getStripe(z * 2.6 + (0.4 - y) * 0.35, 0.28) * Math.min(1, (y + 0.45) * 3);
      amount = Math.max(dorsal, sides);
      base = mix(fur, light, Math.min(1, Math.max(0, (-0.35 - y) * 4)));
    } else if (part === "head") {
      const isFront = z > 0.85 && y > 0.7;
      amount = isFront
        ? getStripe(x * 5 + 0.5, 0.3) * Math.min(1, (y - 0.7) * 6)
        : Math.abs(x) > 0.3 && z > 0.6
          ? getStripe(y * 5.5, 0.3)
          : getStripe(x * 4 + 0.5, 0.25) * (z < 0.75 ? 1 : 0);
    } else if (part === "muzzle") {
      base = light;
    } else if (part === "ear") {
      amount = 0.6;
    } else if (part === "leg") {
      amount = getStripe(y * 4.5, 0.3);
    } else if (part === "tail") {
      amount = y > 0.85 ? 1 : getStripe(y * 4, 0.35);
    }
    return scale(mix(base, stripe, amount), shade);
  };
}

export function getCatProjector({
  x: centerX,
  y: centerY,
  size,
  rotate,
  zoom = 1,
  zoomProgress = 0,
}: CatPlacement): (vector: Vector) => Vector {
  const project = (vector: Vector): Vector => {
    const [x, y, depth] = rotate(subtract(vector, MODEL_CENTER));
    const perspective = CAMERA_DISTANCE / (CAMERA_DISTANCE - depth);
    return [centerX + size * x * perspective, centerY - size * y * perspective, depth];
  };
  const [focusX, focusY] = project(EYES_CENTER);
  const zoomX = focusX + (centerX - focusX) * zoomProgress;
  const zoomY = focusY + (centerY - focusY) * zoomProgress;
  return (vector) => {
    const [x, y, depth] = project(vector);
    return [zoomX + (x - focusX) * zoom, zoomY + (y - focusY) * zoom, depth];
  };
}

export function drawCat(raster: Raster, placement: CatPlacement, coat: Coat): void {
  const flash = placement.flash ?? 0;
  drawMesh(raster, catMesh, {
    project: getCatProjector(placement),
    getShade: (normal) => {
      const [x, y, depth] = placement.rotate(normal);
      const diffuse = Math.max(0, x * LIGHT[0] + y * LIGHT[1] + depth * LIGHT[2]);
      const rim = (1 - Math.abs(depth)) ** 3;
      return 0.3 + 0.8 * diffuse + 0.5 * rim;
    },
    getColor: (part, position, shade) => mix(coat(part, position, shade), [255, 255, 255], flash),
  });
}
