import {
  type AnimationFolder,
  type StoredAnimation,
  getAnimationCount,
  getEffect,
  getFolderAncestors,
  getFolderTree,
} from "@led-matrix/core";
import { ChevronRightIcon, FolderIcon, MoveRightIcon, PlayIcon, RepeatIcon } from "lucide-react";
import { type DragEvent, type ReactNode, useMemo, useState } from "react";
import { ListEmpty, ListRow, getIndent } from "./list-row.tsx";
import { getLengthLabel, getSectionName } from "../lib/section-labels.ts";
import { TruncatedText } from "./truncated-text.tsx";
import { cn } from "../lib/utils.ts";

type AnimationListProps = {
  animations: readonly StoredAnimation[];
  activeId: string | null | undefined;
  activeSection: number | undefined;
  onPlay: (id: string) => void;
  onSelectSection: (index: number) => void;
  onDragStart?: AnimationDragHandler;
  isExpanded?: boolean;
};

export type AnimationDragHandler = (
  event: DragEvent<HTMLElement>,
  animationId: string,
  section: number | undefined,
) => void;

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

function Collapse({ isExpanded, children }: { isExpanded: boolean; children: ReactNode }) {
  const [hasExpanded, setHasExpanded] = useState(isExpanded);
  if (isExpanded && !hasExpanded) {
    setHasExpanded(true);
  }
  if (!hasExpanded) {
    return null;
  }
  return (
    <div
      inert={!isExpanded}
      className={cn(
        "grid transition-[grid-template-rows] duration-200 ease-out starting:grid-rows-[0fr]",
        isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
      )}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

type SectionListProps = {
  animation: StoredAnimation;
  depth: number;
  isExpanded: boolean;
  activeSection: number | undefined;
  onSelect: (index: number) => void;
  onDragStart: AnimationDragHandler | undefined;
};

function SectionList({
  animation,
  depth,
  isExpanded,
  activeSection,
  onSelect,
  onDragStart,
}: SectionListProps) {
  return (
    <Collapse isExpanded={isExpanded}>
      <ol className="bg-muted/40">
        {animation.sections.map((section, index) => {
          const isActive = index === activeSection;
          const ModeIcon = section.mode.type === "loop" ? RepeatIcon : MoveRightIcon;
          return (
            <li key={index}>
              <button
                type="button"
                aria-pressed={isActive}
                onClick={() => onSelect(index)}
                draggable={onDragStart !== undefined}
                onDragStart={(event) => onDragStart?.(event, animation.id, index)}
                style={{ paddingLeft: getIndent(depth, 2.25) }}
                className={cn(
                  "flex w-full items-center gap-2 border-l-2 border-foreground py-1.5 pr-3 text-left text-xs text-muted-foreground outline-none hover:bg-muted focus-visible:bg-muted",
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
    </Collapse>
  );
}

type FolderContentsProps = Omit<AnimationListProps, "animations" | "isExpanded"> & {
  folder: AnimationFolder;
  depth: number;
  expandedFolders: ReadonlySet<string>;
  onToggleFolder: (path: string) => void;
};

function FolderContents(props: FolderContentsProps) {
  const {
    folder,
    depth,
    expandedFolders,
    onToggleFolder,
    activeId,
    activeSection,
    onPlay,
    onSelectSection,
    onDragStart,
  } = props;
  return (
    <ul>
      {folder.folders.map((child) => {
        const isExpanded = expandedFolders.has(child.path);
        return (
          <li key={child.path}>
            <button
              type="button"
              aria-expanded={isExpanded}
              onClick={() => onToggleFolder(child.path)}
              style={{ paddingLeft: getIndent(depth) }}
              className="flex w-full items-center gap-2 border-l-2 border-transparent py-1.5 pr-3 text-left text-sm outline-none hover:bg-muted/60 focus-visible:bg-muted"
            >
              <ChevronRightIcon
                className={cn(
                  "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
                  isExpanded && "rotate-90",
                )}
              />
              <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <TruncatedText className="flex-1">{child.name}</TruncatedText>
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {getAnimationCount(child)}
              </span>
            </button>
            <Collapse isExpanded={isExpanded}>
              <FolderContents {...props} folder={child} depth={depth + 1} />
            </Collapse>
          </li>
        );
      })}
      {folder.animations.map((animation) => {
        const isActive = animation.id === activeId;
        return (
          <li key={animation.id}>
            <ListRow
              isActive={isActive}
              depth={depth}
              icon={<PlayIcon />}
              title={animation.name}
              subtitle={getEffectsLabel(animation)}
              detail={getDetailLabel(animation)}
              onClick={() => onPlay(animation.id)}
              onDragStart={onDragStart && ((event) => onDragStart(event, animation.id, undefined))}
            />
            {animation.sections.length > 1 && (
              <SectionList
                animation={animation}
                depth={depth}
                isExpanded={isActive}
                activeSection={isActive ? activeSection : undefined}
                onSelect={onSelectSection}
                onDragStart={onDragStart}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function getActiveFolder(
  animations: readonly StoredAnimation[],
  activeId: string | null | undefined,
): string | undefined {
  return animations.find(({ id }) => id === activeId)?.folder;
}

function getAllFolders(folder: AnimationFolder): string[] {
  return folder.folders.flatMap((child) => [child.path, ...getAllFolders(child)]);
}

export function AnimationList({ animations, isExpanded = false, ...props }: AnimationListProps) {
  const activeFolder = getActiveFolder(animations, props.activeId);
  const [expandedFolders, setExpandedFolders] = useState(
    () => new Set(getFolderAncestors(activeFolder)),
  );
  const [revealedFolder, setRevealedFolder] = useState(activeFolder);
  if (activeFolder !== revealedFolder) {
    setRevealedFolder(activeFolder);
    setExpandedFolders(new Set([...expandedFolders, ...getFolderAncestors(activeFolder)]));
  }
  const tree = useMemo(() => getFolderTree(animations), [animations]);
  const allFolders = useMemo(() => new Set(getAllFolders(tree)), [tree]);
  if (animations.length === 0) {
    return <ListEmpty>No animations</ListEmpty>;
  }

  function toggleFolder(path: string) {
    const next = new Set(expandedFolders);
    if (!next.delete(path)) {
      next.add(path);
    }
    setExpandedFolders(next);
  }

  return (
    <FolderContents
      {...props}
      folder={tree}
      depth={0}
      expandedFolders={isExpanded ? allFolders : expandedFolders}
      onToggleFolder={toggleFolder}
    />
  );
}
