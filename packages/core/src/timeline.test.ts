import { describe, expect, it } from "vitest";
import { getTimelineCueIndex } from "./timeline.ts";

describe("getTimelineCueIndex", () => {
  const cues = [{ beat: -1 }, { beat: 16 }, { beat: 16 }, { beat: 32 }];

  it("finds the last cue at or before the beat", () => {
    expect(getTimelineCueIndex(cues, -2)).toBe(-1);
    expect(getTimelineCueIndex(cues, -1)).toBe(0);
    expect(getTimelineCueIndex(cues, 15.9)).toBe(0);
    expect(getTimelineCueIndex(cues, 16)).toBe(2);
    expect(getTimelineCueIndex(cues, 100)).toBe(3);
    expect(getTimelineCueIndex([], 0)).toBe(-1);
  });
});
