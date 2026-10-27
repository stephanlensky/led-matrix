import { z } from "zod";
import { colorSchema } from "./color.ts";

export const presetReferenceSchema = z.strictObject({ preset: z.string().min(1) });

export const presetSchema = z.object({
  name: z.string().min(1).max(100),
  values: z.record(z.string(), z.unknown()),
});

export const presetsSchema = z.array(presetSchema).superRefine((presets, context) => {
  const names = new Set<string>();
  for (const [index, { name }] of presets.entries()) {
    if (names.has(name)) {
      context.addIssue({
        code: "custom",
        path: [index, "name"],
        message: `Duplicate preset name "${name}"`,
      });
    }
    names.add(name);
  }
});

export type PresetReference = z.infer<typeof presetReferenceSchema>;

export type Preset = z.infer<typeof presetSchema>;

type PresetDocument = { presets?: readonly Preset[] | undefined };

export function getPresetReference(value: unknown): string | undefined {
  const result = presetReferenceSchema.safeParse(value);
  return result.success ? result.data.preset : undefined;
}

export function getPreset(
  { presets }: PresetDocument,
  name: string | null | undefined,
): Preset | undefined {
  return name === null || name === undefined
    ? presets?.[0]
    : presets?.find((preset) => preset.name === name);
}

export function getPresetValues(
  document: PresetDocument,
  name: string | null | undefined,
): Record<string, unknown> {
  return { ...document.presets?.[0]?.values, ...getPreset(document, name)?.values };
}

export function getPresetParams(
  params: Readonly<Record<string, unknown>>,
  values: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => {
      const reference = getPresetReference(value);
      return [key, reference === undefined ? value : values[reference]];
    }),
  );
}

type LayerDocument = { params: Readonly<Record<string, unknown>> };

type AnimationDocument<L extends LayerDocument> = PresetDocument & {
  sections: readonly { layers: readonly L[] }[];
};

export function getPresetAnimation<A extends AnimationDocument<LayerDocument>>(
  animation: A,
  name: string | null | undefined,
): A {
  if (!animation.presets?.length) {
    return animation;
  }
  const values = getPresetValues(animation, name);
  return {
    ...animation,
    sections: animation.sections.map((section) => ({
      ...section,
      layers: section.layers.map((layer) => ({
        ...layer,
        params: getPresetParams(layer.params, values),
      })),
    })),
  };
}

export function getPresetName(
  document: PresetDocument,
  name: string | null | undefined,
): string | null {
  return (getPreset(document, name) ?? getPreset(document, undefined))?.name ?? null;
}

const MAX_PRESET_COLORS = 4;

function isPaletteColorHidden(key: string, colorCount: unknown): boolean {
  const index = /^color(\d+)$/.exec(key)?.[1];
  return typeof colorCount === "number" && index !== undefined && Number(index) > colorCount;
}

export function getPresetColors({ values }: Preset): string[] {
  const colors = Object.entries(values).flatMap(([key, value]) =>
    colorSchema.safeParse(value).success && !isPaletteColorHidden(key, values["colorCount"])
      ? [String(value).toLowerCase()]
      : [],
  );
  return [...new Set(colors)].slice(0, MAX_PRESET_COLORS);
}
