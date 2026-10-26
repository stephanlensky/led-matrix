export type PlaneRotation = {
  x: number;
  y: number;
  z: number;
};

export type PlanePoint = {
  u: number;
  v: number;
  facing: number;
};

type Vector = [x: number, y: number, z: number];

export type PlaneProjection = {
  normal: Vector;
  getPoint(x: number, y: number): PlanePoint | undefined;
};

type Matrix = [Vector, Vector, Vector];

function multiply(
  [[a00, a01, a02], [a10, a11, a12], [a20, a21, a22]]: Matrix,
  [[b00, b01, b02], [b10, b11, b12], [b20, b21, b22]]: Matrix,
): Matrix {
  return [
    [
      a00 * b00 + a01 * b10 + a02 * b20,
      a00 * b01 + a01 * b11 + a02 * b21,
      a00 * b02 + a01 * b12 + a02 * b22,
    ],
    [
      a10 * b00 + a11 * b10 + a12 * b20,
      a10 * b01 + a11 * b11 + a12 * b21,
      a10 * b02 + a11 * b12 + a12 * b22,
    ],
    [
      a20 * b00 + a21 * b10 + a22 * b20,
      a20 * b01 + a21 * b11 + a22 * b21,
      a20 * b02 + a21 * b12 + a22 * b22,
    ],
  ];
}

function getRotationMatrix({ x, y, z }: PlaneRotation): Matrix {
  const rotationX: Matrix = [
    [1, 0, 0],
    [0, Math.cos(x), -Math.sin(x)],
    [0, Math.sin(x), Math.cos(x)],
  ];
  const rotationY: Matrix = [
    [Math.cos(y), 0, Math.sin(y)],
    [0, 1, 0],
    [-Math.sin(y), 0, Math.cos(y)],
  ];
  const rotationZ: Matrix = [
    [Math.cos(z), -Math.sin(z), 0],
    [Math.sin(z), Math.cos(z), 0],
    [0, 0, 1],
  ];
  return multiply(rotationZ, multiply(rotationY, rotationX));
}

export function createPlaneProjection(rotation: PlaneRotation, distance: number): PlaneProjection {
  const [[m00, m01, m02], [m10, m11, m12], [m20, m21, m22]] = getRotationMatrix(rotation);
  return {
    normal: [m02, m12, m22],
    getPoint(x, y) {
      const length = Math.hypot(x, y, distance);
      const alignment = m02 * x + m12 * y + m22 * distance;
      if (Math.abs(alignment) < 1e-6) {
        return undefined;
      }
      const t = (m22 * distance) / alignment;
      if (t <= 0) {
        return undefined;
      }
      const hitX = t * x;
      const hitY = t * y;
      const hitZ = t * distance - distance;
      return {
        u: m00 * hitX + m10 * hitY + m20 * hitZ,
        v: m01 * hitX + m11 * hitY + m21 * hitZ,
        facing: alignment / length,
      };
    },
  };
}
