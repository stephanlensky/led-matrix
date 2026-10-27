import { type StoredAnimation, storedAnimationSchema } from "@led-matrix/core";
import { describe, expect, it } from "vitest";
import { getCue, getResolvedMapping, mappingSchema } from "./mapping.ts";

const layers = [{ effect: "solid" }];

const animations: StoredAnimation[] = [
  storedAnimationSchema.parse({
    id: "cat",
    name: "Cat",
    sections: [
      { name: "Stare", mode: { type: "loop", beats: 4 }, layers },
      { name: "Spawn", mode: { type: "once", beats: 16 }, layers },
      { name: "Bounce", mode: { type: "loop", beats: 8 }, layers },
    ],
  }),
  storedAnimationSchema.parse({
    id: "plasma",
    name: "Plasma",
    mode: { type: "loop", beats: 8 },
    layers,
  }),
];

describe("mappingSchema", () => {
  it("requires an animation on the first cue", () => {
    expect(mappingSchema.safeParse({ tracks: { a: [{ beat: 0, section: 1 }] } }).success).toBe(
      false,
    );
  });

  it("requires increasing beats", () => {
    const cues = [
      { beat: 16, animation: "cat" },
      { beat: 16, section: "Spawn" },
    ];
    expect(mappingSchema.safeParse({ tracks: { a: cues } }).success).toBe(false);
  });
});

describe("getResolvedMapping", () => {
  it("carries the animation over and resolves section names", () => {
    const file = mappingSchema.parse({
      tracks: {
        "/music/a.flac": [
          { beat: 0, animation: "cat" },
          { beat: 64, section: "Spawn" },
          { beat: 128, animation: "plasma" },
          { beat: 192, animation: "cat", section: 2 },
        ],
      },
    });
    const { mapping, errors } = getResolvedMapping(file, animations);
    expect(errors).toEqual([]);
    expect(mapping.get("/music/a.flac")).toEqual([
      { beat: 0, animationId: "cat", section: 0 },
      { beat: 64, animationId: "cat", section: 1 },
      { beat: 128, animationId: "plasma", section: 0 },
      { beat: 192, animationId: "cat", section: 2 },
    ]);
  });

  it("skips tracks with unknown animations or sections", () => {
    const file = mappingSchema.parse({
      tracks: {
        a: [{ beat: 0, animation: "missing" }],
        b: [{ beat: 0, animation: "cat", section: "Drop" }],
        c: [{ beat: 0, animation: "plasma", section: 1 }],
        d: [{ beat: 0, animation: "plasma" }],
      },
    });
    const { mapping, errors } = getResolvedMapping(file, animations);
    expect([...mapping.keys()]).toEqual(["d"]);
    expect(errors).toHaveLength(3);
  });
});

describe("getCue", () => {
  const cues = [
    { beat: 8, animationId: "cat", section: 0 },
    { beat: 32, animationId: "cat", section: 1 },
  ];

  it("returns the last cue at or before the beat", () => {
    expect(getCue(cues, 7.9)).toBeUndefined();
    expect(getCue(cues, 8)).toBe(cues[0]);
    expect(getCue(cues, 40)).toBe(cues[1]);
  });
});
