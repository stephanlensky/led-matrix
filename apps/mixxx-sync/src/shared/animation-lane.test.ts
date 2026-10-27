import { type StoredAnimation, storedAnimationSchema } from "@led-matrix/core";
import { describe, expect, it } from "vitest";
import { getAnimationLane, getBlockPosition } from "./animation-lane.ts";
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
      boundaries: [],
    });
    expect(getBlockPosition(blocks[0]!, 16, FPS)).toBeUndefined();
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

describe("getBlockPosition", () => {
  it("stretches a fitted once section over the block", () => {
    const [block] = getLane([{ beat: 4, end: 20, animation: "intro" }]).blocks;
    expect(getBlockPosition(block!, 12, FPS)).toEqual({ index: 0, time: 2000 });
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
