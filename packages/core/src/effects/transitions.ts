import { z } from "zod";
import { defineEffect } from "../effect.ts";
import { HEIGHT, WIDTH, setRgbaPixel } from "../frame.ts";
import { easingNames, easings } from "../keyframes.ts";
import { getPalette, getPaletteColor, paletteParams } from "./palette.ts";

const splitShapes = ["left-right", "up-down", "box", "diamond", "circle"] as const;
const splitOrigins = ["center", "edges"] as const;
const wipeDirections = [
  "right",
  "left",
  "down",
  "up",
  "down-right",
  "down-left",
  "clockwise",
  "counterclockwise",
] as const;

type SplitShape = (typeof splitShapes)[number];
type WipeDirection = (typeof wipeDirections)[number];

const transitionParams = {
  ...paletteParams,
  beatsPerColor: z.number().positive().max(64).default(1),
  duration: z.number().min(0.05).max(1).default(0.5),
  easing: z.enum(easingNames).default("easeInOutCubic"),
};

function getSplitDistance(shape: SplitShape, x: number, y: number): number {
  const dx = Math.abs(x + 0.5 - WIDTH / 2) / (WIDTH / 2);
  const dy = Math.abs(y + 0.5 - HEIGHT / 2) / (HEIGHT / 2);
  if (shape === "left-right") {
    return dx;
  }
  if (shape === "up-down") {
    return dy;
  }
  if (shape === "box") {
    return Math.max(dx, dy);
  }
  if (shape === "diamond") {
    return (dx + dy) / 2;
  }
  return Math.hypot(dx, dy) / Math.SQRT2;
}

function getWipePosition(direction: WipeDirection, x: number, y: number): number {
  const u = (x + 0.5) / WIDTH;
  const v = (y + 0.5) / HEIGHT;
  if (direction === "right") {
    return u;
  }
  if (direction === "left") {
    return 1 - u;
  }
  if (direction === "down") {
    return v;
  }
  if (direction === "up") {
    return 1 - v;
  }
  if (direction === "down-right") {
    return (u + v) / 2;
  }
  if (direction === "down-left") {
    return (1 - u + v) / 2;
  }
  const angle = Math.atan2(u - 0.5, 0.5 - v) / (Math.PI * 2);
  const clockwise = (angle + 1) % 1;
  return direction === "clockwise" ? clockwise : 1 - clockwise;
}

type TransitionInput = {
  params: z.output<z.ZodObject<typeof transitionParams>>;
  beat: number;
};

function getTransitionState({ params, beat }: TransitionInput) {
  const step = Math.floor(beat / params.beatsPerColor);
  const phase = beat / params.beatsPerColor - step;
  const palette = getPalette(params);
  return {
    amount: easings[params.easing](Math.min(phase / params.duration, 1)),
    from: getPaletteColor(palette, step),
    to: getPaletteColor(palette, step + 1),
  };
}

export const split = defineEffect({
  id: "split",
  name: "Split",
  kind: "pixel",
  params: z.object({
    ...transitionParams,
    shape: z.enum(splitShapes).default("left-right"),
    origin: z.enum(splitOrigins).default("center"),
  }),
  render(image, input) {
    const { amount, from, to } = getTransitionState(input);
    const { shape, origin } = input.params;
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const distance = getSplitDistance(shape, x, y);
        const isRevealed = origin === "center" ? distance < amount : distance > 1 - amount;
        setRgbaPixel(image, x, y, isRevealed ? to : from);
      }
    }
  },
});

export const wipe = defineEffect({
  id: "wipe",
  name: "Wipe",
  kind: "pixel",
  params: z.object({
    ...transitionParams,
    direction: z.enum(wipeDirections).default("right"),
  }),
  render(image, input) {
    const { amount, from, to } = getTransitionState(input);
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const isRevealed = getWipePosition(input.params.direction, x, y) < amount;
        setRgbaPixel(image, x, y, isRevealed ? to : from);
      }
    }
  },
});
