import { writeFile } from "node:fs/promises";
import { Session } from "node:inspector/promises";
import { cpus } from "node:os";
import { parseArgs } from "node:util";
import {
  animationSchema,
  createRenderer,
  getParameterAnimation,
  getParameterSelection,
} from "@led-matrix/core";
import { nodeCanvas } from "@led-matrix/core/node-canvas";
import { seedAnimations } from "./seeds.ts";

const { values: options } = parseArgs({
  options: {
    filter: { type: "string" },
    frames: { type: "string", default: "300" },
    warmup: { type: "string", default: "30" },
    fps: { type: "string", default: "30" },
    bpm: { type: "string", default: "120" },
    top: { type: "string", default: "20" },
    profile: { type: "string" },
  },
});

const frames = Number(options.frames);
const warmup = Number(options.warmup);
const fps = Number(options.fps);
const bpm = Number(options.bpm);
const budget = 1000 / fps;

type Result = { name: string; median: number; p90: number; mean: number };

type ProfileNode = {
  callFrame: { functionName: string; url: string; lineNumber: number };
  hitCount?: number;
};

function getSelfTimes(nodes: readonly ProfileNode[]): { name: string; share: number }[] {
  const hits = new Map<string, number>();
  for (const { callFrame, hitCount = 0 } of nodes) {
    const file = callFrame.url.split("/").at(-1) ?? "";
    const name = `${callFrame.functionName || "(anonymous)"} ${file}:${callFrame.lineNumber + 1}`;
    hits.set(name, (hits.get(name) ?? 0) + hitCount);
  }
  const total = [...hits.values()].reduce((sum, count) => sum + count, 0);
  return [...hits.entries()]
    .map(([name, count]) => ({ name, share: total ? count / total : 0 }))
    .toSorted((a, b) => b.share - a.share);
}

function getPercentile(sorted: readonly number[], percentile: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * percentile))] ?? 0;
}

function isIncluded(name: string, id: string): boolean {
  return !options.filter || name === options.filter || id === options.filter;
}

const sections = Object.entries(seedAnimations).flatMap(([id, input]) => {
  const document = animationSchema.parse(input);
  const animation = getParameterAnimation(document, getParameterSelection(document, {}));
  return animation.sections
    .map((_, section) => ({ name: `${id}#${section}`, id, animation, section }))
    .filter(({ name }) => isIncluded(name, id));
});

if (sections.length === 0) {
  throw new Error(`No sections match "${options.filter}"`);
}

const session = options.profile ? new Session() : undefined;
if (session) {
  session.connect();
  await session.post("Profiler.enable");
  await session.post("Profiler.start");
}

const results: Result[] = sections.map(({ name, animation, section }) => {
  const renderer = createRenderer({ fps, canvas: nodeCanvas });
  for (let frame = 0; frame < warmup; frame++) {
    renderer.render(animation, frame * budget, bpm, section);
  }
  const durations = Array.from({ length: frames }, (_, index) => {
    const start = performance.now();
    renderer.render(animation, (warmup + index) * budget, bpm, section);
    return performance.now() - start;
  });
  const sorted = durations.toSorted((a, b) => a - b);
  return {
    name,
    median: getPercentile(sorted, 0.5),
    p90: getPercentile(sorted, 0.9),
    mean: durations.reduce((total, duration) => total + duration, 0) / durations.length,
  };
});

const selfTimes: { name: string; share: number }[] = [];
if (session && options.profile) {
  const { profile } = await session.post("Profiler.stop");
  await writeFile(options.profile, JSON.stringify(profile));
  session.disconnect();
  selfTimes.push(...getSelfTimes(profile.nodes));
}

const medians = results.map(({ median }) => median).toSorted((a, b) => a - b);
const means = results.map(({ mean }) => mean).toSorted((a, b) => a - b);

console.log(`CPU: ${cpus()[0]?.model ?? "unknown"}`);
console.log(`${results.length} sections, ${frames} frames after ${warmup} warmup at ${fps} fps`);
console.log(
  `Section mean ms/frame: median ${getPercentile(means, 0.5).toFixed(2)}, p90 ${getPercentile(means, 0.9).toFixed(2)}`,
);
console.log(
  `Sections over ${budget.toFixed(1)} ms median: ${medians.filter((median) => median > budget).length}`,
);
console.log("");
console.log(
  `${"section".padEnd(32)} ${"mean".padStart(7)} ${"median".padStart(7)} ${"p90".padStart(7)}`,
);
for (const { name, mean, median, p90 } of results
  .toSorted((a, b) => b.mean - a.mean)
  .slice(0, Number(options.top))) {
  console.log(
    `${name.padEnd(32)} ${mean.toFixed(2).padStart(7)} ${median.toFixed(2).padStart(7)} ${p90.toFixed(2).padStart(7)}`,
  );
}
if (options.profile) {
  console.log("");
  console.log(`Wrote CPU profile to ${options.profile}`);
  console.log("");
  console.log(`${"self".padStart(6)}  function`);
  for (const { name, share } of selfTimes.slice(0, Number(options.top))) {
    console.log(`${(share * 100).toFixed(1).padStart(5)}%  ${name}`);
  }
}
