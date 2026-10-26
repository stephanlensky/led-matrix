import type { Effect } from "@led-matrix/core";
import type { ReactNode } from "react";
import { BlendIcon, BrushIcon, GridIcon } from "lucide-react";
import { ListEmpty, ListRow } from "./ListRow.tsx";

const kindIcons: Readonly<Record<Effect["kind"], ReactNode>> = {
  pixel: <GridIcon />,
  canvas: <BrushIcon />,
  filter: <BlendIcon />,
};

type EffectListProps = {
  effects: readonly Effect[];
};

export function EffectList({ effects }: EffectListProps) {
  if (effects.length === 0) {
    return <ListEmpty>No effects</ListEmpty>;
  }
  return (
    <ul>
      {effects.map((effect) => (
        <li key={effect.id}>
          <ListRow
            icon={kindIcons[effect.kind]}
            title={effect.name}
            subtitle={Object.keys(effect.params.shape).join(", ") || "No parameters"}
            detail={effect.kind}
          />
        </li>
      ))}
    </ul>
  );
}
