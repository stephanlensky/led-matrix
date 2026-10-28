import { describe, expect, it } from "vitest";
import type { Beats } from "./beats.ts";
import type { MixxxCue } from "./library.ts";
import {
  type LaneScale,
  getEndRange,
  getGap,
  getGapRange,
  getGapRanges,
  getCopySnap,
  isCopyValid,
  getMoveRange,
  getMoveSnap,
  getGroupCopySnap,
  getGroupMoveRange,
  getNudgedDelta,
  getSnap,
  getSnapTargets,
  getStartRange,
  getTrackRange,
  getTrimStartRange,
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

  it("keeps a trimmed start after the animation start", () => {
    const trimmed: Cue[] = [cues[0]!, { ...cues[1]!, trim: true, offset: 4 }, cues[2]!];
    expect(getTrimStartRange(trimmed, 1, track)).toEqual({ min: 28, max: 47 });
    expect(getTrimStartRange(trimmed, 0, track)).toEqual({ min: 0, max: 31 });
  });
});

describe("getNudgedDelta", () => {
  it("moves a cue by the delta without crossing its neighbours", () => {
    expect(getNudgedDelta(cues, [1], 4, track)).toBe(4);
    expect(getNudgedDelta(cues, [1], 32, track)).toBe(16);
    expect(getNudgedDelta(cues, [0], -4, track)).toBe(-1);
    expect(getNudgedDelta(cues, [3], 1, track)).toBe(0);
  });

  it("moves a group together, limited by the cues outside it", () => {
    expect(getNudgedDelta(cues, [1, 2], 32, track)).toBe(32);
    expect(getNudgedDelta(cues, [1, 2], -40, track)).toBe(-31);
    expect(getNudgedDelta(cues, [0, 2], 40, track)).toBe(31);
  });
});

describe("getGroupMoveRange", () => {
  it("ignores neighbours that move with the group", () => {
    expect(getGroupMoveRange(cues, [0, 1, 2], track)).toEqual({ min: -1, max: 134 });
  });
});

describe("isCopyValid", () => {
  it("needs every copy to land in a gap", () => {
    const copies = [cues[1]!, { beat: 50, end: 52, animation: "cat" }];
    expect(isCopyValid(cues, copies, -30, track)).toBe(false);
    expect(isCopyValid(cues.slice(0, 2), copies, 20, track)).toBe(true);
    expect(isCopyValid(cues, copies, 20, track)).toBe(false);
  });
});

describe("isCopyValid pattern", () => {
  it("lets a copy land exactly on an identical cue", () => {
    const pattern: Cue[] = [
      { beat: 0, end: 4, animation: "cat", params: { Color: "Red" } },
      { beat: 8, end: 12, animation: "cat", params: { Color: "Red" } },
    ];
    expect(isCopyValid(pattern, pattern, 8, track)).toBe(true);
    expect(isCopyValid(pattern, pattern, 7, track)).toBe(false);
    const different: Cue[] = [pattern[0]!, { ...pattern[1]!, params: { Color: "Blue" } }];
    expect(isCopyValid(different, different, 8, track)).toBe(false);
  });
});

describe("getGroupCopySnap", () => {
  it("snaps the anchor and checks the whole group", () => {
    const copies = [cues[1]!, { beat: 50, end: 52, animation: "cat" }];
    expect(
      getGroupCopySnap(51.6, cues[1]!, copies, cues.slice(0, 2), [], track, scale, false),
    ).toEqual({ beat: 52, target: 52, isValid: true });
  });
});

describe("getGap", () => {
  it("spans a blank gap after a cue end", () => {
    expect(getGap(cues, 50, track)).toEqual({ min: 48, max: 64 });
  });

  it("spans the space before the first cue", () => {
    expect(getGap(cues.slice(1), 10, track)).toEqual({ min: -1, max: 32 });
  });

  it("is undefined inside a block", () => {
    expect(getGap(cues, 40, track)).toBeUndefined();
    expect(getGap(cues, 80, track)).toBeUndefined();
  });
});

describe("getGapRange", () => {
  it("fits the length inside the gap", () => {
    expect(getGapRange(cues, 50, 8, track)).toEqual({ min: 48, max: 56 });
  });

  it("keeps room for the shortest cue without a length", () => {
    expect(getGapRange(cues, 50, undefined, track)).toEqual({ min: 48, max: 63 });
  });

  it("is undefined inside a block", () => {
    expect(getGapRange(cues, 40, 8, track)).toBeUndefined();
  });
});

describe("getGapRanges", () => {
  it("lists the gaps the length fits into", () => {
    expect(getGapRanges(cues.slice(1), 8, track)).toEqual([
      { min: -1, max: 24 },
      { min: 48, max: 56 },
    ]);
  });

  it("skips gaps that are too short", () => {
    expect(getGapRanges(cues, 20, track)).toEqual([]);
  });
});

describe("getCopySnap", () => {
  const gaps = [
    { min: -1, max: 24 },
    { min: 48, max: 56 },
  ];

  it("keeps a snapped beat that fits a gap", () => {
    expect(getCopySnap(50.2, 8, [], gaps, scale, false)).toEqual({
      beat: 50,
      target: undefined,
      isValid: true,
    });
  });

  it("pulls a beat just past a gap against the block edge", () => {
    expect(getCopySnap(46.6, 8, [], gaps, scale, false)).toEqual({
      beat: 48,
      target: 48,
      isValid: true,
    });
    expect(getCopySnap(25.2, 8, [], gaps, scale, false)).toEqual({
      beat: 24,
      target: 32,
      isValid: true,
    });
  });

  it("is invalid over a block", () => {
    expect(getCopySnap(36.2, 8, [], gaps, scale, false)).toEqual({
      beat: 36,
      target: undefined,
      isValid: false,
    });
  });

  it("does not pull a free beat", () => {
    expect(getCopySnap(47.5, 8, [], gaps, scale, true).isValid).toBe(false);
  });
});

describe("getSnapTargets", () => {
  it("collects other cue edges and Mixxx cue positions in beats", () => {
    const mixxxCues: MixxxCue[] = [
      { type: "intro", hotcue: undefined, label: "", color: 0, start: 2.25, end: 10.25 },
    ];
    expect(getSnapTargets(cues, [1], mixxxCues, beats)).toEqual([0, 64, 4, 20]);
  });

  it("rounds Mixxx cues that sit just off the grid to the nearest beat", () => {
    const mixxxCues: MixxxCue[] = [
      { type: "hotcue", hotcue: 0, label: "", color: 0, start: 2.265, end: undefined },
      { type: "hotcue", hotcue: 1, label: "", color: 0, start: 4.375, end: undefined },
    ];
    expect(getSnapTargets(cues, [1], mixxxCues, beats)).toEqual([0, 64, 4, 8.25]);
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
      beat: 21.6,
      target: 37.6,
    });
    expect(getMoveSnap(21.4, 16, [21.3, 37.6], scale)).toMatchObject({ beat: 21.3, target: 21.3 });
  });

  it("rounds away floating point error when the end snaps", () => {
    expect(getMoveSnap(0.15, 0.1, [0.3], scale)).toMatchObject({ beat: 0.2, target: 0.3 });
  });

  it("snaps the start of a block without end", () => {
    expect(getMoveSnap(21.4, undefined, [37.6], scale)).toMatchObject({
      beat: 21,
      target: undefined,
    });
  });
});
