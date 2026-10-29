import { describe, expect, it } from "vitest";
import { getVisibleFlash } from "./flash.ts";

function getShownFlashes(offset: number, bpm: number, flashesPerBeat: number, duty: number) {
  const frameDuration = 1000 / 30;
  const shown: number[] = [];
  for (let frame = 0; frame < 60; frame++) {
    const beat = ((offset + frame * frameDuration) * bpm) / 60_000;
    const flash = getVisibleFlash(beat, flashesPerBeat, duty, bpm, 30);
    if (flash) {
      shown.push(flash.index);
    }
  }
  return shown;
}

describe("getVisibleFlash", () => {
  it("shows every flash shorter than a frame exactly once, whatever the frame offset", () => {
    for (const bpm of [128, 150, 174]) {
      for (let offset = 0; offset < 34; offset += 0.5) {
        const shown = getShownFlashes(offset, bpm, 4, 0.2);
        const first = shown[0] ?? 0;
        const last = shown.at(-1) ?? 0;
        expect(shown).toEqual(
          Array.from({ length: last - first + 1 }, (_, index) => first + index),
        );
        expect(shown.length).toBeGreaterThan(((60 / 30) * bpm * 4) / 60 - 2);
      }
    }
  });

  it("reports how far into the flash the beat is", () => {
    expect(getVisibleFlash(1.1, 1, 0.5, 120, 30)).toEqual({
      index: 1,
      progress: expect.closeTo(0.2),
    });
    expect(getVisibleFlash(1.6, 1, 0.5, 120, 30)).toBeUndefined();
    expect(getVisibleFlash(4.01, 4, 0.2, 150, 30)).toEqual({
      index: 16,
      progress: expect.closeTo(0.12),
    });
  });

  it("plays the flash backwards from the end of the period when reversed", () => {
    expect(getVisibleFlash(1.1, 1, 0.5, 120, 30, true)).toBeUndefined();
    expect(getVisibleFlash(1.9, 1, 0.5, 120, 30, true)).toEqual({
      index: 1,
      progress: expect.closeTo(0.2),
    });
    expect(getVisibleFlash(1.25, 1, 1, 120, 30, true)).toEqual({
      index: 1,
      progress: expect.closeTo(0.75),
    });
  });
});
