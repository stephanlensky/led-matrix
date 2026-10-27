import { type StoredAnimation, storedAnimationSchema } from "@led-matrix/core";
import { describe, expect, it } from "vitest";
import {
  getAnimationLane,
  getBlockPosition,
  getCueKeys,
  getDropEnd,
  getLanePosition,
  getLiveBlock,
  isSameRender,
} from "./animation-lane.ts";
import type { Beats } from "./beats.ts";

const FPS = 30;
const layers = [{ effect: "solid" }];
const beats: Beats = { type: "grid", bpm: 120, firstBeat: 0 };
const duration = 100;

const animationsById = new Map<string, StoredAnimation>(
  [
    storedAnimationSchema.parse({
      id: "intro",
      name: "Intro",
      sections: [
        { name: "Rise", mode: { type: "once", beats: 8 }, layers },
        { name: "Hit", mode: { type: "once", beats: 4 }, layers },
        { name: "Pulse", mode: { type: "loop", beats: 4 }, layers },
      ],
    }),
    storedAnimationSchema.parse({
      id: "plasma",
      name: "Plasma",
      mode: { type: "loop", beats: 8 },
      layers,
    }),
  ].map((animation) => [animation.id, animation]),
);

function getLane(cues: Parameters<typeof getAnimationLane>[0]) {
  return getAnimationLane(cues, animationsById, beats, duration, FPS);
}

describe("getAnimationLane", () => {
  it("spans each block to the next cue or the track end", () => {
    const { blocks, errors } = getLane([
      { beat: 0, animation: "plasma" },
      { beat: 32, animation: "intro" },
    ]);
    expect(errors).toEqual([]);
    expect(blocks.map(({ beat, end, stop, hasEnd }) => ({ beat, end, stop, hasEnd }))).toEqual([
      { beat: 0, end: 32, stop: 32, hasEnd: false },
      { beat: 32, end: 200, stop: 200, hasEnd: false },
    ]);
  });

  it("marks the sections a cue without end flows into", () => {
    const { blocks } = getLane([
      { beat: 0, animation: "intro" },
      { beat: 10, animation: "plasma" },
    ]);
    expect(blocks[0]?.boundaries).toEqual([{ beat: 8, section: 1 }]);
    expect(getLane([{ beat: 0, animation: "intro" }]).blocks[0]?.boundaries).toEqual([
      { beat: 8, section: 1 },
      { beat: 12, section: 2 },
    ]);
  });

  it("stops at end and leaves the rest of the block blank", () => {
    const { blocks } = getLane([
      { beat: 0, end: 16, animation: "intro" },
      { beat: 32, animation: "plasma" },
    ]);
    expect(blocks[0]).toMatchObject({
      end: 16,
      stop: 32,
      hasEnd: true,
      fit: { section: 0, beats: 16 },
      boundaries: [{ beat: 32 / 3, section: 1 }],
    });
    expect(getBlockPosition(blocks[0]!, 16, FPS)).toBeUndefined();
  });

  it("ignores the blank cue after an end and keeps the cue index", () => {
    const { blocks } = getLane([
      { beat: 0, end: 16, animation: "intro" },
      { beat: 32, animation: "plasma" },
    ]);
    expect(blocks.map(({ index, beat }) => ({ index, beat }))).toEqual([
      { index: 0, beat: 0 },
      { index: 1, beat: 32 },
    ]);
  });

  it("fits only once sections", () => {
    const { blocks } = getLane([{ beat: 0, end: 20, animation: "plasma" }]);
    expect(blocks[0]?.fit).toBeNull();
  });

  it("reports resolve errors without a beat grid", () => {
    const lane = getAnimationLane(
      [{ beat: 4, animation: "missing" }],
      animationsById,
      undefined,
      duration,
      FPS,
    );
    expect(lane.errors).toEqual(['beat 4: animation "missing" not found']);
  });

  it("reports resolve errors without blocks", () => {
    expect(getLane([{ beat: 4, animation: "missing" }])).toEqual({
      blocks: [],
      errors: ['beat 4: animation "missing" not found'],
    });
  });
});

describe("isSameRender", () => {
  it("ignores the blank gap after an end", () => {
    const touching = getLane([
      { beat: 0, end: 16, animation: "intro" },
      { beat: 16, animation: "plasma" },
    ]);
    const apart = getLane([
      { beat: 0, end: 16, animation: "intro" },
      { beat: 20, animation: "plasma" },
    ]);
    expect(isSameRender(touching.blocks[0]!, apart.blocks[0]!)).toBe(true);
    expect(isSameRender(touching.blocks[1]!, apart.blocks[1]!)).toBe(false);
  });
});

describe("getCueKeys", () => {
  const cues = [
    { beat: 0, animation: "plasma" },
    { beat: 32, animation: "intro" },
  ];
  const initial = getCueKeys(undefined, cues);

  it("keeps keys when a cue is inserted before others", () => {
    expect(getCueKeys(initial, [{ beat: -8, animation: "intro" }, ...cues]).keys).toEqual([
      2, 0, 1,
    ]);
  });

  it("keeps keys when a cue is removed", () => {
    expect(getCueKeys(initial, [cues[1]!]).keys).toEqual([1]);
  });

  it("keeps the key of a moved cue", () => {
    expect(getCueKeys(initial, [cues[0]!, { beat: 36, animation: "intro" }]).keys).toEqual([0, 1]);
  });
});

describe("getDropEnd", () => {
  const intro = animationsById.get("intro")!;
  const plasma = animationsById.get("plasma")!;

  it("ends after the chain of once sections", () => {
    expect(getDropEnd(intro, 0, 16, 40, 120, FPS)).toBe(28);
    expect(getDropEnd(intro, 1, 16, 40, 120, FPS)).toBe(20);
  });

  it("ends after one iteration of a loop section", () => {
    expect(getDropEnd(intro, 2, 16, 40, 120, FPS)).toBe(20);
    expect(getDropEnd(plasma, 0, 16, 40, 120, FPS)).toBe(24);
  });

  it("stops at the next cue", () => {
    expect(getDropEnd(intro, 0, 16, 20, 120, FPS)).toBe(20);
    expect(getDropEnd(plasma, 0, 16, 18, 120, FPS)).toBe(18);
  });
});

describe("getBlockPosition", () => {
  it("stretches the chain of once sections over the block", () => {
    const [block] = getLane([{ beat: 4, end: 20, animation: "intro" }]).blocks;
    expect(getBlockPosition(block!, 12, FPS)).toEqual({ index: 0, time: 3000 });
    expect(getBlockPosition(block!, 18, FPS)?.index).toBe(1);
  });

  it("repeats a loop at its native length", () => {
    const [block] = getLane([{ beat: 0, end: 20, animation: "plasma" }]).blocks;
    expect(getBlockPosition(block!, 10, FPS)).toEqual({ index: 0, time: 1000 });
  });

  it("flows into later sections and holds the loop", () => {
    const [block] = getLane([{ beat: 0, animation: "intro" }]).blocks;
    expect(getBlockPosition(block!, 9, FPS)).toEqual({ index: 1, time: 500 });
    expect(getBlockPosition(block!, 18, FPS)).toEqual({ index: 2, time: 1000 });
  });

  it("is blank before the cue", () => {
    const [block] = getLane([{ beat: 4, animation: "plasma" }]).blocks;
    expect(getBlockPosition(block!, 2, FPS)).toBeUndefined();
  });
});

describe("getLanePosition", () => {
  const { blocks } = getLane([
    { beat: 4, animation: "plasma" },
    { beat: 16, end: 20, animation: "intro" },
    { beat: 32, animation: "plasma" },
  ]);

  it("is blank before the first cue", () => {
    expect(getLanePosition(blocks, 3.5, FPS)).toBeUndefined();
  });

  it("uses the latest cue at or before the beat", () => {
    expect(getLanePosition(blocks, 4, FPS)?.block.beat).toBe(4);
    expect(getLanePosition(blocks, 15.9, FPS)?.block.beat).toBe(4);
    expect(getLanePosition(blocks, 16, FPS)?.block.animation.id).toBe("intro");
    expect(getLanePosition(blocks, 40, FPS)?.block.beat).toBe(32);
  });

  it("is blank between a cue end and the next cue", () => {
    expect(getLanePosition(blocks, 20, FPS)).toBeUndefined();
    expect(getLanePosition(blocks, 31.9, FPS)).toBeUndefined();
  });

  it("matches the block position", () => {
    expect(getLanePosition(blocks, 18, FPS)?.position).toEqual(
      getBlockPosition(blocks[1]!, 18, FPS),
    );
  });
});

describe("getLiveBlock", () => {
  const { blocks } = getLane([
    { beat: 4, animation: "plasma" },
    { beat: 16, end: 20, animation: "intro" },
  ]);

  it("finds the block of the live cue", () => {
    expect(getLiveBlock(blocks, { beat: 16, animationId: "intro", section: 0 })).toEqual({
      index: 1,
      isBlank: false,
    });
  });

  it("finds the block whose end gap is live", () => {
    expect(getLiveBlock(blocks, { beat: 20, animationId: null })).toEqual({
      index: 1,
      isBlank: true,
    });
  });

  it("ignores cues that are not on the lane", () => {
    expect(getLiveBlock(blocks, undefined)).toBeUndefined();
    expect(getLiveBlock(blocks, { beat: 4, animationId: "intro", section: 0 })).toBeUndefined();
  });
});
