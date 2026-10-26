export const blendModes = [
  "normal",
  "add",
  "subtract",
  "multiply",
  "screen",
  "lighten",
  "darken",
  "difference",
] as const;

export type BlendMode = (typeof blendModes)[number];

const blendFunctions: Record<BlendMode, (base: number, top: number) => number> = {
  normal: (_base, top) => top,
  add: (base, top) => Math.min(255, base + top),
  subtract: (base, top) => Math.max(0, base - top),
  multiply: (base, top) => (base * top) / 255,
  screen: (base, top) => 255 - ((255 - base) * (255 - top)) / 255,
  lighten: (base, top) => Math.max(base, top),
  darken: (base, top) => Math.min(base, top),
  difference: (base, top) => Math.abs(base - top),
};

export function blendChannel(mode: BlendMode, base: number, top: number, alpha: number): number {
  return base + (blendFunctions[mode](base, top) - base) * alpha;
}
