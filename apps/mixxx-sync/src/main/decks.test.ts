import { describe, expect, it } from "vitest";
import { getAudibleBeat, getCrossfaderGain, getLiveDeck } from "./decks.ts";
import type { Deck, DecksMessage } from "./mixxx.ts";

function getDeck(group: string, deck: Partial<Deck> = {}): Deck {
  return { group, play: true, bpm: 120, beat: 0, volume: 1, orientation: "center", ...deck };
}

function getDecks(decks: Deck[], crossfader = 0): DecksMessage {
  return { type: "decks", time: 1000, outputLatency: 0, crossfader, mainGain: 1, decks };
}

describe("getAudibleBeat", () => {
  it("extrapolates from the message time and subtracts output latency", () => {
    const decks = { ...getDecks([]), outputLatency: 100 };
    expect(getAudibleBeat(getDeck("[Channel1]", { beat: 8 }), decks, 1600)).toBeCloseTo(9);
  });

  it("does not extrapolate a stopped deck", () => {
    const deck = getDeck("[Channel1]", { beat: 8, play: false });
    expect(getAudibleBeat(deck, getDecks([]), 5000)).toBe(8);
  });

  it("returns null without a beat grid", () => {
    expect(getAudibleBeat(getDeck("[Channel1]", { beat: null }), getDecks([]), 1000)).toBeNull();
  });
});

describe("getCrossfaderGain", () => {
  it("fades the opposite side out", () => {
    expect(getCrossfaderGain("left", -1)).toBe(1);
    expect(getCrossfaderGain("left", 0.5)).toBe(0.5);
    expect(getCrossfaderGain("right", -1)).toBe(0);
    expect(getCrossfaderGain("center", 1)).toBe(1);
  });
});

describe("getLiveDeck", () => {
  const a = "[Channel1]";
  const b = "[Channel2]";

  it("picks the loudest playing deck", () => {
    const decks = getDecks([getDeck(a, { volume: 0.4 }), getDeck(b, { volume: 0.6 })]);
    expect(getLiveDeck(decks, undefined, 0.1)).toBe(b);
  });

  it("ignores stopped decks", () => {
    const decks = getDecks([getDeck(a, { play: false }), getDeck(b, { volume: 0.2 })]);
    expect(getLiveDeck(decks, a, 0.1)).toBe(b);
  });

  it("keeps the current deck within the hysteresis margin", () => {
    const decks = getDecks([getDeck(a, { volume: 0.5 }), getDeck(b, { volume: 0.55 })]);
    expect(getLiveDeck(decks, a, 0.1)).toBe(a);
    const louder = getDecks([getDeck(a, { volume: 0.5 }), getDeck(b, { volume: 0.7 })]);
    expect(getLiveDeck(louder, a, 0.1)).toBe(b);
  });

  it("applies the crossfader", () => {
    const decks = getDecks(
      [getDeck(a, { orientation: "left" }), getDeck(b, { orientation: "right", volume: 0.5 })],
      0.8,
    );
    expect(getLiveDeck(decks, undefined, 0.1)).toBe(b);
  });

  it("returns undefined when nothing is audible", () => {
    expect(getLiveDeck(getDecks([getDeck(a, { volume: 0 })]), a, 0.1)).toBeUndefined();
  });
});
