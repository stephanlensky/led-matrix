import { describe, expect, it } from "vitest";
import type { MappingFile } from "./mapping.ts";
import { addCue, clearCueEnd, moveCue, removeCue, resizeCue } from "./mapping-edits.ts";

const location = "/music/a.flac";

const file: MappingFile = {
  tracks: {
    [location]: [
      { beat: 0, animation: "cat" },
      { beat: 32, end: 48, section: "Spawn" },
      { beat: 64, animation: "plasma" },
    ],
    "/music/b.flac": [{ beat: 0, animation: "plasma" }],
  },
};

describe("addCue", () => {
  it("inserts the cue in beat order and makes animations explicit", () => {
    expect(addCue(file, location, { beat: 16, animation: "plasma" }).tracks[location]).toEqual([
      { beat: 0, animation: "cat" },
      { beat: 16, animation: "plasma" },
      { beat: 32, end: 48, animation: "cat", section: "Spawn" },
      { beat: 64, animation: "plasma" },
    ]);
  });

  it("replaces a cue at the same beat", () => {
    expect(addCue(file, location, { beat: 64, animation: "cat" }).tracks[location]?.[2]).toEqual({
      beat: 64,
      animation: "cat",
    });
  });

  it("ends a previous cue that overlaps the new cue", () => {
    expect(addCue(file, location, { beat: 40, animation: "plasma" }).tracks[location]?.[1]).toEqual(
      { beat: 32, end: 40, animation: "cat", section: "Spawn" },
    );
  });

  it("creates a track", () => {
    const result = addCue(file, "/music/c.flac", { beat: -1, end: 8, animation: "cat" });
    expect(result.tracks["/music/c.flac"]).toEqual([{ beat: -1, end: 8, animation: "cat" }]);
    expect(file.tracks["/music/c.flac"]).toBeUndefined();
  });
});

describe("moveCue", () => {
  it("shifts the end with the beat", () => {
    expect(moveCue(file, location, 1, 36).tracks[location]?.[1]).toEqual({
      beat: 36,
      end: 52,
      animation: "cat",
      section: "Spawn",
    });
  });

  it("keeps cues sorted", () => {
    expect(moveCue(file, location, 0, 80).tracks[location]?.map(({ beat }) => beat)).toEqual([
      32, 64, 80,
    ]);
  });

  it("rejects a move onto another cue", () => {
    expect(() => moveCue(file, location, 0, 64)).toThrow("Cue beats must increase");
  });
});

describe("resizeCue", () => {
  it("changes the start and keeps the end", () => {
    expect(resizeCue(file, location, 1, { beat: 24, end: 48 }).tracks[location]?.[1]).toEqual({
      beat: 24,
      end: 48,
      animation: "cat",
      section: "Spawn",
    });
  });

  it("removes the end", () => {
    expect(
      resizeCue(file, location, 1, { beat: 32, end: undefined }).tracks[location]?.[1],
    ).toEqual({ beat: 32, animation: "cat", section: "Spawn" });
  });

  it("rejects an end at or before the beat", () => {
    expect(() => resizeCue(file, location, 1, { beat: 32, end: 32 })).toThrow(
      "End must be after the cue beat",
    );
  });
});

describe("removeCue", () => {
  it("keeps the following cues on their animation", () => {
    const cues = [
      { beat: 0, animation: "cat" },
      { beat: 16, animation: "plasma" },
      { beat: 32, section: 1 },
    ];
    expect(removeCue({ tracks: { a: cues } }, "a", 1).tracks["a"]).toEqual([
      { beat: 0, animation: "cat" },
      { beat: 32, animation: "plasma", section: 1 },
    ]);
  });

  it("deletes a track with no cues", () => {
    expect(Object.keys(removeCue(file, "/music/b.flac", 0).tracks)).toEqual([location]);
  });

  it("rejects a missing cue", () => {
    expect(() => removeCue(file, location, 3)).toThrow("Cue 3 not found");
  });
});

describe("clearCueEnd", () => {
  it("removes the end of a cue", () => {
    expect(clearCueEnd(file, location, 1).tracks[location]?.[1]).toEqual({
      beat: 32,
      animation: "cat",
      section: "Spawn",
    });
  });
});
