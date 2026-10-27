import { describe, expect, it } from "vitest";
import type { Beats } from "./beats.ts";
import type { MixxxCue } from "./library.ts";
import {
  type LaneScale,
  getEndRange,
  getMoveRange,
  getMoveSnap,
  getSnap,
  getSnapTargets,
  getStartRange,
  getTrackRange,
} from "./lane-edit.ts";
import type { Cue } from "./mapping.ts";

const beats: Beats = { type: "grid", bpm: 120, firstBeat: 0.25 };
const scale: LaneScale = { beats, duration: 100, width: 1000 };
const track = { min: -1, max: 199 };

const cues: Cue[] = [
  { beat: 0, animation: "cat" },
  { beat: 32, end: 48, section: "Spawn" },
  { beat: 64, animation: "plasma" },
];

describe("getTrackRange", () => {
  it("starts on the lead-in beat and ends at the track end", () => {
    expect(getTrackRange(beats, 100)).toEqual({ min: -1, max: 199.5 });
  });
});

describe("ranges", () => {
  it("keeps a moved block between its neighbours", () => {
    expect(getMoveRange(cues, 1, track)).toEqual({ min: 1, max: 48 });
    expect(getMoveRange(cues, 2, track)).toEqual({ min: 48, max: 198 });
    expect(getMoveRange(cues, 0, track)).toEqual({ min: -1, max: 31 });
  });

  it("keeps the start before the end and the end before the next cue", () => {
    expect(getStartRange(cues, 1, track)).toEqual({ min: 1, max: 47 });
    expect(getStartRange(cues, 2, track)).toEqual({ min: 48, max: 198 });
    expect(getEndRange(cues, 1, track)).toEqual({ min: 33, max: 64 });
    expect(getEndRange(cues, 2, track)).toEqual({ min: 65, max: 199 });
  });
});

describe("getSnapTargets", () => {
  it("collects other cue edges and Mixxx cue positions in beats", () => {
    const mixxxCues: MixxxCue[] = [
      { type: "intro", hotcue: undefined, label: "", color: 0, start: 2.25, end: 10.25 },
    ];
    expect(getSnapTargets(cues, 1, mixxxCues, beats)).toEqual([0, 64, 4, 20]);
  });
});

describe("getSnap", () => {
  it("snaps to the nearest target within the distance", () => {
    expect(getSnap(31.7, [32, 30], scale)).toEqual({
      beat: 32,
      target: 32,
      distance: expect.closeTo(1.5),
    });
  });

  it("snaps to a bar next to the beat, otherwise to a whole beat", () => {
    expect(getSnap(7.2, [], scale)).toMatchObject({ beat: 8, target: 8 });
    expect(getSnap(5.6, [], scale)).toMatchObject({ beat: 6, target: undefined });
  });

  it("snaps to a target before the bar", () => {
    expect(getSnap(7.2, [7], scale)).toMatchObject({ beat: 7, target: 7 });
  });
});

describe("getMoveSnap", () => {
  it("snaps whichever edge is closer to a target", () => {
    expect(getMoveSnap(21.4, 16, [37.6, 10], scale)).toMatchObject({
      beat: expect.closeTo(21.6),
      target: 37.6,
    });
    expect(getMoveSnap(21.4, 16, [21.3, 37.6], scale)).toMatchObject({ beat: 21.3, target: 21.3 });
  });

  it("snaps the start of a block without end", () => {
    expect(getMoveSnap(21.4, undefined, [37.6], scale)).toMatchObject({
      beat: 21,
      target: undefined,
    });
  });
});
