import type { Effect } from "../effect.ts";
import { plasma } from "./plasma.ts";
import { scrollingText } from "./scrolling-text.ts";
import { solid } from "./solid.ts";
import { squares } from "./squares.ts";
import { strobe } from "./strobe.ts";

export const effects: readonly Effect[] = [solid, strobe, plasma, squares, scrollingText];

const effectsById = new Map(effects.map((effect) => [effect.id, effect]));

export function getEffect(id: string): Effect | undefined {
  return effectsById.get(id);
}
