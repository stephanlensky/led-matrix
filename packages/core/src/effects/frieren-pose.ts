import { type Rotation, type Vector, normalize, subtract } from "../mesh.ts";

function dot([ax, ay, az]: Vector, [bx, by, bz]: Vector): number {
  return ax * bx + ay * by + az * bz;
}

function cross([ax, ay, az]: Vector, [bx, by, bz]: Vector): Vector {
  return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}

function add([ax, ay, az]: Vector, [bx, by, bz]: Vector): Vector {
  return [ax + bx, ay + by, az + bz];
}

function multiply([x, y, z]: Vector, amount: number): Vector {
  return [x * amount, y * amount, z * amount];
}

function getLength(vector: Vector): number {
  return Math.hypot(...vector);
}

export function getAlignment(from: Vector, to: Vector): Rotation {
  const a = normalize(from);
  const b = normalize(to);
  const cos = Math.max(-1, Math.min(1, dot(a, b)));
  const axis = cross(a, b);
  const sin = getLength(axis);
  if (sin < 1e-6) {
    return (vector) => vector;
  }
  const k = multiply(axis, 1 / sin);
  return (vector) =>
    add(
      add(multiply(vector, cos), multiply(cross(k, vector), sin)),
      multiply(k, dot(k, vector) * (1 - cos)),
    );
}

export function getLimbRotations(
  root: Vector,
  middle: Vector,
  end: Vector,
  target: Vector,
  pole: Vector,
): [upper: Rotation, lower: Rotation] {
  const upperLength = getLength(subtract(middle, root));
  const lowerLength = getLength(subtract(end, middle));
  const toTarget = subtract(target, root);
  const distance = Math.min(
    upperLength + lowerLength - 1e-4,
    Math.max(Math.abs(upperLength - lowerLength) + 1e-4, getLength(toTarget)),
  );
  const direction = normalize(toTarget);
  const bend = normalize(subtract(pole, multiply(direction, dot(pole, direction))));
  const along = (upperLength ** 2 - lowerLength ** 2 + distance ** 2) / (2 * distance);
  const height = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2));
  const joint = add(add(root, multiply(direction, along)), multiply(bend, height));
  const reach = add(root, multiply(direction, distance));
  const upper = getAlignment(subtract(middle, root), subtract(joint, root));
  const undo = getAlignment(subtract(joint, root), subtract(middle, root));
  const lower = getAlignment(subtract(end, middle), undo(subtract(reach, joint)));
  return [upper, lower];
}
