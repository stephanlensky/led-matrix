import type { Effect } from "../effect.ts";
import { bigText } from "./big-text.ts";
import { plasma } from "./plasma.ts";
import { scrollingText } from "./scrolling-text.ts";
import { solid } from "./solid.ts";
import { squares } from "./squares.ts";
import { strobe } from "./strobe.ts";
import { text } from "./text.ts";

export const effects: readonly Effect[] = [
  solid,
  strobe,
  plasma,
  squares,
  text,
  scrollingText,
  bigText,
];

const effectsById = new Map(effects.map((effect) => [effect.id, effect]));

export function getEffect(id: string): Effect | undefined {
  return effectsById.get(id);
}
