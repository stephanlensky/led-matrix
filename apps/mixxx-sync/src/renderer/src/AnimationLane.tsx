import { type Parameter, type Renderer, type StoredAnimation, createFrame } from "@led-matrix/core";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@led-matrix/ui/components/context-menu";
import { Filmstrip } from "@led-matrix/ui/components/filmstrip";
import { getSectionName } from "@led-matrix/ui/lib/section-labels";
import { ChevronLeftIcon, ChevronRightIcon, RepeatIcon } from "lucide-react";
import {
  type DragEvent,
  type MouseEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type AnimationBlock,
  type CueKeys,
  type LiveBlock,
  getAnimationLane,
  getBlockPosition,
  getCueKeys,
  getDropEnd,
  getLiveBlock,
  getLoopCount,
  getNaturalBeats,
  isSameRender,
} from "../../shared/animation-lane.ts";
import { type Beats, getBeat, getBpm, getPosition } from "../../shared/beats.ts";
import {
  type BeatRange,
  type LaneScale,
  type Snap,
  getClampedBeat,
  getEndRange,
  getGapRange,
  getCueLength,
  getGroupCopySnap,
  getGroupMoveRange,
  getMoveSnap,
  getSnap,
  getSnapTargets,
  getStartRange,
  getTrackRange,
  getTrimStartRange,
} from "../../shared/lane-edit.ts";
import type { MixxxCue } from "../../shared/library.ts";
import type { CueStatus } from "../../shared/api.ts";
import { type Cue, type MappingFile, getExplicitCues } from "../../shared/mapping.ts";
import {
  type AnimationCue,
  addCue,
  clearCueEnd,
  moveCues,
  pasteCues,
  replaceCue,
  resizeCue,
  setCueLoops,
  setCuesParam,
  setCueTrim,
  trimCueStart,
} from "../../shared/mapping-edits.ts";
import { type TrackRange, getFraction } from "../../shared/track-scale.ts";
import {
  type CueCopy,
  dropCueCopy,
  getLaneTarget,
  getLaneProps,
  setCopyDrop,
  setCueCopy,
  useCueCopy,
} from "./cue-copy.ts";
import { getCueDrag, getCurrentCueDrag, hasCueDrag } from "./cue-drag.ts";
import type { MappingEditor } from "./useMapping.ts";

const blankFrame = createFrame();

export type AnimationSource = {
  animationsById: ReadonlyMap<string, StoredAnimation> | undefined;
  renderer: Renderer;
  fps: number;
};

type Scale = { beats: Beats; duration: number };

export type CueSelection = {
  location: string;
  indices: readonly number[];
  trackRange: BeatRange;
};

export type LaneEditor = {
  update: MappingEditor["update"];
  selection: CueSelection | undefined;
  onSelect: (selection: CueSelection | undefined) => void;
};

type DragKind = "move" | "start" | "end";

type Drag = {
  kind: DragKind;
  isTrimmed: boolean;
  isCopy: boolean;
  group: readonly number[];
  copies: AnimationCue[];
  anchor: AnimationCue;
  clickSelection: readonly number[] | undefined;
  target: string | undefined;
  index: number;
  pointerId: number;
  startX: number;
  startBeat: number;
  value: number;
  length: number | undefined;
  range: BeatRange;
  track: BeatRange;
  targets: number[];
  laneScale: LaneScale;
  left: number;
  current: number;
  isValid: boolean;
  isMoved: boolean;
};

type Draft = {
  cues: readonly Cue[];
  snap: number | undefined;
  blocked: BeatRange | undefined;
};

type CopyPlacement = {
  delta: number;
  target: number | undefined;
  isValid: boolean;
};

type Ghost = {
  beat: number;
  stop: number;
  end: number | undefined;
  name: string;
  snap: number | undefined;
  replace: number | undefined;
};

const DRAG_DISTANCE = 3;
const NO_CUES: readonly Cue[] = [];

function getEditedCues(
  location: string,
  cues: readonly Cue[],
  edit: (file: MappingFile) => MappingFile,
): readonly Cue[] | undefined {
  try {
    return edit({ tracks: { [location]: [...cues] } }).tracks[location] ?? NO_CUES;
  } catch {
    return undefined;
  }
}

function getPointerBeat(laneScale: LaneScale, left: number, clientX: number): number {
  const { beats, duration, width } = laneScale;
  return getBeat(beats, width > 0 ? ((clientX - left) / width) * duration : 0);
}

function getRange(
  kind: DragKind,
  cues: readonly Cue[],
  index: number,
  group: readonly number[],
  track: BeatRange,
  isTrimmed: boolean,
) {
  if (kind === "move") {
    const beat = cues[index]?.beat ?? 0;
    const { min, max } = getGroupMoveRange(cues, group, track);
    return { min: beat + min, max: beat + max };
  }
  if (kind === "end") {
    return getEndRange(cues, index, track);
  }
  return isTrimmed ? getTrimStartRange(cues, index, track) : getStartRange(cues, index, track);
}

function getDragSnap(drag: Drag, beat: number, isFree: boolean): Snap {
  if (isFree) {
    return { beat, target: undefined, distance: 0 };
  }
  return drag.kind === "move"
    ? getMoveSnap(beat, drag.length, drag.targets, drag.laneScale)
    : getSnap(beat, drag.targets, drag.laneScale);
}

function getCueStop(cues: readonly Cue[], beat: number, track: BeatRange): number {
  return cues.find((cue) => cue.beat > beat)?.beat ?? track.max;
}

function getCopyGhosts(
  cues: readonly Cue[],
  copies: readonly AnimationCue[],
  delta: number,
  track: BeatRange,
  animationsById: ReadonlyMap<string, StoredAnimation> | undefined,
): Ghost[] {
  return copies.map((copy) => {
    const beat = copy.beat + delta;
    const stop = getCueStop(cues, beat, track);
    const length = getCueLength(copy);
    const end = length === undefined ? stop : Math.min(beat + length, stop);
    const name = animationsById?.get(copy.animation)?.name ?? "";
    return { beat, stop: end, end, name, snap: undefined, replace: undefined };
  });
}

function getCopySpan(
  cues: readonly Cue[],
  copies: readonly AnimationCue[],
  delta: number,
  track: BeatRange,
): BeatRange | undefined {
  const first = copies[0];
  const last = copies.at(-1);
  if (!first || !last) {
    return undefined;
  }
  const beat = last.beat + delta;
  const length = getCueLength(last);
  return {
    min: first.beat + delta,
    max: length === undefined ? getCueStop(cues, beat, track) : beat + length,
  };
}

function getBeatIndices(cues: readonly Cue[] | undefined, beats: readonly number[]): number[] {
  return cues
    ? beats.map((beat) => cues.findIndex((cue) => cue.beat === beat)).filter((index) => index >= 0)
    : [];
}

function getCommonParams(blocks: readonly AnimationBlock[]): Partial<Record<string, string>> {
  const [first, ...rest] = blocks;
  if (!first) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(first.params).filter(([name, option]) =>
      rest.every((block) => block.params[name] === option),
    ),
  );
}

function getBeatFraction({ beats, duration }: Scale, beat: number): number {
  return getFraction(getPosition(beats, beat), duration);
}

function getSpanStyle(left: number, right: number) {
  return { left: `${left * 100}%`, width: `${Math.max(right - left, 0) * 100}%` };
}

function useCueKeys(cues: readonly Cue[]): number[] {
  const [current, setCurrent] = useState<CueKeys>(() => getCueKeys(undefined, cues));
  const next = getCueKeys(current, cues);
  if (next !== current) {
    setCurrent(next);
  }
  return next.keys;
}

function useRenderBlock(block: AnimationBlock): AnimationBlock {
  const [current, setCurrent] = useState(block);
  const isSame = isSameRender(current, block);
  if (!isSame) {
    setCurrent(block);
  }
  return isSame ? current : block;
}

function BlockFilmstrip({
  block,
  scale,
  start,
  end,
  source,
}: {
  block: AnimationBlock;
  scale: Scale;
  start: number;
  end: number;
  source: AnimationSource;
}) {
  const renderBlock = useRenderBlock(block);
  const { renderer, fps } = source;
  const getFrame = useCallback(
    (progress: number) => {
      const seconds = (start + progress * (end - start)) * scale.duration;
      const position = getBlockPosition(renderBlock, getBeat(scale.beats, seconds), fps);
      return position
        ? renderer.render(
            renderBlock.animation,
            position.time,
            renderBlock.bpm,
            position.index,
            position.cycle,
          )
        : blankFrame;
    },
    [renderBlock, scale, start, end, renderer, fps],
  );
  return <Filmstrip getFrame={getFrame} />;
}

function SectionLabel({ block, section }: { block: AnimationBlock; section: number }) {
  const current = block.animation.sections[section];
  if (!current) {
    return null;
  }
  return (
    <span className="flex min-w-0 items-center gap-1 truncate rounded-sm bg-black/70 px-1 text-[10px] leading-3.5 text-white">
      {current.mode.type === "loop" && <RepeatIcon className="size-2.5 shrink-0" />}
      <span className="truncate">{getSectionName(current, section)}</span>
    </span>
  );
}

type BlockHandlers = {
  onPointerDown: (event: PointerEvent<HTMLElement>, kind: DragKind, block: AnimationBlock) => void;
  onClick: (event: MouseEvent<HTMLElement>, block: AnimationBlock) => void;
  onClearEnd: (block: AnimationBlock) => void;
  onContextMenu: (block: AnimationBlock) => void;
  onSetStretch: (block: AnimationBlock, isStretched: boolean) => void;
  onSetTrim: (block: AnimationBlock, isTrimmed: boolean) => void;
  onSetParam: (block: AnimationBlock, name: string, option: string) => void;
  getParams: (block: AnimationBlock) => Partial<Record<string, string>>;
};

function getHandleTitle(side: "start" | "end", isTrimmed: boolean): string {
  if (side === "start") {
    return isTrimmed ? "Trim the start" : "Move the start";
  }
  return isTrimmed ? "Trim the end (double-click to clear)" : "Set the end (double-click to clear)";
}

function Handle({
  side,
  block,
  isSelected,
  handlers,
}: {
  side: "start" | "end";
  block: AnimationBlock;
  isSelected: boolean;
  handlers: BlockHandlers;
}) {
  const Icon = side === "start" ? ChevronLeftIcon : ChevronRightIcon;
  return (
    <div
      className={`group/handle absolute inset-y-0 z-10 flex w-2 cursor-ew-resize items-center justify-center hover:bg-white/40 ${side === "start" ? "left-0" : "right-0"} ${isSelected ? "bg-white/25" : ""}`}
      title={getHandleTitle(side, block.isTrimmed)}
      onPointerDown={(event) => handlers.onPointerDown(event, side, block)}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={side === "end" ? () => handlers.onClearEnd(block) : undefined}
    >
      <Icon
        className={`size-3 shrink-0 text-white drop-shadow-[0_0_2px_black] ${isSelected ? "" : "hidden group-hover/handle:block"}`}
      />
    </div>
  );
}

function VisibleFilmstrip({
  block,
  scale,
  range,
  start,
  end,
  source,
}: {
  block: AnimationBlock;
  scale: Scale;
  range: TrackRange;
  start: number;
  end: number;
  source: AnimationSource;
}) {
  const visibleStart = Math.max(start, range.start);
  const visibleEnd = Math.min(end, range.end);
  if (visibleEnd <= visibleStart) {
    return null;
  }
  return (
    <div
      className="absolute inset-y-0"
      style={getSpanStyle(
        (visibleStart - start) / (end - start),
        (visibleEnd - start) / (end - start),
      )}
    >
      <BlockFilmstrip
        block={block}
        scale={scale}
        start={visibleStart}
        end={visibleEnd}
        source={source}
      />
    </div>
  );
}

function Block({
  block,
  scale,
  range,
  source,
  isSelected,
  live,
  handlers,
}: {
  block: AnimationBlock;
  scale: Scale;
  range: TrackRange;
  source: AnimationSource;
  isSelected: boolean;
  live: LiveBlock | undefined;
  handlers: BlockHandlers | undefined;
}) {
  const start = getBeatFraction(scale, block.beat);
  const end = getBeatFraction(scale, block.end);
  const stop = getBeatFraction(scale, block.stop);
  const hasSections = block.animation.sections.length > 1;
  const parameters = getMenuParameters(block);
  const optionLabel = parameters.map(({ name }) => block.params[name]).join(" · ");
  const hasMenu = handlers !== undefined;

  return (
    <>
      <ContextMenu disabled={!hasMenu}>
        <ContextMenuTrigger
          className={`group absolute inset-y-0 overflow-hidden border-l-2 border-white/80 bg-neutral-900 ${handlers ? "cursor-grab active:cursor-grabbing" : ""} ${isSelected ? "z-[5] outline-2 -outline-offset-2 outline-sky-400" : ""}`}
          style={getSpanStyle(start, end)}
          title={block.animation.name}
          onPointerDown={handlers && ((event) => handlers.onPointerDown(event, "move", block))}
          onClick={handlers && ((event) => handlers.onClick(event, block))}
          onContextMenu={handlers && (() => handlers.onContextMenu(block))}
        >
          {end > start && (
            <VisibleFilmstrip
              block={block}
              scale={scale}
              range={range}
              start={start}
              end={end}
              source={source}
            />
          )}
          {block.boundaries.map((boundary) => (
            <div
              key={boundary.beat}
              className="absolute inset-y-0 flex border-l border-white/60"
              style={{
                left: `${((getBeatFraction(scale, boundary.beat) - start) / (end - start)) * 100}%`,
              }}
            >
              <div className="mt-auto pb-0.5 pl-0.5">
                <SectionLabel block={block} section={boundary.section} />
              </div>
            </div>
          ))}
          <div className="pointer-events-none absolute top-0.5 left-0.5 flex max-w-[calc(100%-0.25rem)] gap-1">
            <span className="truncate rounded-sm bg-black/70 px-1 text-[10px] leading-3.5 font-medium text-white">
              {block.animation.name}
            </span>
            {hasSections && <SectionLabel block={block} section={block.startSection} />}
            {optionLabel && (
              <span className="truncate rounded-sm bg-black/70 px-1 text-[10px] leading-3.5 text-white/80">
                {optionLabel}
              </span>
            )}
          </div>
          {block.hasEnd && <div className="absolute inset-y-0 right-0 w-0.5 bg-white/80" />}
          {live && !live.isBlank && <LiveOutline />}
          {handlers && (
            <>
              <Handle side="start" block={block} isSelected={isSelected} handlers={handlers} />
              <Handle side="end" block={block} isSelected={isSelected} handlers={handlers} />
            </>
          )}
        </ContextMenuTrigger>
        {hasMenu && <BlockMenu block={block} handlers={handlers} />}
      </ContextMenu>
      {stop > end && (
        <div
          className="absolute inset-y-0 border-y border-dashed border-white/15 bg-black/40"
          style={getSpanStyle(end, stop)}
        >
          {live?.isBlank && <LiveOutline />}
        </div>
      )}
    </>
  );
}

function getMenuParameters({ source }: AnimationBlock): Parameter[] {
  return source.parameters?.filter(({ options }) => options.length > 1) ?? [];
}

function BlockMenu({ block, handlers }: { block: AnimationBlock; handlers: BlockHandlers }) {
  const parameters = getMenuParameters(block);
  const params = handlers.getParams(block);
  return (
    <ContextMenuContent>
      {block.isLoop ? (
        <ContextMenuCheckboxItem
          checked={block.loops !== undefined}
          onCheckedChange={(checked) => handlers.onSetStretch(block, checked)}
        >
          Stretch loop to fit
        </ContextMenuCheckboxItem>
      ) : (
        <ContextMenuCheckboxItem
          checked={block.isTrimmed}
          onCheckedChange={(checked) => handlers.onSetTrim(block, checked)}
        >
          Trim instead of stretch
        </ContextMenuCheckboxItem>
      )}
      {parameters.length > 0 && <ContextMenuSeparator />}
      {parameters.map((parameter) => (
        <ContextMenuSub key={parameter.name}>
          <ContextMenuSubTrigger>
            {parameter.name}
            <span className="ml-auto pl-4 text-xs text-muted-foreground">
              {params[parameter.name] ?? "Mixed"}
            </span>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuRadioGroup
              value={params[parameter.name] ?? ""}
              onValueChange={(option: string) => handlers.onSetParam(block, parameter.name, option)}
            >
              {parameter.options.map(({ name }) => (
                <ContextMenuRadioItem key={name} value={name}>
                  {name}
                </ContextMenuRadioItem>
              ))}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>
      ))}
    </ContextMenuContent>
  );
}

function LiveOutline() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[6] ring-2 ring-emerald-400 ring-inset"
      title="Live in Mixxx"
    />
  );
}

function LaneMessage({ children, title }: { children: string; title?: string }) {
  return (
    <div
      className="flex h-8 items-center justify-center truncate rounded-sm bg-muted/40 px-2 text-xs text-muted-foreground"
      title={title}
    >
      {children}
    </div>
  );
}

export function AnimationLane({
  range,
  duration,
  beats,
  cues,
  mixxxCues,
  location,
  source,
  editor,
  liveCue,
}: {
  range: TrackRange;
  duration: number;
  beats: Beats | undefined;
  cues: readonly Cue[] | undefined;
  mixxxCues: readonly MixxxCue[];
  location: string;
  source: AnimationSource;
  editor: LaneEditor | undefined;
  liveCue: CueStatus | undefined;
}) {
  const { animationsById, fps } = source;
  const laneRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag>(undefined);
  const isClickSuppressedRef = useRef(false);
  const [draft, setDraft] = useState<Draft>();
  const [ghost, setGhost] = useState<Ghost>();
  const savedCues = cues ?? NO_CUES;
  const displayCues = draft?.cues ?? savedCues;
  const cueKeys = useCueKeys(displayCues);
  const scale = useMemo(() => beats && { beats, duration }, [beats, duration]);
  const track = useMemo(() => beats && getTrackRange(beats, duration), [beats, duration]);
  const lane = useMemo(
    () =>
      animationsById
        ? getAnimationLane(displayCues, animationsById, beats, duration, fps)
        : undefined,
    [displayCues, beats, animationsById, duration, fps],
  );
  const live = lane && getLiveBlock(lane.blocks, liveCue);
  const isEditable = editor !== undefined && lane !== undefined && lane.errors.length === 0;
  const copy = useCueCopy(location);

  function getLaneScale(): { laneScale: LaneScale; left: number } | undefined {
    const rect = laneRef.current?.getBoundingClientRect();
    return beats && rect
      ? { laneScale: { beats, duration, width: rect.width }, left: rect.left }
      : undefined;
  }

  const selected = editor?.selection?.location === location ? editor.selection.indices : [];

  function setSelection(indices: readonly number[]) {
    if (editor && track) {
      editor.onSelect(indices.length === 0 ? undefined : { location, indices, trackRange: track });
    }
  }

  function getEdit(drag: Drag, value: number) {
    const cue = savedCues[drag.index];
    return (file: MappingFile) => {
      if (drag.isCopy) {
        return pasteCues(file, location, drag.copies, value - drag.value);
      }
      if (drag.kind === "move") {
        return moveCues(file, location, drag.group, value - drag.value);
      }
      if (drag.kind === "end") {
        return resizeCue(file, location, drag.index, { beat: cue?.beat ?? value, end: value });
      }
      return drag.isTrimmed
        ? trimCueStart(file, location, drag.index, value)
        : resizeCue(file, location, drag.index, { beat: value, end: cue?.end });
    };
  }

  function getParamGroup(block: AnimationBlock): AnimationBlock[] {
    const blocks = selected.flatMap(
      (index) => lane?.blocks.find((other) => other.index === index) ?? [],
    );
    const isGroup =
      selected.includes(block.index) &&
      blocks.every((other) => other.source.id === block.source.id);
    return isGroup ? blocks : [block];
  }

  function getDragGroup(kind: DragKind, index: number, isShift: boolean) {
    const isSelected = selected.includes(index);
    if (kind !== "move") {
      return { group: [index], clickSelection: undefined };
    }
    if (isShift) {
      return isSelected
        ? { group: selected, clickSelection: selected.filter((other) => other !== index) }
        : { group: [...selected, index].toSorted((a, b) => a - b), clickSelection: undefined };
    }
    return isSelected
      ? { group: selected, clickSelection: selected.length > 1 ? [index] : undefined }
      : { group: [index], clickSelection: undefined };
  }

  const handlers: BlockHandlers = {
    onPointerDown(event, kind, block) {
      const cue = savedCues[block.index];
      const explicitCues = getExplicitCues(savedCues);
      const anchor = explicitCues[block.index];
      const measured = getLaneScale();
      if (event.button !== 0 || !editor || !track || !beats || !cue || !anchor || !measured) {
        return;
      }
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      isClickSuppressedRef.current = false;
      const value = kind === "end" ? (cue.end ?? block.stop) : cue.beat;
      const isCopy = kind === "move" && event.shiftKey;
      const { group, clickSelection } = getDragGroup(kind, block.index, event.shiftKey);
      dragRef.current = {
        kind,
        isTrimmed: block.isTrimmed,
        isCopy,
        group,
        copies: isCopy ? group.flatMap((index) => explicitCues[index] ?? []) : [],
        anchor,
        clickSelection,
        target: undefined,
        index: block.index,
        pointerId: event.pointerId,
        startX: event.clientX,
        startBeat: getPointerBeat(measured.laneScale, measured.left, event.clientX),
        value,
        length: kind === "move" ? getCueLength(cue) : undefined,
        range: getRange(kind, savedCues, block.index, group, track, block.isTrimmed),
        track,
        targets: getSnapTargets(savedCues, isCopy ? [] : group, mixxxCues, beats),
        ...measured,
        current: value,
        isValid: true,
        isMoved: false,
      };
      setSelection(group);
    },
    onClick(event) {
      if (isClickSuppressedRef.current) {
        isClickSuppressedRef.current = false;
        event.stopPropagation();
      }
    },
    onClearEnd(block) {
      if (savedCues[block.index]?.end !== undefined) {
        editor?.update((file) => clearCueEnd(file, location, block.index));
      }
    },
    onContextMenu(block) {
      if (!selected.includes(block.index)) {
        setSelection([block.index]);
      }
    },
    onSetStretch(block, isStretched) {
      const loops = isStretched ? { end: block.end, count: getLoopCount(block, fps) } : undefined;
      editor?.update((file) => setCueLoops(file, location, block.index, loops));
    },
    onSetTrim(block, isTrimmed) {
      editor?.update((file) => setCueTrim(file, location, block.index, isTrimmed));
    },
    onSetParam(block, name, option) {
      const indices = getParamGroup(block).map(({ index }) => index);
      editor?.update((file) => setCuesParam(file, location, indices, name, option));
    },
    getParams(block) {
      return getCommonParams(getParamGroup(block));
    },
  };

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    if (!drag.isMoved && Math.abs(event.clientX - drag.startX) < DRAG_DISTANCE) {
      return;
    }
    drag.isMoved = true;
    const pointerBeat = getPointerBeat(drag.laneScale, drag.left, event.clientX);
    const beat = drag.value + pointerBeat - drag.startBeat;
    if (drag.isCopy) {
      const target = getLaneTarget(event.clientX, event.clientY);
      drag.target = target?.location !== location ? target?.location : undefined;
      if (target && drag.target) {
        setDraft(undefined);
        setCueCopy({
          ...target,
          cues: drag.copies,
          anchor: drag.anchor,
          clientX: event.clientX,
          offset: drag.startBeat - drag.value,
          isFree: event.altKey,
        });
        return;
      }
      setCueCopy(undefined);
      handleCopyMove(drag, beat, event.altKey);
      return;
    }
    const snap = getDragSnap(drag, beat, event.altKey);
    const value = getClampedBeat(snap.beat, drag.range);
    const next = getEditedCues(location, savedCues, getEdit(drag, value));
    if (next) {
      drag.current = value;
      setDraft({
        cues: next,
        snap: value === snap.beat ? snap.target : undefined,
        blocked: undefined,
      });
    }
  }

  function handleCopyMove(drag: Drag, beat: number, isFree: boolean) {
    const snap = getGroupCopySnap(
      beat,
      drag.anchor,
      drag.copies,
      savedCues,
      drag.targets,
      drag.track,
      drag.laneScale,
      isFree,
    );
    const next = snap.isValid
      ? getEditedCues(location, savedCues, getEdit(drag, snap.beat))
      : undefined;
    drag.isValid = next !== undefined;
    if (next) {
      drag.current = snap.beat;
      setDraft({ cues: next, snap: snap.target, blocked: undefined });
      return;
    }
    setDraft({
      cues: savedCues,
      snap: undefined,
      blocked: getCopySpan(savedCues, drag.copies, snap.beat - drag.value, drag.track),
    });
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    dragRef.current = undefined;
    setDraft(undefined);
    if (!drag.isMoved) {
      if (drag.clickSelection) {
        setSelection(drag.clickSelection);
      }
      return;
    }
    isClickSuppressedRef.current = true;
    if (drag.target) {
      dropCueCopy();
      return;
    }
    if (drag.isValid && drag.current !== drag.value) {
      const edit = getEdit(drag, drag.current);
      editor?.update(edit);
      if (drag.isCopy) {
        const delta = drag.current - drag.value;
        setSelection(
          getBeatIndices(
            getEditedCues(location, savedCues, edit),
            drag.copies.map((cue) => cue.beat + delta),
          ),
        );
      }
    }
  }

  function handlePointerCancel() {
    dragRef.current = undefined;
    setDraft(undefined);
    setCueCopy(undefined);
  }

  function getCopyPlacement(dropped: CueCopy): CopyPlacement | undefined {
    if (!isEditable || !track || !beats) {
      return undefined;
    }
    const { cues: copies, anchor, clientX, left, width, offset, isFree } = dropped;
    const laneScale = { beats, duration, width };
    const snap = getGroupCopySnap(
      getPointerBeat(laneScale, left, clientX) - offset,
      anchor,
      copies,
      savedCues,
      getSnapTargets(savedCues, [], mixxxCues, beats),
      track,
      laneScale,
      isFree,
    );
    return { delta: snap.beat - anchor.beat, target: snap.target, isValid: snap.isValid };
  }

  function handleCopyDrop(dropped: CueCopy) {
    const placement = getCopyPlacement(dropped);
    if (!editor || !placement?.isValid) {
      return;
    }
    const edit = (file: MappingFile) => pasteCues(file, location, dropped.cues, placement.delta);
    editor.update(edit);
    setSelection(
      getBeatIndices(
        getEditedCues(location, savedCues, edit),
        dropped.cues.map((cue) => cue.beat + placement.delta),
      ),
    );
  }

  useEffect(() => setCopyDrop(location, handleCopyDrop));

  function getGhost(event: DragEvent<HTMLDivElement>): Ghost | undefined {
    const measured = getLaneScale();
    if (!isEditable || !track || !beats || !measured || !hasCueDrag(event)) {
      return undefined;
    }
    const beat = getPointerBeat(measured.laneScale, measured.left, event.clientX);
    const drag = getCurrentCueDrag();
    const animation = drag && animationsById?.get(drag.animationId);
    const name = animation?.name ?? "";
    const replaced = lane?.blocks.find((block) => block.beat <= beat && beat < block.end);
    if (replaced) {
      const { beat: start, end } = replaced;
      return { beat: start, stop: end, end, name, snap: undefined, replace: replaced.index };
    }
    const snap = event.altKey
      ? { beat, target: undefined }
      : getSnap(beat, getSnapTargets(savedCues, [], mixxxCues, beats), measured.laneScale);
    const section = drag?.section ?? 0;
    const length = animation && getNaturalBeats(animation, section, getBpm(beats, beat), fps);
    const gap = getGapRange(savedCues, beat, length, track);
    if (!gap) {
      return undefined;
    }
    const ghostBeat = getClampedBeat(snap.beat, gap);
    const stop = savedCues.find((cue) => cue.beat > ghostBeat)?.beat ?? track.max;
    const end =
      animation && getDropEnd(animation, section, ghostBeat, stop, getBpm(beats, ghostBeat), fps);
    return {
      beat: ghostBeat,
      stop,
      end,
      name,
      snap: ghostBeat === snap.beat ? snap.target : ghostBeat === gap.min ? ghostBeat : end,
      replace: undefined,
    };
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    const next = getGhost(event);
    if (!next) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (
      ghost?.beat !== next.beat ||
      ghost.snap !== next.snap ||
      ghost.name !== next.name ||
      ghost.replace !== next.replace
    ) {
      setGhost(next);
    }
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (
      !(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))
    ) {
      setGhost(undefined);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    const drag = getCueDrag(event);
    const dropped = getGhost(event);
    setGhost(undefined);
    if (!editor || !dropped || !drag || !track) {
      return;
    }
    event.preventDefault();
    const animation = animationsById?.get(drag.animationId);
    const section =
      drag.section === undefined
        ? undefined
        : (animation?.sections[drag.section]?.name ?? drag.section);
    const { beat, end, replace } = dropped;
    if (replace !== undefined) {
      editor.update((file) =>
        replaceCue(file, location, replace, {
          animation: drag.animationId,
          ...(section === undefined ? {} : { section }),
          ...(drag.params === undefined ? {} : { params: drag.params }),
        }),
      );
      setSelection([replace]);
      return;
    }
    editor.update((file) =>
      addCue(file, location, {
        beat,
        animation: drag.animationId,
        ...(section === undefined ? {} : { section }),
        ...(drag.params === undefined ? {} : { params: drag.params }),
        ...(end === undefined ? {} : { end }),
      }),
    );
    setSelection([savedCues.filter((cue) => cue.beat < beat).length]);
  }

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      editor?.onSelect(undefined);
    }
  }

  if (lane && lane.errors.length > 0) {
    return (
      <div
        className="flex h-8 items-center truncate rounded-sm bg-destructive/10 px-2 text-xs text-destructive"
        title={lane.errors.join("\n")}
      >
        {lane.errors.length > 1
          ? `${lane.errors[0]} (+${lane.errors.length - 1} more)`
          : lane.errors[0]}
      </div>
    );
  }
  if (!scale) {
    return <LaneMessage>No beat grid</LaneMessage>;
  }
  if (!lane) {
    return (
      <LaneMessage>
        {savedCues.length === 0
          ? ""
          : `${savedCues.length} ${savedCues.length === 1 ? "cue" : "cues"}`}
      </LaneMessage>
    );
  }
  const placement = copy && getCopyPlacement(copy);
  const copyGhosts =
    copy && placement?.isValid && track
      ? getCopyGhosts(savedCues, copy.cues, placement.delta, track, animationsById)
      : [];
  const shownGhosts = ghost ? [ghost] : copyGhosts;
  const blocked =
    draft?.blocked ??
    (copy && placement && !placement.isValid && track
      ? getCopySpan(savedCues, copy.cues, placement.delta, track)
      : undefined);
  const snapBeat = draft?.snap ?? ghost?.snap ?? placement?.target;
  return (
    <div
      ref={laneRef}
      {...getLaneProps(location)}
      className="relative h-8 overflow-hidden rounded-sm bg-muted/40"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      {lane.blocks.length === 0 && shownGhosts.length === 0 && editor && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted-foreground/60">
          Drop an animation here
        </span>
      )}
      {lane.blocks.map((block) => (
        <Block
          key={cueKeys[block.index]}
          block={block}
          scale={scale}
          range={range}
          source={source}
          isSelected={selected.includes(block.index)}
          live={live?.index === block.index ? live : undefined}
          handlers={isEditable ? handlers : undefined}
        />
      ))}
      {shownGhosts.map((shownGhost) => (
        <div
          key={shownGhost.beat}
          className={`pointer-events-none absolute inset-y-0 z-20 border-2 border-dashed ${shownGhost.replace === undefined ? "border-sky-400 bg-sky-400/20" : "border-amber-400 bg-amber-400/30"}`}
          style={getSpanStyle(
            getBeatFraction(scale, shownGhost.beat),
            getBeatFraction(scale, shownGhost.end ?? shownGhost.stop),
          )}
        >
          <span className="absolute top-0.5 left-0.5 truncate rounded-sm bg-black/70 px-1 text-[10px] leading-3.5 font-medium text-white">
            {shownGhost.name}
          </span>
        </div>
      ))}
      {blocked && (
        <div
          className="pointer-events-none absolute inset-y-0 z-20 border-2 border-dashed border-red-500 bg-red-500/25"
          style={getSpanStyle(
            getBeatFraction(scale, blocked.min),
            getBeatFraction(scale, blocked.max),
          )}
        />
      )}
      {snapBeat !== undefined && (
        <div
          className="pointer-events-none absolute inset-y-0 z-20 w-px -translate-x-1/2 bg-amber-400"
          style={{ left: `${getBeatFraction(scale, snapBeat) * 100}%` }}
        />
      )}
    </div>
  );
}
