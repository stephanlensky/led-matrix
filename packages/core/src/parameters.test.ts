import { describe, expect, it } from "vitest";
import { animationSchema } from "./animation.ts";
import {
  getOptionColors,
  getParameterAnimation,
  getParameterSelection,
  getParameterSelectionError,
  getParameterValues,
} from "./parameters.ts";

const animation = animationSchema.parse({
  name: "Strobe",
  parameters: [
    {
      name: "Color",
      options: [
        { name: "White", values: { color: "#ffffff", duty: 0.25 } },
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
  sections: [
    {
      mode: { type: "loop", beats: 1 },
      layers: [
        {
          effect: "strobe",
          params: {
            color: { param: "color" },
            duty: { param: "duty" },
            flashesPerBeat: { param: "flashesPerBeat" },
          },
        },
      ],
    },
  ],
});

function getIssuePaths(input: unknown): string[] {
  return (animationSchema.safeParse(input).error?.issues ?? []).map(({ path }) => path.join("."));
}

describe("parameters", () => {
  it("falls back to the first option for missing values and unselected parameters", () => {
    expect(getParameterValues(animation, { Color: "Orange" })).toEqual({
      color: "#ff5a00",
      duty: 0.25,
      flashesPerBeat: 1,
    });
    expect(getParameterValues(animation, undefined)).toEqual({
      color: "#ffffff",
      duty: 0.25,
      flashesPerBeat: 1,
    });
  });

  it("replaces references with the selected option values", () => {
    const [section] = getParameterAnimation(animation, {
      Color: "Orange",
      Speed: "Double",
    }).sections;
    expect(section?.layers[0]?.params).toEqual({
      color: "#ff5a00",
      duty: 0.25,
      flashesPerBeat: 2,
    });
  });

  it("resolves a full selection with defaults for unknown options", () => {
    expect(getParameterSelection(animation, { Color: "Missing", Speed: "Double" })).toEqual({
      Color: "White",
      Speed: "Double",
    });
  });

  it("uses the default option when one is set", () => {
    const [color, speed] = animation.parameters ?? [];
    const withDefault = animationSchema.parse({
      ...animation,
      parameters: [color, { ...speed, default: "Double" }],
    });
    expect(getParameterSelection(withDefault, {})).toEqual({ Color: "White", Speed: "Double" });
    expect(getParameterValues(withDefault, {})["flashesPerBeat"]).toBe(2);
    expect(
      getIssuePaths({ ...animation, parameters: [color, { ...speed, default: "Missing" }] }),
    ).toEqual(["parameters.1.default"]);
  });

  it("reports unknown parameters and options", () => {
    expect(getParameterSelectionError(animation, { Color: "Orange" })).toBeUndefined();
    expect(getParameterSelectionError(animation, { Size: "Small" })).toBe(
      'Parameter "Size" not found',
    );
    expect(getParameterSelectionError(animation, { Color: "Pink" })).toBe(
      'Option "Pink" not found in parameter "Color"',
    );
  });

  it("rejects references to values no parameter defines", () => {
    expect(
      getIssuePaths({
        ...animation,
        parameters: [{ name: "Color", options: [{ name: "White", values: { duty: 0.25 } }] }],
      }),
    ).toEqual(["sections.0.layers.0.params.color", "sections.0.layers.0.params.flashesPerBeat"]);
  });

  it("validates params for every option", () => {
    const [color, speed] = animation.parameters ?? [];
    const result = animationSchema.safeParse({
      ...animation,
      parameters: [
        color,
        {
          name: "Speed",
          options: [...(speed?.options ?? []), { name: "Bad", values: { flashesPerBeat: 99 } }],
        },
      ],
    });
    expect(result.error?.issues.map(({ message }) => message)).toEqual([
      expect.stringContaining('(Speed "Bad")'),
    ]);
  });

  it("rejects duplicate names and values set by two parameters", () => {
    const [color, speed] = animation.parameters ?? [];
    expect(
      getIssuePaths({
        ...animation,
        parameters: [color, speed, { name: "Color", options: [{ name: "White", values: {} }] }],
      }),
    ).toEqual(["parameters.2.name"]);
    expect(
      getIssuePaths({
        ...animation,
        parameters: [
          color,
          speed,
          { name: "Duty", options: [{ name: "Long", values: { duty: 0.5 } }] },
        ],
      }),
    ).toEqual(["parameters.2.options"]);
    expect(
      getIssuePaths({
        ...animation,
        parameters: [
          { name: "Color", options: [...(color?.options ?? []), { name: "White", values: {} }] },
          speed,
        ],
      }),
    ).toEqual(["parameters.0.options.2.name"]);
  });

  it("lists the distinct colors of an option within the palette color count", () => {
    expect(
      getOptionColors({
        name: "Orange",
        values: { color1: "#FF5A00", color2: "#000000", color3: "#000000", colorCount: 1 },
      }),
    ).toEqual(["#ff5a00"]);
    expect(
      getOptionColors({ name: "Rumble", values: { a: "#000000", b: "#ffffff", c: "#000000" } }),
    ).toEqual(["#000000", "#ffffff"]);
  });
});
