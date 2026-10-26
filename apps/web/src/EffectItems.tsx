import { type Effect, effects } from "@led-matrix/core";
import { BlendIcon, BrushIcon, GridIcon } from "lucide-react";
import type { ReactNode } from "react";
import { SelectGroup, SelectItem, SelectLabel, SelectSeparator } from "@/components/ui/select";

export const effectKindIcons: Readonly<Record<Effect["kind"], ReactNode>> = {
  pixel: <GridIcon />,
  canvas: <BrushIcon />,
  filter: <BlendIcon />,
};

const sourceEffects = effects.filter((effect) => effect.kind !== "filter");

const filterEffects = effects.filter((effect) => effect.kind === "filter");

export function EffectSelectItems() {
  return (
    <>
      <SelectGroup>
        <SelectLabel>Sources</SelectLabel>
        {sourceEffects.map((effect) => (
          <SelectItem key={effect.id} value={effect.id}>
            {effect.name}
          </SelectItem>
        ))}
      </SelectGroup>
      <SelectSeparator />
      <SelectGroup>
        <SelectLabel>Filters</SelectLabel>
        {filterEffects.map((effect) => (
          <SelectItem key={effect.id} value={effect.id}>
            {effect.name}
          </SelectItem>
        ))}
      </SelectGroup>
    </>
  );
}
