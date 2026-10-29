import { z } from "zod";
import { colorSchema } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import { easings } from "../../keyframes.ts";
import { createRandom, getRandomBetween, hashSeed } from "../../random.ts";
import { toRadians } from "../cat-duo.ts";
import {
  type Ink,
  type Point,
  TAU,
  addInkDot,
  addInkLine,
  addInkPath,
  clamp,
  createInk,
  drawInk,
  getCycle,
  getDrivenBeat,
  paperSchema,
  speedSchema,
} from "./shared.ts";

const LOOP_BEATS = 16;
const CIRCLE_CENTER: Point = [32, 32];
const CIRCLE_RADIUS = 27;
const CIRCLE_GAP = toRadians(40);
const CIRCLE_START = toRadians(-115);
const TRUNK_BASE: Point = [32, 54];
const TRUNK_LENGTH = 11;
const GROW_START = 2;
const MAX_DEPTH = 5;
const CROWN_START = 9;
const CROWN_END = 12;
const FADE_START = 15;
const TREE_SEED = 0x7ee;

type Branch = {
  parent: number;
  depth: number;
  angle: number;
  length: number;
  start: number;
  duration: number;
};

type Tip = { point: Point; branch: number };

function createBranches(): Branch[] {
  const branches: Branch[] = [];
  const add = (parent: number, depth: number, angle: number, length: number, start: number) => {
    const duration = 1.6 - depth * 0.2;
    const index = branches.push({ parent, depth, angle, length, start, duration }) - 1;
    if (depth >= MAX_DEPTH) {
      return;
    }
    const random = createRandom(hashSeed(TREE_SEED, index));
    const children = depth === 0 ? 3 : random() < 0.35 ? 3 : 2;
    for (let child = 0; child < children; child++) {
      const spread = children === 3 ? (child - 1) * 32 : (child === 0 ? -1 : 1) * 26;
      add(
        index,
        depth + 1,
        toRadians(spread + getRandomBetween(random, -10, 10)),
        length * getRandomBetween(random, 0.62, 0.8),
        start + duration,
      );
    }
  };
  add(-1, 0, 0, TRUNK_LENGTH, GROW_START);
  return branches;
}

const branches = createBranches();

function addCircle(ink: Ink, progress: number): void {
  const sweep = (TAU - CIRCLE_GAP) * progress;
  const steps = Math.ceil(sweep * CIRCLE_RADIUS);
  const points: Point[] = [];
  for (let step = 0; step <= steps; step++) {
    const angle = CIRCLE_START + (sweep * step) / Math.max(1, steps);
    points.push([
      CIRCLE_CENTER[0] + Math.cos(angle) * CIRCLE_RADIUS,
      CIRCLE_CENTER[1] + Math.sin(angle) * CIRCLE_RADIUS,
    ]);
  }
  addInkPath(ink, points);
}

function addCrosshair(ink: Ink, progress: number): void {
  const x = CIRCLE_CENTER[0] + CIRCLE_RADIUS * 0.7;
  const y = CIRCLE_CENTER[1] - CIRCLE_RADIUS * 0.72;
  const reach = 64 * easings.easeOutCubic(progress);
  addInkLine(ink, [x, y - reach * 0.3], [x, y + reach * 0.45]);
  addInkLine(ink, [x - reach * 0.6, y], [x + reach * 0.25, y]);
}

function addTree(ink: Ink, head: number, sway: number): Tip[] {
  const ends: Point[] = [];
  const angles: number[] = [];
  const tips: Tip[] = [];
  for (const [index, branch] of branches.entries()) {
    const origin = ends[branch.parent] ?? TRUNK_BASE;
    const angle = (angles[branch.parent] ?? 0) + branch.angle + sway * branch.depth;
    angles.push(angle);
    const grown = easings.easeOutQuad(clamp((head - branch.start) / branch.duration));
    const end: Point = [
      origin[0] + Math.sin(angle) * branch.length * grown,
      origin[1] - Math.cos(angle) * branch.length * grown,
    ];
    ends.push(end);
    if (grown > 0) {
      addInkLine(ink, origin, end);
      if (branch.depth < 2) {
        addInkLine(ink, [origin[0] + 1, origin[1]], [end[0] + 1, end[1]]);
      }
    }
    if (branch.depth === MAX_DEPTH && grown >= 1) {
      tips.push({ point: end, branch: index });
    }
  }
  return tips;
}

function addCrown(ink: Ink, tips: readonly Tip[], elapsed: number, beat: number): void {
  for (const { point, branch } of tips) {
    const random = createRandom(hashSeed(TREE_SEED, branch, 1));
    if (random() > 0.45) {
      continue;
    }
    const appear = CROWN_START + random() * (CROWN_END - CROWN_START - 1);
    const drawn = easings.easeOutCubic(clamp((elapsed - appear) / 0.75));
    if (drawn <= 0) {
      continue;
    }
    const radius = getRandomBetween(random, 1.2, 2.4);
    const sweep = drawn * TAU * 1.2;
    const start = random() * TAU;
    const points: Point[] = [];
    for (let step = 0; step <= 16; step++) {
      const angle = start + (sweep * step) / 16;
      points.push([point[0] + Math.cos(angle) * radius, point[1] + Math.sin(angle) * radius]);
    }
    addInkPath(ink, points);
    const twinkle = Math.exp(-getCycle(beat + random()) * 4);
    if (elapsed > CROWN_END && twinkle > 0.6) {
      addInkDot(ink, point, 0.6);
    }
  }
}

export const nurtureTree = defineEffect({
  id: "nurture-tree",
  name: "Nurture tree",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    speed: speedSchema,
    ink: colorSchema.default("#ffffff"),
    paper: paperSchema.default("none"),
    drive: z.number().min(0).max(1).default(0.6),
    circle: z.boolean().default(true),
  }),
  render(image, { params, beat: musicBeat }) {
    const beat = musicBeat * params.speed;
    const elapsed = getCycle(beat / LOOP_BEATS) * LOOP_BEATS;
    const head = getDrivenBeat(elapsed, params.drive);
    const sway = toRadians(2.5) * Math.sin((beat / 4) * TAU) * clamp(elapsed - GROW_START);
    const ink = createInk();
    if (params.circle) {
      addCircle(ink, easings.easeInOutCubic(clamp(head / 1.5)));
      addCrosshair(ink, clamp((head - 0.75) / 1.25));
    }
    const tips = addTree(ink, head, sway);
    addCrown(ink, tips, elapsed, beat);
    const fade = 1 - clamp(elapsed - FADE_START);
    if (fade < 1) {
      ink.forEach((value, index) => {
        ink[index] = value * fade;
      });
    }
    drawInk(image, ink, params.ink, params.paper);
  },
});
