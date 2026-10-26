import { describe, expect, it } from "vitest";
import { getPosePath, interpolatePaths, parseSvgPath, transformPath } from "./svg-path.ts";

describe("parseSvgPath", () => {
  it("converts relative and shorthand commands to absolute curves and lines", () => {
    expect(parseSvgPath("M10 10 h5 v5 l-5 0 z")).toEqual([
      { type: "M", values: [10, 10] },
      { type: "L", values: [15, 10] },
      { type: "L", values: [15, 15] },
      { type: "L", values: [10, 15] },
      { type: "Z", values: [] },
    ]);
    expect(parseSvgPath("M0,0C1,2,3,4,5,6s3,4,5,6")).toEqual([
      { type: "M", values: [0, 0] },
      { type: "C", values: [1, 2, 3, 4, 5, 6] },
      { type: "C", values: [7, 8, 8, 10, 10, 12] },
    ]);
    expect(parseSvgPath("m1 1 2 2 q1-1 2 0 t2 0")).toEqual([
      { type: "M", values: [1, 1] },
      { type: "L", values: [3, 3] },
      { type: "Q", values: [4, 2, 5, 3] },
      { type: "Q", values: [6, 4, 7, 3] },
    ]);
  });

  it("rejects arcs", () => {
    expect(() => parseSvgPath("M0 0 A5 5 0 0 1 10 10")).toThrow('Unsupported SVG path command "A"');
  });
});

describe("pose paths", () => {
  const poses = [
    parseSvgPath("M0 0 L10 0"),
    parseSvgPath("M0 10 L10 10"),
    parseSvgPath("M0 20 L20 20"),
  ];

  it("interpolates between neighbouring poses", () => {
    expect(getPosePath(poses, 0.5)).toEqual(parseSvgPath("M0 5 L10 5"));
    expect(getPosePath(poses, 1.5)).toEqual(parseSvgPath("M0 15 L15 15"));
    expect(getPosePath(poses, 2)).toEqual(poses[2]);
    expect(getPosePath(poses, 5)).toEqual(poses[2]);
  });

  it("requires matching path structure", () => {
    expect(() => interpolatePaths(parseSvgPath("M0 0 L1 1"), parseSvgPath("M0 0 Z"), 0.5)).toThrow(
      "same commands",
    );
  });
});

describe("transformPath", () => {
  it("maps every coordinate pair", () => {
    expect(transformPath(parseSvgPath("M1 2 C3 4 5 6 7 8 Z"), (x, y) => [x * 2, y + 1])).toEqual(
      parseSvgPath("M2 3 C6 5 10 7 14 9 Z"),
    );
  });
});
