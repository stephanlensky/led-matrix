import type { Effect } from "@led-matrix/core";
import { effectKindIcons } from "./EffectItems.tsx";
import { ListEmpty, ListRow } from "./ListRow.tsx";

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
            icon={effectKindIcons[effect.kind]}
            title={effect.name}
            subtitle={Object.keys(effect.params.shape).join(", ") || "No parameters"}
            detail={effect.kind}
          />
        </li>
      ))}
    </ul>
  );
}
