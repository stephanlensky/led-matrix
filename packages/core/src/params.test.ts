import { describe, expect, it } from "vitest";
import { effects, getEffect } from "./effects/index.ts";
import { getParamFields, getParamLabel } from "./params.ts";

describe("getParamLabel", () => {
  it("converts camel case keys to sentence case", () => {
    expect(getParamLabel("flashesPerBeat")).toBe("Flashes per beat");
    expect(getParamLabel("y")).toBe("Y");
  });
});

describe("getParamFields", () => {
  it("describes every built-in effect param", () => {
    for (const effect of effects) {
      expect(getParamFields(effect.params).map((field) => field.key)).toEqual(
        Object.keys(effect.params.shape),
      );
    }
  });

  it("maps schema types to field types", () => {
    const effect = getEffect("scrolling-text");
    const strobe = getEffect("strobe");
    const bigText = getEffect("big-text");
    const text = getEffect("text");
    if (!effect || !strobe || !bigText || !text) {
      throw new Error("Missing built-in effect");
    }
    const fields = Object.fromEntries(getParamFields(effect.params).map((f) => [f.key, f]));
    expect(fields.text).toMatchObject({ type: "text", isMultiline: false, defaultValue: "HELLO" });
    expect(fields.font).toMatchObject({ type: "enum", defaultValue: "spleen-8x16" });
    expect(fields.color).toMatchObject({ type: "color", defaultValue: "#ffffff" });
    expect(fields.cycles).toMatchObject({ type: "number", min: 1, max: 32, step: 1 });
    expect(fields.y).toMatchObject({ type: "number", isOptional: true, defaultValue: undefined });
    expect(fields.cycles).toMatchObject({ isOptional: false });
    expect(getParamFields(strobe.params).find((f) => f.key === "flashesPerBeat")).toMatchObject({
      min: 0,
      max: 16,
      step: 0.16,
    });
    expect(getParamFields(bigText.params).find((f) => f.key === "fitWidth")).toMatchObject({
      type: "boolean",
      defaultValue: true,
    });
    expect(getParamFields(text.params).find((f) => f.key === "text")).toMatchObject({
      isMultiline: true,
    });
  });
});
