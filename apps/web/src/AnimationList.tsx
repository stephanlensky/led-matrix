import { type StoredAnimation, getEffect } from "@led-matrix/core";
import { PlayIcon } from "lucide-react";
import { ListEmpty, ListRow } from "./ListRow.tsx";

type AnimationListProps = {
  animations: readonly StoredAnimation[];
  activeId: string | null | undefined;
  onPlay: (id: string) => void;
};

function getCountLabel(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

function getModeLabel({ mode }: StoredAnimation): string {
  if (mode.type === "duration") {
    return `${mode.ms / 1000}s`;
  }
  return "beats" in mode ? getCountLabel(mode.beats, "beat") : getCountLabel(mode.frames, "frame");
}

function getEffectsLabel({ layers }: StoredAnimation): string {
  return layers.map((layer) => getEffect(layer.effect)?.name ?? layer.effect).join(" + ");
}

export function AnimationList({ animations, activeId, onPlay }: AnimationListProps) {
  if (animations.length === 0) {
    return <ListEmpty>No animations</ListEmpty>;
  }
  return (
    <ul>
      {animations.map((animation) => (
        <li key={animation.id}>
          <ListRow
            isActive={animation.id === activeId}
            icon={<PlayIcon />}
            title={animation.name}
            subtitle={getEffectsLabel(animation)}
            detail={getModeLabel(animation)}
            onClick={() => onPlay(animation.id)}
          />
        </li>
      ))}
    </ul>
  );
}
