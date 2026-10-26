import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { HEIGHT, WIDTH, setRgbaPixel } from "../frame.ts";

const sprite = [
  "..............###..............",
  "..............#.####...........",
  "..............#.#..............",
  "........###############........",
  ".......#..#.........#..#.......",
  "......#..#...........#..#......",
  ".....#..#.............#..#.....",
  "....#..#....#.....#....#..#....",
  "...#..#....#.#...#.#....#..#...",
  "..#..#....#...#.#...#....#..#..",
  ".#..#.....#####.#####.....#..#.",
  "#..#...........#...........#..#",
  ".#..#.........###.........#..#.",
  "..#..#...................#..#..",
  "...#..#...#.........#...#..#...",
  "....#..#..##.#.#.#.##..#..#....",
  ".....#..#.#.#.#.#.#.#.#..#.....",
  "......#..#.#.......#.#..#......",
  ".......#..#.#######.#..#.......",
  "........###############........",
];

const SPRITE_WIDTH = sprite[0]?.length ?? 0;
const SPRITE_HEIGHT = sprite.length;

function getBounce(phase: number): number {
  const wrapped = ((phase % 1) + 1) % 1;
  return 1 - Math.abs(1 - wrapped * 2);
}

export const pumpkin = defineEffect({
  id: "pumpkin",
  name: "Jack-o'-lantern",
  kind: "pixel",
  params: z.object({
    scale: z.number().int().min(1).max(2).default(1),
    cyclesX: z.number().int().min(0).max(32).default(3),
    cyclesY: z.number().int().min(0).max(32).default(4),
    offset: z.number().min(0).max(1).default(0.3),
    color: colorSchema.default("#ff6a00"),
  }),
  render(image, { params, progress }) {
    const width = SPRITE_WIDTH * params.scale;
    const height = SPRITE_HEIGHT * params.scale;
    const left = Math.round(getBounce(progress * params.cyclesX) * (WIDTH - width));
    const top = Math.round(
      getBounce(progress * params.cyclesY + params.offset) * (HEIGHT - height),
    );
    const color = parseColor(params.color);

    for (const [row, line] of sprite.entries()) {
      for (const [column, pixel] of line.split("").entries()) {
        if (pixel !== "#") {
          continue;
        }
        for (let offsetY = 0; offsetY < params.scale; offsetY++) {
          for (let offsetX = 0; offsetX < params.scale; offsetX++) {
            setRgbaPixel(
              image,
              left + column * params.scale + offsetX,
              top + row * params.scale + offsetY,
              color,
            );
          }
        }
      }
    }
  },
});
