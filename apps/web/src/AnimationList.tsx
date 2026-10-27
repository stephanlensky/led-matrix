import { type StoredAnimation, getEffect } from "@led-matrix/core";
import { MoveRightIcon, PlayIcon, RepeatIcon } from "lucide-react";
import { ListEmpty, ListRow } from "./ListRow.tsx";
import { getLengthLabel, getSectionName } from "./sectionLabels.ts";
import { TruncatedText } from "./TruncatedText.tsx";
import { cn } from "@led-matrix/ui/lib/utils";

type AnimationListProps = {
  animations: readonly StoredAnimation[];
  activeId: string | null | undefined;
  activeSection: number | undefined;
  onPlay: (id: string) => void;
  onSelectSection: (index: number) => void;
};

function getDetailLabel({ sections }: StoredAnimation): string {
  const [first] = sections;
  return sections.length === 1 && first
    ? getLengthLabel(first.mode)
    : `${sections.length} sections`;
}

function getEffectsLabel({ sections }: StoredAnimation): string {
  const names = sections.flatMap(({ layers }) =>
    layers.map((layer) => getEffect(layer.effect)?.name ?? layer.effect),
  );
  return [...new Set(names)].join(" + ");
}

type SectionListProps = {
  animation: StoredAnimation;
  isExpanded: boolean;
  activeSection: number | undefined;
  onSelect: (index: number) => void;
};

function SectionList({ animation, isExpanded, activeSection, onSelect }: SectionListProps) {
  return (
    <div
      inert={!isExpanded}
      className={cn(
        "grid transition-[grid-template-rows] duration-200 ease-out",
        isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
      )}
    >
      <ol className="overflow-hidden bg-muted/40">
        {animation.sections.map((section, index) => {
          const isActive = index === activeSection;
          const ModeIcon = section.mode.type === "loop" ? RepeatIcon : MoveRightIcon;
          return (
            <li key={index}>
              <button
                type="button"
                aria-pressed={isActive}
                onClick={() => onSelect(index)}
                className={cn(
                  "flex w-full items-center gap-2 border-l-2 border-foreground py-1.5 pr-3 pl-9 text-left text-xs text-muted-foreground outline-none hover:bg-muted focus-visible:bg-muted",
                  isActive && "text-foreground",
                )}
              >
                <ModeIcon className="size-3 shrink-0" />
                <TruncatedText className="flex-1">{getSectionName(section, index)}</TruncatedText>
                <span className="font-mono tabular-nums">{getLengthLabel(section.mode)}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function AnimationList({
  animations,
  activeId,
  activeSection,
  onPlay,
  onSelectSection,
}: AnimationListProps) {
  if (animations.length === 0) {
    return <ListEmpty>No animations</ListEmpty>;
  }
  return (
    <ul>
      {animations.map((animation) => {
        const isActive = animation.id === activeId;
        return (
          <li key={animation.id}>
            <ListRow
              isActive={isActive}
              icon={<PlayIcon />}
              title={animation.name}
              subtitle={getEffectsLabel(animation)}
              detail={getDetailLabel(animation)}
              onClick={() => onPlay(animation.id)}
            />
            {animation.sections.length > 1 && (
              <SectionList
                animation={animation}
                isExpanded={isActive}
                activeSection={isActive ? activeSection : undefined}
                onSelect={onSelectSection}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
