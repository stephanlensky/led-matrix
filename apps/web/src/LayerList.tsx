import { type Layer, getEffect } from "@led-matrix/core";
import { ArrowDownIcon, ArrowUpIcon, Trash2Icon } from "lucide-react";
import { effectKindIcons } from "./EffectItems.tsx";
import { TruncatedText } from "./TruncatedText.tsx";
import { Button } from "@led-matrix/ui/components/button";
import { cn } from "@led-matrix/ui/lib/utils";

type LayerListProps = {
  layers: readonly Layer[];
  selectedIndex: number;
  invalidIndexes: ReadonlySet<number>;
  onSelect: (index: number) => void;
  onMove: (index: number, offset: number) => void;
  onRemove: (index: number) => void;
};

export function LayerList({
  layers,
  selectedIndex,
  invalidIndexes,
  onSelect,
  onMove,
  onRemove,
}: LayerListProps) {
  const rows = layers.map((layer, index) => ({ layer, index })).toReversed();
  return (
    <ul className="flex flex-col overflow-hidden rounded-lg border">
      {rows.map(({ layer, index }) => {
        const effect = getEffect(layer.effect);
        const isSelected = index === selectedIndex;
        return (
          <li
            key={index}
            className={cn(
              "group/layer flex items-center gap-1 border-l-2 border-transparent pr-1 hover:bg-muted/60",
              isSelected && "border-foreground bg-muted hover:bg-muted",
            )}
          >
            <button
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(index)}
              className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-2.5 text-left text-xs outline-none"
            >
              <span
                className={cn(
                  "text-muted-foreground [&_svg]:size-3.5",
                  isSelected && "text-foreground",
                )}
              >
                {effect && effectKindIcons[effect.kind]}
              </span>
              <TruncatedText className={cn(invalidIndexes.has(index) && "text-destructive")}>
                {effect?.name ?? layer.effect}
              </TruncatedText>
              {layers.length > 1 && (layer.blend !== "normal" || layer.opacity < 1) && (
                <span className="ml-auto font-mono text-muted-foreground tabular-nums">
                  {layer.blend !== "normal" && layer.blend}{" "}
                  {layer.opacity < 1 && `${Math.round(layer.opacity * 100)}%`}
                </span>
              )}
            </button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Move layer up"
              disabled={index === layers.length - 1}
              onClick={() => onMove(index, 1)}
            >
              <ArrowUpIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Move layer down"
              disabled={index === 0}
              onClick={() => onMove(index, -1)}
            >
              <ArrowDownIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Remove layer"
              disabled={layers.length === 1}
              onClick={() => onRemove(index)}
            >
              <Trash2Icon />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
