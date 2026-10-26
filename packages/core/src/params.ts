import { z } from "zod";
import type { EffectParamsSchema } from "./effect.ts";

export type NumberParamField = {
  type: "number";
  key: string;
  label: string;
  isOptional: boolean;
  defaultValue: number | undefined;
  min: number | undefined;
  max: number | undefined;
  step: number;
};

export type ColorParamField = {
  type: "color";
  key: string;
  label: string;
  isOptional: boolean;
  defaultValue: string | undefined;
};

export type TextParamField = {
  type: "text";
  key: string;
  label: string;
  isOptional: boolean;
  defaultValue: string | undefined;
  isMultiline: boolean;
  maxLength: number | undefined;
};

export type EnumParamField = {
  type: "enum";
  key: string;
  label: string;
  isOptional: boolean;
  defaultValue: string | undefined;
  options: readonly string[];
};

export type BooleanParamField = {
  type: "boolean";
  key: string;
  label: string;
  isOptional: boolean;
  defaultValue: boolean | undefined;
};

export type ParamField =
  | NumberParamField
  | ColorParamField
  | TextParamField
  | EnumParamField
  | BooleanParamField;

const DEFAULT_STEP_COUNT = 100;
const DEFAULT_STEP = 0.01;

const propertySchema = z.object({
  type: z.enum(["number", "integer", "string", "boolean"]),
  default: z.unknown().optional(),
  minimum: z.number().optional(),
  exclusiveMinimum: z.number().optional(),
  maximum: z.number().optional(),
  exclusiveMaximum: z.number().optional(),
  maxLength: z.number().optional(),
  enum: z.array(z.string()).optional(),
  format: z.string().optional(),
  multiline: z.boolean().optional(),
});

const objectSchema = z.object({
  properties: z.record(z.string(), propertySchema),
});

export function getParamLabel(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function getNumberStep(type: "number" | "integer", min?: number, max?: number): number {
  if (type === "integer") {
    return 1;
  }
  return min === undefined || max === undefined ? DEFAULT_STEP : (max - min) / DEFAULT_STEP_COUNT;
}

function getField(
  key: string,
  property: z.infer<typeof propertySchema>,
  isOptional: boolean,
): ParamField {
  const base = { key, label: getParamLabel(key), isOptional };
  const defaultValue = property.default;
  if (property.type === "number" || property.type === "integer") {
    const min = property.minimum ?? property.exclusiveMinimum;
    const max = property.maximum ?? property.exclusiveMaximum;
    return {
      ...base,
      type: "number",
      defaultValue: typeof defaultValue === "number" ? defaultValue : undefined,
      min,
      max,
      step: getNumberStep(property.type, min, max),
    };
  }
  if (property.type === "boolean") {
    return {
      ...base,
      type: "boolean",
      defaultValue: typeof defaultValue === "boolean" ? defaultValue : undefined,
    };
  }
  const stringDefault = typeof defaultValue === "string" ? defaultValue : undefined;
  if (property.enum) {
    return { ...base, type: "enum", defaultValue: stringDefault, options: property.enum };
  }
  if (property.format === "color") {
    return { ...base, type: "color", defaultValue: stringDefault };
  }
  return {
    ...base,
    type: "text",
    defaultValue: stringDefault,
    isMultiline: property.multiline ?? false,
    maxLength: property.maxLength,
  };
}

export function getParamFields(schema: EffectParamsSchema): ParamField[] {
  const { properties } = objectSchema.parse(z.toJSONSchema(schema, { io: "input" }));
  return Object.entries(properties).map(([key, property]) =>
    getField(
      key,
      property,
      property.default === undefined && schema.shape[key]?.safeParse(undefined).success === true,
    ),
  );
}
