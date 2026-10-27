import { describe, expect, it } from "vitest";
import { animationSchema } from "./animation.ts";
import { getPresetAnimation, getPresetColors, getPresetValues } from "./presets.ts";

const animation = animationSchema.parse({
  name: "Strobe",
  presets: [
    { name: "White", values: { color: "#ffffff", duty: 0.25 } },
    { name: "Orange", values: { color: "#ff5a00" } },
  ],
  sections: [
    {
      mode: { type: "loop", beats: 1 },
      layers: [
        { effect: "strobe", params: { color: { preset: "color" }, duty: { preset: "duty" } } },
      ],
    },
  ],
});

function getIssuePaths(input: unknown): string[] {
  return (animationSchema.safeParse(input).error?.issues ?? []).map(({ path }) => path.join("."));
}

describe("presets", () => {
  it("falls back to the first preset for missing values", () => {
    expect(getPresetValues(animation, "Orange")).toEqual({ color: "#ff5a00", duty: 0.25 });
    expect(getPresetValues(animation, undefined)).toEqual({ color: "#ffffff", duty: 0.25 });
  });

  it("replaces references with preset values", () => {
    const [section] = getPresetAnimation(animation, "Orange").sections;
    expect(section?.layers[0]?.params).toEqual({ color: "#ff5a00", duty: 0.25 });
  });

  it("uses the first preset for unknown names", () => {
    const [section] = getPresetAnimation(animation, "Missing").sections;
    expect(section?.layers[0]?.params["color"]).toBe("#ffffff");
  });

  it("rejects references to values the first preset does not define", () => {
    expect(
      getIssuePaths({
        ...animation,
        presets: [{ name: "White", values: { duty: 0.25 } }],
      }),
    ).toEqual(["sections.0.layers.0.params.color"]);
  });

  it("validates params for every preset", () => {
    const presets = [...(animation.presets ?? []), { name: "Bad", values: { duty: 2 } }];
    const result = animationSchema.safeParse({ ...animation, presets });
    expect(result.error?.issues.map(({ message }) => message)).toEqual([
      expect.stringContaining('(preset "Bad")'),
    ]);
  });

  it("rejects duplicate preset names", () => {
    const presets = [...(animation.presets ?? []), { name: "White", values: {} }];
    expect(getIssuePaths({ ...animation, presets })).toEqual(["presets.2.name"]);
  });

  it("lists the distinct colors of a preset within the palette color count", () => {
    expect(
      getPresetColors({
        name: "Orange",
        values: { color1: "#FF5A00", color2: "#000000", color3: "#000000", colorCount: 1 },
      }),
    ).toEqual(["#ff5a00"]);
    expect(
      getPresetColors({ name: "Rumble", values: { a: "#000000", b: "#ffffff", c: "#000000" } }),
    ).toEqual(["#000000", "#ffffff"]);
  });
});
