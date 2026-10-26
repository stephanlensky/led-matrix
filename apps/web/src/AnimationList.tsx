import type { StoredAnimation } from "@led-matrix/core";
import { PlayIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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

export function AnimationList({ animations, activeId, onPlay }: AnimationListProps) {
  return (
    <ul className="flex flex-col gap-1">
      {animations.map((animation) => {
        const isActive = animation.id === activeId;
        return (
          <li key={animation.id}>
            <Button
              variant={isActive ? "secondary" : "ghost"}
              className="w-full justify-between"
              aria-pressed={isActive}
              onClick={() => onPlay(animation.id)}
            >
              <span className="flex items-center gap-2">
                <PlayIcon className={isActive ? "text-primary" : "text-muted-foreground"} />
                {animation.name}
              </span>
              <Badge variant="outline">{getModeLabel(animation)}</Badge>
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
