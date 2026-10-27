export type Body = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
};

export type Bounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type PathPoint = {
  time: number;
  x: number;
  y: number;
};

export type Collision = {
  time: number;
  x: number;
  y: number;
  bodies: number[];
  incoming: Body[];
};

export type Simulation = {
  paths: PathPoint[][];
  collisions: Collision[];
};

export type SimulationLimits = {
  duration: number;
  bodyCollisions?: number;
};

const EPSILON = 1e-9;

function getWallTime(position: number, velocity: number, min: number, max: number): number {
  if (velocity > EPSILON) {
    return (max - position) / velocity;
  }
  if (velocity < -EPSILON) {
    return (min - position) / velocity;
  }
  return Infinity;
}

function getContactTime(a: Body, b: Body): number {
  const [dx, dy] = [b.x - a.x, b.y - a.y];
  const [dvx, dvy] = [b.vx - a.vx, b.vy - a.vy];
  const approach = dx * dvx + dy * dvy;
  if (approach >= 0) {
    return Infinity;
  }
  const speed = dvx * dvx + dvy * dvy;
  const distance = a.radius + b.radius;
  const discriminant = approach * approach - speed * (dx * dx + dy * dy - distance * distance);
  if (discriminant < 0) {
    return Infinity;
  }
  return Math.max(0, (-approach - Math.sqrt(discriminant)) / speed);
}

export function simulateBodies(
  initial: readonly Body[],
  bounds: Bounds,
  { duration, bodyCollisions = Infinity }: SimulationLimits,
): Simulation {
  const bodies = initial.map((body) => ({ ...body }));
  const paths = bodies.map(({ x, y }) => [{ time: 0, x, y }]);
  const collisions: Collision[] = [];
  let time = 0;
  let bodyCollisionCount = 0;
  let previous: number[] = [];

  while (time < duration && bodyCollisionCount < bodyCollisions) {
    let next = { delay: duration - time, bodies: [] as number[], axis: "" };
    bodies.forEach((body, index) => {
      const wallX = getWallTime(
        body.x,
        body.vx,
        bounds.left + body.radius,
        bounds.right - body.radius,
      );
      const wallY = getWallTime(
        body.y,
        body.vy,
        bounds.top + body.radius,
        bounds.bottom - body.radius,
      );
      if (wallX < next.delay) {
        next = { delay: wallX, bodies: [index], axis: "x" };
      }
      if (wallY < next.delay) {
        next = { delay: wallY, bodies: [index], axis: "y" };
      }
      for (let other = index + 1; other < bodies.length; other++) {
        const contact = getContactTime(body, bodies[other] ?? body);
        const isRepeat = previous.length === 2 && previous[0] === index && previous[1] === other;
        if (contact < next.delay && !(isRepeat && contact < EPSILON)) {
          next = { delay: contact, bodies: [index, other], axis: "" };
        }
      }
    });

    time += next.delay;
    for (const body of bodies) {
      body.x += body.vx * next.delay;
      body.y += body.vy * next.delay;
    }
    if (next.bodies.length === 0) {
      break;
    }
    previous = next.bodies;
    const incoming = bodies.map((body) => ({ ...body }));
    const [first, second] = next.bodies.map((index) => bodies[index]);
    if (!first) {
      break;
    }
    let contact = { x: first.x, y: first.y };
    if (!second) {
      if (next.axis === "x") {
        first.vx = -first.vx;
        contact = {
          x: first.x + Math.sign(incoming[next.bodies[0] ?? 0]?.vx ?? 0) * first.radius,
          y: first.y,
        };
      } else {
        first.vy = -first.vy;
        contact = {
          x: first.x,
          y: first.y + Math.sign(incoming[next.bodies[0] ?? 0]?.vy ?? 0) * first.radius,
        };
      }
    } else {
      const distance = Math.hypot(second.x - first.x, second.y - first.y) || 1;
      const [nx, ny] = [(second.x - first.x) / distance, (second.y - first.y) / distance];
      const impulse = (first.vx - second.vx) * nx + (first.vy - second.vy) * ny;
      first.vx -= impulse * nx;
      first.vy -= impulse * ny;
      second.vx += impulse * nx;
      second.vy += impulse * ny;
      contact = { x: first.x + nx * first.radius, y: first.y + ny * first.radius };
      bodyCollisionCount++;
    }
    for (const index of next.bodies) {
      const body = bodies[index];
      if (body) {
        paths[index]?.push({ time, x: body.x, y: body.y });
      }
    }
    collisions.push({ time, ...contact, bodies: next.bodies, incoming });
  }

  bodies.forEach((body, index) => {
    const path = paths[index];
    if (path && (path.at(-1)?.time ?? 0) < time) {
      path.push({ time, x: body.x, y: body.y });
    }
  });
  return { paths, collisions };
}

export function getPathPosition(path: readonly PathPoint[], time: number): [x: number, y: number] {
  const first = path[0];
  if (!first) {
    return [0, 0];
  }
  let previous = first;
  for (const point of path) {
    if (point.time >= time) {
      const span = point.time - previous.time;
      const mix = span > 0 ? (time - previous.time) / span : 0;
      return [previous.x + (point.x - previous.x) * mix, previous.y + (point.y - previous.y) * mix];
    }
    previous = point;
  }
  return [previous.x, previous.y];
}
