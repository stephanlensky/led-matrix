import type { Deck, DecksMessage } from "./mixxx.ts";

export function getBeatDelta(milliseconds: number, bpm: number): number {
  return (milliseconds * bpm) / 60_000;
}

export function getAudibleBeat(deck: Deck, decks: DecksMessage, time: number): number | null {
  if (deck.beat === null) {
    return null;
  }
  return deck.play
    ? deck.beat + getBeatDelta(time - decks.time - decks.outputLatency, deck.bpm)
    : deck.beat;
}

export function getCrossfaderGain(orientation: Deck["orientation"], crossfader: number): number {
  if (orientation === "left") {
    return Math.min(Math.max(1 - crossfader, 0), 1);
  }
  if (orientation === "right") {
    return Math.min(Math.max(1 + crossfader, 0), 1);
  }
  return 1;
}

export function getDeckLevel(deck: Deck, crossfader: number): number {
  return deck.play && deck.bpm > 0
    ? deck.volume * getCrossfaderGain(deck.orientation, crossfader)
    : 0;
}

export function getLiveDeck(
  { decks, crossfader }: DecksMessage,
  currentGroup: string | undefined,
  hysteresis: number,
): string | undefined {
  let best: { group: string; level: number } | undefined;
  for (const deck of decks) {
    const level = getDeckLevel(deck, crossfader);
    if (level > 0 && (!best || level > best.level)) {
      best = { group: deck.group, level };
    }
  }
  const current = decks.find(({ group }) => group === currentGroup);
  const currentLevel = current ? getDeckLevel(current, crossfader) : 0;
  if (currentLevel > 0 && (!best || best.level <= currentLevel + hysteresis)) {
    return currentGroup;
  }
  return best?.group;
}
