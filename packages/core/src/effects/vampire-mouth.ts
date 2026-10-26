import { z } from "zod";
import { colorSchema } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { HEIGHT, WIDTH } from "../frame.ts";
import { getParticles } from "../particles.ts";
import { getRandomBetween } from "../random.ts";
import {
  type PathCommand,
  getPosePath,
  parseSvgPath,
  tracePath,
  transformPath,
} from "../svg-path.ts";

const POSE_COUNT = 3;
const DRIP_SEED = 0x7a3;
const DRIP_ATTACHED_LIFE = 0.35;

const upperLipPoses = [
  "M10 33 C16 28 18 24 24 24 C28 24 30 27 32 27 C34 27 36 24 40 24 C46 24 48 28 54 33 C46 33 38 33 32 33 C26 33 18 33 10 33 Z",
  "M8 29 C14 24 18 23 24 23 C28 23 30 26 32 26 C34 26 36 23 40 23 C46 23 50 24 56 29 C48 32 40 33 32 33 C24 33 16 32 8 29 Z",
  "M9 27 C14 22 18 20 24 20 C28 20 30 23 32 23 C34 23 36 20 40 20 C46 20 50 22 55 27 C48 30 40 31 32 31 C24 31 16 30 9 27 Z",
].map(parseSvgPath);

const lowerLipPoses = [
  "M10 33 C18 33 26 33 32 33 C38 33 46 33 54 33 C50 40 42 44 32 44 C22 44 14 40 10 33 Z",
  "M8 29 C16 36 24 38 32 38 C40 38 48 36 56 29 C52 40 42 47 32 47 C22 47 12 40 8 29 Z",
  "M9 27 C14 42 24 48 32 48 C40 48 50 42 55 27 C54 44 44 56 32 56 C20 56 10 44 9 27 Z",
].map(parseSvgPath);

const interiorPoses = [
  "M10 33 C18 33 26 33 32 33 C38 33 46 33 54 33 C46 33 38 33 32 33 C26 33 18 33 10 33 Z",
  "M8 29 C16 36 24 38 32 38 C40 38 48 36 56 29 C48 32 40 33 32 33 C24 33 16 32 8 29 Z",
  "M9 27 C14 42 24 48 32 48 C40 48 50 42 55 27 C48 30 40 31 32 31 C24 31 16 30 9 27 Z",
].map(parseSvgPath);

const fangPoses = [
  "M20 33 L26 33 L23 38 Z M38 33 L44 33 L41 38 Z",
  "M20 32 L26 33 L23 39 Z M38 33 L44 32 L41 39 Z",
  "M20 30 L26 31 L23 38 Z M38 31 L44 30 L41 38 Z",
].map(parseSvgPath);

const lipBottoms = [44, 47, 56];

function getPoseValue(values: readonly number[], pose: number): number {
  const index = Math.min(Math.floor(pose), values.length - 2);
  const from = values[index] ?? 0;
  return from + ((values[index + 1] ?? from) - from) * (pose - index);
}

export const vampireMouth = defineEffect({
  id: "vampire-mouth",
  name: "Vampire mouth",
  kind: "canvas",
  params: z.object({
    pose: z
      .number()
      .min(0)
      .max(POSE_COUNT - 1)
      .default(1),
    chatter: z
      .number()
      .min(0)
      .max(POSE_COUNT - 1)
      .default(0),
    lipColor: colorSchema.default("#e0002a"),
    outlineColor: colorSchema.default("#40000c"),
    outlineWidth: z.number().min(0).max(2).default(0),
    mouthColor: colorSchema.default("#3a0010"),
    teethColor: colorSchema.default("#ffffff"),
    teethSize: z.number().min(0).max(8).default(4),
    bloodColor: colorSchema.default("#d00010"),
    drips: z.number().min(0).max(6).default(1.5),
    dripSpeed: z.number().min(1).max(64).default(12),
    scale: z.number().min(0.5).max(2).default(1.2),
    snap: z.boolean().default(true),
  }),
  render(context, { params, beat, time, bpm }) {
    const pose = Math.min(params.pose + params.chatter * (1 - (beat % 1)) ** 2, POSE_COUNT - 1);
    const round = (value: number) => (params.snap ? Math.round(value) : value);
    const scaleX = (x: number) => round(WIDTH / 2 + (x - WIDTH / 2) * params.scale);
    const scaleY = (y: number) => round(HEIGHT / 2 + (y - HEIGHT / 2) * params.scale);
    const getShape = (poses: readonly PathCommand[][]) =>
      transformPath(getPosePath(poses, pose), (x, y) => [scaleX(x), scaleY(y)]);
    const upperLip = getShape(upperLipPoses);
    const lipBottom = getPoseValue(lipBottoms, pose);

    context.lineJoin = "round";
    context.strokeStyle = params.outlineColor;
    context.lineWidth = params.outlineWidth;

    context.save();
    tracePath(context, getShape(interiorPoses));
    context.fillStyle = params.mouthColor;
    context.fill();
    context.clip();
    context.translate(0, round(params.teethSize * params.scale));
    tracePath(context, upperLip);
    context.fillStyle = params.teethColor;
    context.fill();
    context.restore();

    tracePath(context, getShape(lowerLipPoses));
    context.fillStyle = params.lipColor;
    context.fill();
    if (params.outlineWidth > 0) {
      context.stroke();
    }

    tracePath(context, getShape(fangPoses));
    context.fillStyle = params.teethColor;
    context.fill();

    tracePath(context, upperLip);
    context.fillStyle = params.lipColor;
    context.fill();
    if (params.outlineWidth > 0) {
      context.stroke();
    }

    const particles = getParticles(
      {
        seed: DRIP_SEED,
        rate: params.drips,
        lifetime: (HEIGHT / params.dripSpeed) * 1000,
        gravity: params.dripSpeed,
        period: (60_000 / bpm) * 64,
        spawn: (random) => {
          const x = getRandomBetween(random, 22, 42);
          return { x, y: lipBottom - 1 - ((x - 32) / 16) ** 2 * 3, vx: 0, vy: 0 };
        },
      },
      time,
    );
    context.fillStyle = params.bloodColor;
    for (const particle of particles) {
      const width = round(getRandomBetween(particle.random, 1, 2.5) * params.scale);
      const isAttached = particle.life < DRIP_ATTACHED_LIFE;
      const growth = isAttached ? particle.life / DRIP_ATTACHED_LIFE : 1;
      const tail = isAttached
        ? scaleY(particle.spawnY)
        : scaleY(particle.y) - round(width * 3 + particle.vy * 0.25);
      const head = isAttached
        ? scaleY(particle.spawnY) + round(growth * width * 3)
        : scaleY(particle.y);
      const left = round(scaleX(particle.x) - width / 2);
      context.fillRect(left, tail, width, head - tail);
    }
  },
});
