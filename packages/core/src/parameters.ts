import { z } from "zod";
import { colorSchema } from "./color.ts";

export const parameterReferenceSchema = z.strictObject({ param: z.string().min(1) });

export const parameterOptionSchema = z.object({
  name: z.string().min(1).max(100),
  values: z.record(z.string(), z.unknown()),
});

function getDuplicateNameIssues(
  items: readonly { name: string }[],
  label: string,
  context: z.RefinementCtx,
): void {
  const names = new Set<string>();
  for (const [index, { name }] of items.entries()) {
    if (names.has(name)) {
      context.addIssue({
        code: "custom",
        path: [index, "name"],
        message: `Duplicate ${label} name "${name}"`,
      });
    }
    names.add(name);
  }
}

export const parameterSchema = z
  .object({
    name: z.string().min(1).max(100),
    default: z.string().min(1).optional(),
    options: z
      .array(parameterOptionSchema)
      .min(1)
      .superRefine((options, context) => getDuplicateNameIssues(options, "option", context)),
  })
  .refine(
    (parameter) =>
      parameter.default === undefined ||
      parameter.options.some(({ name }) => name === parameter.default),
    { path: ["default"], message: "Default must be one of the options" },
  );

function getValueKeys({ options }: Parameter): Set<string> {
  return new Set(options.flatMap(({ values }) => Object.keys(values)));
}

export const parametersSchema = z.array(parameterSchema).superRefine((parameters, context) => {
  getDuplicateNameIssues(parameters, "parameter", context);
  const owners = new Map<string, string>();
  for (const [index, parameter] of parameters.entries()) {
    for (const key of getValueKeys(parameter)) {
      const owner = owners.get(key);
      if (owner !== undefined && owner !== parameter.name) {
        context.addIssue({
          code: "custom",
          path: [index, "options"],
          message: `Value "${key}" is already set by parameter "${owner}"`,
        });
      }
      owners.set(key, parameter.name);
    }
  }
});

export const parameterSelectionSchema = z.record(z.string().min(1), z.string().min(1));

export type ParameterReference = z.infer<typeof parameterReferenceSchema>;

export type ParameterOption = z.infer<typeof parameterOptionSchema>;

export type Parameter = z.infer<typeof parameterSchema>;

export type ParameterSelection = z.infer<typeof parameterSelectionSchema>;

type ParameterDocument = { parameters?: readonly Parameter[] | undefined };

export function getParameterReference(value: unknown): string | undefined {
  const result = parameterReferenceSchema.safeParse(value);
  return result.success ? result.data.param : undefined;
}

export function getParameter(
  { parameters }: ParameterDocument,
  name: string,
): Parameter | undefined {
  return parameters?.find((parameter) => parameter.name === name);
}

export function getDefaultOption(parameter: Parameter): ParameterOption | undefined {
  return parameter.options.find(({ name }) => name === parameter.default) ?? parameter.options[0];
}

export function getParameterOption(
  parameter: Parameter,
  name: string | undefined,
): ParameterOption | undefined {
  return name === undefined
    ? getDefaultOption(parameter)
    : parameter.options.find((option) => option.name === name);
}

export function getParameterSelectionError(
  document: ParameterDocument,
  selection: Readonly<ParameterSelection>,
): string | undefined {
  for (const [name, option] of Object.entries(selection)) {
    const parameter = getParameter(document, name);
    if (!parameter) {
      return `Parameter "${name}" not found`;
    }
    if (!getParameterOption(parameter, option)) {
      return `Option "${option}" not found in parameter "${name}"`;
    }
  }
  return undefined;
}

export function getParameterSelection(
  { parameters }: ParameterDocument,
  selection: Readonly<ParameterSelection> | null | undefined,
): ParameterSelection {
  return Object.fromEntries(
    (parameters ?? []).map((parameter) => {
      const option =
        getParameterOption(parameter, selection?.[parameter.name]) ?? getDefaultOption(parameter);
      return [parameter.name, option?.name ?? ""];
    }),
  );
}

export function getParameterValues(
  { parameters }: ParameterDocument,
  selection: Readonly<ParameterSelection> | null | undefined,
): Record<string, unknown> {
  return Object.assign(
    {},
    ...(parameters ?? []).flatMap((parameter) => [
      getDefaultOption(parameter)?.values,
      getParameterOption(parameter, selection?.[parameter.name])?.values,
    ]),
  );
}

export function getValueParameter(
  { parameters }: ParameterDocument,
  key: string,
): Parameter | undefined {
  return parameters?.find((parameter) => getValueKeys(parameter).has(key));
}

export function getReferencedParams(
  params: Readonly<Record<string, unknown>>,
  values: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => {
      const reference = getParameterReference(value);
      return [key, reference === undefined ? value : values[reference]];
    }),
  );
}

type LayerDocument = { params: Readonly<Record<string, unknown>> };

type AnimationDocument<L extends LayerDocument> = ParameterDocument & {
  sections: readonly { layers: readonly L[] }[];
};

export function getParameterAnimation<A extends AnimationDocument<LayerDocument>>(
  animation: A,
  selection: Readonly<ParameterSelection> | null | undefined,
): A {
  if (!animation.parameters?.length) {
    return animation;
  }
  const values = getParameterValues(animation, selection);
  return {
    ...animation,
    sections: animation.sections.map((section) => ({
      ...section,
      layers: section.layers.map((layer) => ({
        ...layer,
        params: getReferencedParams(layer.params, values),
      })),
    })),
  };
}

const MAX_OPTION_COLORS = 4;

function isPaletteColorHidden(key: string, colorCount: unknown): boolean {
  const index = /^color(\d+)$/.exec(key)?.[1];
  return typeof colorCount === "number" && index !== undefined && Number(index) > colorCount;
}

export function getOptionColors({ values }: ParameterOption): string[] {
  const colors = Object.entries(values).flatMap(([key, value]) =>
    colorSchema.safeParse(value).success && !isPaletteColorHidden(key, values["colorCount"])
      ? [String(value).toLowerCase()]
      : [],
  );
  return [...new Set(colors)].slice(0, MAX_OPTION_COLORS);
}
