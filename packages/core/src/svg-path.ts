import type { CanvasContext } from "./canvas.ts";

export type PathCommand = {
  type: "M" | "L" | "Q" | "C" | "Z";
  values: number[];
};

const TOKEN_PATTERN = /[a-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;

const ARGUMENT_COUNTS: Readonly<Record<string, number>> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  Z: 0,
};

export function parseSvgPath(data: string): PathCommand[] {
  const tokens = data.match(TOKEN_PATTERN) ?? [];
  const commands: PathCommand[] = [];
  let index = 0;
  let letter = "";
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let controlX = 0;
  let controlY = 0;

  function readNumber(): number {
    const token = tokens[index++];
    const value = Number(token);
    if (token === undefined || Number.isNaN(value)) {
      throw new Error(`Expected a number in SVG path at token ${index}`);
    }
    return value;
  }

  while (index < tokens.length) {
    const token = tokens[index] ?? "";
    if (/^[a-z]$/i.test(token)) {
      letter = token;
      index++;
    } else if (letter === "") {
      throw new Error("SVG path must start with a command");
    }
    const type = letter.toUpperCase();
    const argumentCount = ARGUMENT_COUNTS[type];
    if (argumentCount === undefined) {
      throw new Error(`Unsupported SVG path command "${letter}"`);
    }
    const isRelative = letter !== type;
    const originX = isRelative ? x : 0;
    const originY = isRelative ? y : 0;
    const values = Array.from({ length: argumentCount }, readNumber);
    const previous = commands.at(-1);

    if (type === "Z") {
      commands.push({ type: "Z", values: [] });
      [x, y] = [startX, startY];
    } else if (type === "M") {
      x = originX + (values[0] ?? 0);
      y = originY + (values[1] ?? 0);
      [startX, startY] = [x, y];
      commands.push({ type: "M", values: [x, y] });
      letter = isRelative ? "l" : "L";
    } else if (type === "H") {
      x = originX + (values[0] ?? 0);
      commands.push({ type: "L", values: [x, y] });
    } else if (type === "V") {
      y = originY + (values[0] ?? 0);
      commands.push({ type: "L", values: [x, y] });
    } else if (type === "L") {
      x = originX + (values[0] ?? 0);
      y = originY + (values[1] ?? 0);
      commands.push({ type: "L", values: [x, y] });
    } else if (type === "C" || type === "S") {
      const [x1, y1] =
        type === "C"
          ? [originX + (values[0] ?? 0), originY + (values[1] ?? 0)]
          : previous?.type === "C"
            ? [x * 2 - controlX, y * 2 - controlY]
            : [x, y];
      const offset = type === "C" ? 2 : 0;
      controlX = originX + (values[offset] ?? 0);
      controlY = originY + (values[offset + 1] ?? 0);
      x = originX + (values[offset + 2] ?? 0);
      y = originY + (values[offset + 3] ?? 0);
      commands.push({ type: "C", values: [x1, y1, controlX, controlY, x, y] });
    } else {
      [controlX, controlY] =
        type === "Q"
          ? [originX + (values[0] ?? 0), originY + (values[1] ?? 0)]
          : previous?.type === "Q"
            ? [x * 2 - controlX, y * 2 - controlY]
            : [x, y];
      const offset = type === "Q" ? 2 : 0;
      x = originX + (values[offset] ?? 0);
      y = originY + (values[offset + 1] ?? 0);
      commands.push({ type: "Q", values: [controlX, controlY, x, y] });
    }
  }
  return commands;
}

export function interpolatePaths(
  from: readonly PathCommand[],
  to: readonly PathCommand[],
  t: number,
): PathCommand[] {
  if (
    from.length !== to.length ||
    from.some((command, index) => command.type !== to[index]?.type)
  ) {
    throw new Error("Paths must have the same commands to be interpolated");
  }
  return from.map((command, index) => {
    const target = to[index]?.values ?? [];
    return {
      type: command.type,
      values: command.values.map(
        (value, valueIndex) => value + ((target[valueIndex] ?? value) - value) * t,
      ),
    };
  });
}

export function getPosePath(
  poses: readonly (readonly PathCommand[])[],
  pose: number,
): PathCommand[] {
  const clamped = Math.min(Math.max(pose, 0), poses.length - 1);
  const index = Math.min(Math.floor(clamped), poses.length - 2);
  const from = poses[Math.max(index, 0)] ?? [];
  return interpolatePaths(from, poses[index + 1] ?? from, clamped - Math.max(index, 0));
}

export function transformPath(
  commands: readonly PathCommand[],
  transform: (x: number, y: number) => [x: number, y: number],
): PathCommand[] {
  return commands.map(({ type, values }) => ({
    type,
    values: values.flatMap((value, index) =>
      index % 2 === 0 ? transform(value, values[index + 1] ?? 0) : [],
    ),
  }));
}

export function tracePath(context: CanvasContext, commands: readonly PathCommand[]): void {
  context.beginPath();
  for (const { type, values } of commands) {
    const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = values;
    if (type === "M") {
      context.moveTo(a, b);
    } else if (type === "L") {
      context.lineTo(a, b);
    } else if (type === "Q") {
      context.quadraticCurveTo(a, b, c, d);
    } else if (type === "C") {
      context.bezierCurveTo(a, b, c, d, e, f);
    } else {
      context.closePath();
    }
  }
}
