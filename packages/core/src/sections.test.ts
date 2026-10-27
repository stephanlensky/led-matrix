import { describe, expect, it } from "vitest";
import { animationSchema } from "./animation.ts";
import {
  type SectionPlayback,
  getCurrentPlayback,
  getNextSection,
  getRenderPosition,
  getSectionCursor,
  getSectionPosition,
} from "./sections.ts";

const layers = [{ effect: "solid" }];

const animation = animationSchema.parse({
  name: "Sections",
  sections: [
    { name: "Intro", mode: { type: "loop", beats: 4 }, layers },
    { name: "Spawn", mode: { type: "once", beats: 2 }, layers },
    { name: "Drop", mode: { type: "once", ms: 500 }, layers },
    { name: "Main", mode: { type: "loop", beats: 8 }, layers },
  ],
});

function getPlayback(index: number, startedAt = 0): SectionPlayback {
  return { current: { index, startedAt }, next: undefined };
}

function getPosition(playback: SectionPlayback, time: number) {
  return getSectionPosition(animation, playback, time, 120, 30);
}

describe("getSectionPosition", () => {
  it("repeats loop sections", () => {
    expect(getPosition(getPlayback(0), 4500)).toEqual({ index: 0, time: 500, length: 2000 });
  });

  it("continues from once sections into the following sections", () => {
    expect(getPosition(getPlayback(1), 500).index).toBe(1);
    expect(getPosition(getPlayback(1), 1200)).toEqual({ index: 2, time: 200, length: 500 });
    expect(getPosition(getPlayback(1), 1600)).toEqual({ index: 3, time: 100, length: 4000 });
    expect(getPosition(getPlayback(1), 5600)).toEqual({ index: 3, time: 100, length: 4000 });
  });

  it("holds the end of a final once section", () => {
    const fade = animationSchema.parse({
      name: "Fade",
      sections: [{ mode: { type: "once", ms: 1000 }, layers }],
    });
    expect(getSectionPosition(fade, getPlayback(0), 5000, 120, 30)).toEqual({
      index: 0,
      time: 1000,
      length: 1000,
    });
  });

  it("switches to the next section when it starts", () => {
    const playback = { current: { index: 0, startedAt: 0 }, next: { index: 1, startedAt: 4000 } };
    expect(getPosition(playback, 3999).index).toBe(0);
    expect(getPosition(playback, 4000)).toEqual({ index: 1, time: 0, length: 1000 });
    expect(getCurrentPlayback(playback, 3999)).toBe(playback);
    expect(getCurrentPlayback(playback, 4000)).toEqual(getPlayback(1, 4000));
  });
});

describe("getNextSection", () => {
  it("waits for the end of the current loop iteration", () => {
    expect(getNextSection(animation, getPlayback(0), 4500, 120, 30, "end")).toEqual({
      index: 1,
      startedAt: 6000,
    });
  });

  it("switches immediately when asked to", () => {
    expect(getNextSection(animation, getPlayback(0), 4500, 120, 30, "now")).toEqual({
      index: 1,
      startedAt: 4500,
    });
  });

  it("leaves once sections immediately", () => {
    expect(getNextSection(animation, getPlayback(1), 500, 120, 30, "end")).toEqual({
      index: 2,
      startedAt: 500,
    });
  });

  it("has no next section after the last one", () => {
    expect(getNextSection(animation, getPlayback(3), 0, 120, 30, "end")).toBeUndefined();
  });
});

describe("getSectionCursor", () => {
  it("places a section at a progress", () => {
    expect(getSectionCursor(animation, 3, 0.25, 10_000, 120, 30)).toEqual({
      index: 3,
      startedAt: 9000,
    });
  });
});

describe("getRenderPosition", () => {
  it("returns the natural section time without a fit", () => {
    expect(getRenderPosition(animation, null, getPlayback(0), 1500, 120, 30)).toEqual({
      index: 0,
      time: 1500,
    });
  });

  it("scales the chain of once sections to fill the fit", () => {
    const fit = { section: 1, beats: 6 };
    expect(getRenderPosition(animation, fit, getPlayback(1), 1000, 120, 30)).toEqual({
      index: 1,
      time: 500,
    });
    expect(getRenderPosition(animation, fit, getPlayback(1), 2500, 120, 30)).toEqual({
      index: 2,
      time: 250,
    });
  });

  it("plays loop sections after the fitted chain at their natural length", () => {
    const fit = { section: 1, beats: 6 };
    expect(getRenderPosition(animation, fit, getPlayback(1), 3500, 120, 30)).toEqual({
      index: 3,
      time: 500,
    });
  });

  it("scales each iteration of a fitted loop section", () => {
    const fit = { section: 0, beats: 8 };
    expect(getRenderPosition(animation, fit, getPlayback(0), 1500, 120, 30)).toEqual({
      index: 0,
      time: 750,
    });
    expect(getRenderPosition(animation, fit, getPlayback(0), 5000, 120, 30)).toEqual({
      index: 0,
      time: 500,
    });
  });
});
