import { z } from "zod";
import { canvasFontFamilies } from "../canvas-fonts.ts";
import { colorSchema, formatColor, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { HEIGHT, WIDTH } from "../frame.ts";
import { easings } from "../keyframes.ts";
import { createRandom, getRandomBetween, hashSeed } from "../random.ts";
import { mix } from "./cat-model.ts";

const SEED = 0x51a3;

type Word = { text: string; start: number; beats: number; index: number };

function getWords(text: string, timing: string): { words: Word[]; total: number } {
  const beats = timing.split(",").map(Number);
  let start = 0;
  const words = text.split("|").map((word, index) => {
    const length = beats[index] ?? beats.at(-1) ?? 1;
    const result = {
      text: word,
      start,
      beats: Number.isFinite(length) && length > 0 ? length : 1,
      index,
    };
    start += result.beats;
    return result;
  });
  return { words, total: start };
}

export const wordSlam = defineEffect({
  id: "word-slam",
  name: "Word slam",
  kind: "canvas",
  params: z.object({
    words: z.string().max(128).default("FUCK|TAMO|GATCHIS|BITCH"),
    beats: z.string().max(64).default("1"),
    font: z.enum(canvasFontFamilies).default("Anton"),
    size: z.number().min(8).max(128).default(44),
    color1: colorSchema.default("#ffffff"),
    color2: colorSchema.default("#ffd23f"),
    outlineColor: colorSchema.default("#ff1a10"),
    outlineWidth: z.number().min(0).max(8).default(2),
    slam: z.number().min(0).max(1).default(1),
    shake: z.number().min(0).max(4).default(2),
  }),
  render(context, { params, beat }) {
    const { words, total } = getWords(params.words, params.beats);
    const position = ((beat % total) + total) % total;
    const word = words.find(({ start, beats }) => position >= start && position < start + beats);
    if (!word || word.text.trim() === "") {
      return;
    }
    const local = position - word.start;
    const hit = local % 1;
    const impact = easings.easeOutCubic(Math.min(1, hit * 5));
    context.font = `${params.size}px "${params.font}"`;
    context.textAlign = "center";
    context.textBaseline = "alphabetic";
    const metrics = context.measureText(word.text);
    const baseline = (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
    const fit = Math.min(
      1,
      (WIDTH - 2 - params.outlineWidth * 2) / metrics.width,
      (HEIGHT - 4) / (metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent),
    );
    const zoom = fit * (1 + params.slam * 1.4 * (1 - impact));
    const random = createRandom(hashSeed(SEED, Math.floor(beat * 8)));
    const shake = params.shake * (1 - hit);
    context.translate(
      WIDTH / 2 + getRandomBetween(random, -1, 1) * shake,
      HEIGHT / 2 + getRandomBetween(random, -1, 1) * shake,
    );
    context.scale(zoom, zoom);
    context.lineJoin = "round";
    if (params.outlineWidth > 0) {
      context.strokeStyle = params.outlineColor;
      context.lineWidth = (params.outlineWidth * 2) / zoom;
      context.strokeText(word.text, 0, baseline);
    }
    const color = parseColor(word.index % 2 === 0 ? params.color1 : params.color2);
    context.fillStyle = formatColor(mix(color, [255, 255, 255], (1 - impact) * 0.6));
    context.fillText(word.text, 0, baseline);
  },
});
