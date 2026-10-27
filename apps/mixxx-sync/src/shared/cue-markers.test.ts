import { describe, expect, it } from "vitest";
import { INTRO_OUTRO_COLOR, getCueMarkers } from "./cue-markers.ts";
import type { MixxxCue } from "./library.ts";

function createCue(changes: Partial<MixxxCue>): MixxxCue {
  return {
    type: "hotcue",
    hotcue: undefined,
    label: "",
    color: 0xff0000,
    start: undefined,
    end: undefined,
    ...changes,
  };
}

describe("getCueMarkers", () => {
  it("numbers hotcues from 1 and keeps their color and label", () => {
    const { markers } = getCueMarkers([createCue({ hotcue: 2, start: 10, label: "Drop" })]);
    expect(markers).toEqual([
      { position: 10, color: 0xff0000, label: "3", title: "Hotcue 3: Drop" },
    ]);
  });

  it("skips the main cue", () => {
    const { ranges, markers } = getCueMarkers([createCue({ type: "main", start: 1 })]);
    expect(ranges).toEqual([]);
    expect(markers).toEqual([]);
  });

  it("shades ranges and marks their edges", () => {
    const { ranges, markers } = getCueMarkers([createCue({ type: "intro", start: 0, end: 8 })]);
    expect(ranges).toEqual([{ start: 0, end: 8, color: INTRO_OUTRO_COLOR }]);
    expect(markers.map((marker) => marker.title)).toEqual(["Intro start", "Intro end"]);
  });

  it("marks only the end of an outro without a start", () => {
    const { ranges, markers } = getCueMarkers([createCue({ type: "outro", end: 200 })]);
    expect(ranges).toEqual([]);
    expect(markers.map((marker) => marker.position)).toEqual([200]);
  });

  it("shades saved loops in their hotcue color with a numbered marker", () => {
    const { ranges, markers } = getCueMarkers([
      createCue({ type: "loop", hotcue: 0, start: 4, end: 6, color: 0x00ff00 }),
    ]);
    expect(ranges).toEqual([{ start: 4, end: 6, color: 0x00ff00 }]);
    expect(markers.map((marker) => marker.label)).toEqual(["1"]);
  });
});
