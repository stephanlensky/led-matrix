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
    id: "strobe",
    name: "Strobe",
    parameters: [
      {
        name: "Color",
        options: [
          { name: "White", values: { color: "#ffffff" } },
          { name: "Orange", values: { color: "#ff5a00" } },
        ],
      },
      {
        name: "Speed",
        options: [
          { name: "Beat", values: { flashesPerBeat: 1 } },
          { name: "Double", values: { flashesPerBeat: 2 } },
        ],
      },
    ],
    mode: { type: "loop", beats: 1 },
    layers: [
      {
        effect: "strobe",
        params: { color: { param: "color" }, flashesPerBeat: { param: "flashesPerBeat" } },
      },
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
  it("carries params over until the animation changes", () => {
    const file = mappingSchema.parse({
      tracks: {
        a: [
          { beat: 0, animation: "strobe", params: { Color: "Orange" } },
          { beat: 8 },
          { beat: 16, params: { Speed: "Double" } },
          { beat: 24, animation: "strobe" },
        ],
      },
    });
    const cues = getResolvedMapping(file, animations).mapping.get("a") ?? [];
    expect(cues.map((cue) => ("params" in cue ? cue.params : null))).toEqual([
      { Color: "Orange" },
      { Color: "Orange" },
      { Color: "Orange", Speed: "Double" },
      undefined,
    ]);
  });

  it("reports unknown parameters and options", () => {
    const file = mappingSchema.parse({
      tracks: {
        a: [{ beat: 0, animation: "strobe", params: { Color: "Missing" } }],
        b: [{ beat: 0, animation: "strobe", params: { Size: "Small" } }],
      },
    });
    expect(getResolvedMapping(file, animations).errors).toEqual([
      'a beat 0: Option "Missing" not found in parameter "Color" in "strobe"',
      'b beat 0: Parameter "Size" not found in "strobe"',
    ]);
  });

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
      { beat: 0, animationId: "cat", section: 0, params: undefined, beats: undefined },
      { beat: 64, animationId: "cat", section: 1, params: undefined, beats: undefined },
      { beat: 128, animationId: "plasma", section: 0, params: undefined, beats: undefined },
      { beat: 192, animationId: "cat", section: 2, params: undefined, beats: undefined },
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

describe("cue end", () => {
  it("fits a once section between the cue and its end beat", () => {
    const file = mappingSchema.parse({
      tracks: {
        a: [
          { beat: 8, end: 24, animation: "cat", section: "Spawn" },
          { beat: 24, section: "Bounce" },
        ],
      },
    });
    expect(getResolvedMapping(file, animations).mapping.get("a")).toEqual([
      { beat: 8, animationId: "cat", section: 1, params: undefined, beats: 16 },
      { beat: 24, animationId: "cat", section: 2, params: undefined, beats: undefined },
    ]);
  });

  it("fits each loop of a stretched loop section between the cue and its end beat", () => {
    const file = mappingSchema.parse({
      tracks: { a: [{ beat: 8, end: 40, animation: "plasma", loops: 4 }] },
    });
    expect(getResolvedMapping(file, animations).mapping.get("a")?.[0]).toEqual({
      beat: 8,
      animationId: "plasma",
      section: 0,
      beats: 8,
    });
  });

  it("does not fit loop sections without loops", () => {
    const file = mappingSchema.parse({
      tracks: { a: [{ beat: 8, end: 696, animation: "plasma" }] },
    });
    expect(getResolvedMapping(file, animations).mapping.get("a")?.[0]).toEqual({
      beat: 8,
      animationId: "plasma",
      section: 0,
      beats: undefined,
    });
  });

  it("adds a blank cue at an end before the next cue or the track end", () => {
    const file = mappingSchema.parse({
      tracks: {
        a: [
          { beat: 0, end: 16, animation: "cat", section: "Spawn" },
          { beat: 32, end: 64, animation: "plasma" },
        ],
      },
    });
    expect(getResolvedMapping(file, animations).mapping.get("a")).toEqual([
      { beat: 0, animationId: "cat", section: 1, params: undefined, beats: 16 },
      { beat: 16, animationId: null },
      { beat: 32, animationId: "plasma", section: 0, params: undefined, beats: undefined },
      { beat: 64, animationId: null },
    ]);
  });

  it("rejects an end before the cue beat", () => {
    const cues = [{ beat: 8, end: 8, animation: "plasma" }];
    expect(mappingSchema.safeParse({ tracks: { a: cues } }).success).toBe(false);
  });
});

describe("getCue", () => {
  const cues = [
    { beat: 8, animationId: "cat", section: 0, params: undefined, beats: undefined },
    { beat: 32, animationId: "cat", section: 1, params: undefined, beats: undefined },
  ];

  it("returns the last cue at or before the beat", () => {
    expect(getCue(cues, 7.9)).toBeUndefined();
    expect(getCue(cues, 8)).toBe(cues[0]);
    expect(getCue(cues, 40)).toBe(cues[1]);
  });
});
