import { describe, expect, it } from "vitest";
import { createRandom, hashSeed } from "./random.ts";

describe("random", () => {
  it("is deterministic per seed", () => {
    const first = createRandom(hashSeed(4, 7));
    const second = createRandom(hashSeed(4, 7));
    const other = createRandom(hashSeed(5, 7));
    const values = [first(), first(), first()];
    expect([second(), second(), second()]).toEqual(values);
    expect(other()).not.toBe(values[0]);
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
  });
});
