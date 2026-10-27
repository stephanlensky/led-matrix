import { type Renderer, type StoredAnimation, createFrame } from "@led-matrix/core";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
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
  getDropRange,
  getEndRange,
  getGap,
  getMoveRange,
  getMoveSnap,
  getSnap,
  getSnapTargets,
  getStartRange,
  getTrackRange,
} from "../../shared/lane-edit.ts";
import type { MixxxCue } from "../../shared/library.ts";
import type { CueStatus } from "../../shared/api.ts";
import type { Cue, MappingFile } from "../../shared/mapping.ts";
import {
  addCue,
  clearCueEnd,
  moveCue,
  resizeCue,
  setCueLoops,
  setCuePreset,
} from "../../shared/mapping-edits.ts";
import { type TrackRange, getFraction } from "../../shared/track-scale.ts";
import { getCueDrag, getCurrentCueDrag, hasCueDrag } from "./cue-drag.ts";
import type { MappingEditor } from "./useMapping.ts";

const blankFrame = createFrame();

export type AnimationSource = {
  animationsById: ReadonlyMap<string, StoredAnimation> | undefined;
  renderer: Renderer;
  fps: number;
};

type Scale = { beats: Beats; duration: number };

export type CueSelection = { location: string; index: number; trackRange: BeatRange };

export type LaneEditor = {
  update: MappingEditor["update"];
  selection: CueSelection | undefined;
  onSelect: (selection: CueSelection | undefined) => void;
};

type DragKind = "move" | "start" | "end";

type Drag = {
  kind: DragKind;
  index: number;
  pointerId: number;
  startX: number;
  startBeat: number;
  value: number;
  length: number | undefined;
  range: BeatRange;
  targets: number[];
  laneScale: LaneScale;
  left: number;
  current: number;
  isMoved: boolean;
};

type Draft = { cues: readonly Cue[]; snap: number | undefined };

type Ghost = {
  beat: number;
  stop: number;
  end: number | undefined;
  name: string;
  snap: number | undefined;
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

function getRange(kind: DragKind, cues: readonly Cue[], index: number, track: BeatRange) {
  if (kind === "move") {
    return getMoveRange(cues, index, track);
  }
  return kind === "start" ? getStartRange(cues, index, track) : getEndRange(cues, index, track);
}

function getDragSnap(drag: Drag, beat: number, isFree: boolean): Snap {
  if (isFree) {
    return { beat, target: undefined, distance: 0 };
  }
  return drag.kind === "move"
    ? getMoveSnap(beat, drag.length, drag.targets, drag.laneScale)
    : getSnap(beat, drag.targets, drag.laneScale);
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
        ? renderer.render(renderBlock.animation, position.time, renderBlock.bpm, position.index)
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
  onSetPreset: (block: AnimationBlock, preset: string) => void;
};

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
      title={side === "start" ? "Move the start" : "Set the end (double-click to clear)"}
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
  const hasMenu = handlers !== undefined && (block.isLoop || block.preset !== null);

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
            {hasSections && <SectionLabel block={block} section={block.section} />}
            {block.preset !== null && (
              <span className="truncate rounded-sm bg-black/70 px-1 text-[10px] leading-3.5 text-white/80">
                {block.preset}
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

function BlockMenu({ block, handlers }: { block: AnimationBlock; handlers: BlockHandlers }) {
  const presets = block.preset === null ? [] : (block.source.presets ?? []);
  return (
    <ContextMenuContent>
      {block.isLoop && (
        <ContextMenuCheckboxItem
          checked={block.loops !== undefined}
          onCheckedChange={(checked) => handlers.onSetStretch(block, checked)}
        >
          Stretch loop to fit
        </ContextMenuCheckboxItem>
      )}
      {block.isLoop && presets.length > 0 && <ContextMenuSeparator />}
      {presets.length > 0 && (
        <ContextMenuGroup>
          <ContextMenuLabel>Preset</ContextMenuLabel>
          <ContextMenuRadioGroup
            value={block.preset}
            onValueChange={(preset: string) => handlers.onSetPreset(block, preset)}
          >
            {presets.map(({ name }) => (
              <ContextMenuRadioItem key={name} value={name}>
                {name}
              </ContextMenuRadioItem>
            ))}
          </ContextMenuRadioGroup>
        </ContextMenuGroup>
      )}
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

  function getLaneScale(): { laneScale: LaneScale; left: number } | undefined {
    const rect = laneRef.current?.getBoundingClientRect();
    return beats && rect
      ? { laneScale: { beats, duration, width: rect.width }, left: rect.left }
      : undefined;
  }

  function getEdit(drag: Drag, value: number) {
    const cue = savedCues[drag.index];
    return (file: MappingFile) => {
      if (drag.kind === "move") {
        return moveCue(file, location, drag.index, value);
      }
      return drag.kind === "start"
        ? resizeCue(file, location, drag.index, { beat: value, end: cue?.end })
        : resizeCue(file, location, drag.index, { beat: cue?.beat ?? value, end: value });
    };
  }

  const handlers: BlockHandlers = {
    onPointerDown(event, kind, block) {
      const cue = savedCues[block.index];
      const measured = getLaneScale();
      if (event.button !== 0 || !editor || !track || !beats || !cue || !measured) {
        return;
      }
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      isClickSuppressedRef.current = false;
      const value = kind === "end" ? (cue.end ?? block.stop) : cue.beat;
      dragRef.current = {
        kind,
        index: block.index,
        pointerId: event.pointerId,
        startX: event.clientX,
        startBeat: getPointerBeat(measured.laneScale, measured.left, event.clientX),
        value,
        length: kind === "move" && cue.end !== undefined ? cue.end - cue.beat : undefined,
        range: getRange(kind, savedCues, block.index, track),
        targets: getSnapTargets(savedCues, block.index, mixxxCues, beats),
        ...measured,
        current: value,
        isMoved: false,
      };
      editor.onSelect({ location, index: block.index, trackRange: track });
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
      if (editor && track) {
        editor.onSelect({ location, index: block.index, trackRange: track });
      }
    },
    onSetStretch(block, isStretched) {
      const loops = isStretched ? { end: block.end, count: getLoopCount(block, fps) } : undefined;
      editor?.update((file) => setCueLoops(file, location, block.index, loops));
    },
    onSetPreset(block, preset) {
      editor?.update((file) => setCuePreset(file, location, block.index, preset));
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
    const snap = getDragSnap(drag, drag.value + pointerBeat - drag.startBeat, event.altKey);
    const value = getClampedBeat(snap.beat, drag.range);
    const next = getEditedCues(location, savedCues, getEdit(drag, value));
    if (next) {
      drag.current = value;
      setDraft({ cues: next, snap: value === snap.beat ? snap.target : undefined });
    }
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    dragRef.current = undefined;
    setDraft(undefined);
    if (drag.isMoved) {
      isClickSuppressedRef.current = true;
      if (drag.current !== drag.value) {
        editor?.update(getEdit(drag, drag.current));
      }
    }
  }

  function handlePointerCancel() {
    dragRef.current = undefined;
    setDraft(undefined);
  }

  function getGhost(event: DragEvent<HTMLDivElement>): Ghost | undefined {
    const measured = getLaneScale();
    if (!isEditable || !track || !beats || !measured || !hasCueDrag(event)) {
      return undefined;
    }
    const beat = getPointerBeat(measured.laneScale, measured.left, event.clientX);
    const snap = event.altKey
      ? { beat, target: undefined }
      : getSnap(beat, getSnapTargets(savedCues, undefined, mixxxCues, beats), measured.laneScale);
    const pointerBeat = getClampedBeat(snap.beat, getDropRange(track));
    const drag = getCurrentCueDrag();
    const animation = drag && animationsById?.get(drag.animationId);
    const section = drag?.section ?? 0;
    const gap = getGap(savedCues, pointerBeat, track);
    const isGapFilled =
      animation !== undefined &&
      gap !== undefined &&
      getNaturalBeats(animation, section, getBpm(beats, gap.min), fps) > gap.max - gap.min;
    const ghostBeat = isGapFilled ? gap.min : pointerBeat;
    const stop = savedCues.find((cue) => cue.beat > ghostBeat)?.beat ?? track.max;
    const end =
      animation && getDropEnd(animation, section, ghostBeat, stop, getBpm(beats, ghostBeat), fps);
    return {
      beat: ghostBeat,
      stop,
      end,
      name: animation?.name ?? "",
      snap: isGapFilled ? ghostBeat : ghostBeat === snap.beat ? snap.target : undefined,
    };
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    const next = getGhost(event);
    if (!next) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (ghost?.beat !== next.beat || ghost.snap !== next.snap || ghost.name !== next.name) {
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
    const { beat, end } = dropped;
    editor.update((file) =>
      addCue(file, location, {
        beat,
        animation: drag.animationId,
        ...(section === undefined ? {} : { section }),
        ...(drag.preset === undefined ? {} : { preset: drag.preset }),
        ...(end === undefined ? {} : { end }),
      }),
    );
    editor.onSelect({
      location,
      index: savedCues.filter((cue) => cue.beat < beat).length,
      trackRange: track,
    });
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
  const snapBeat = draft?.snap ?? ghost?.snap;
  return (
    <div
      ref={laneRef}
      className="relative h-8 overflow-hidden rounded-sm bg-muted/40"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      {lane.blocks.length === 0 && !ghost && editor && (
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
          isSelected={
            editor?.selection?.location === location && editor.selection.index === block.index
          }
          live={live?.index === block.index ? live : undefined}
          handlers={isEditable ? handlers : undefined}
        />
      ))}
      {ghost && (
        <div
          className="pointer-events-none absolute inset-y-0 z-20 border-2 border-dashed border-sky-400 bg-sky-400/20"
          style={getSpanStyle(
            getBeatFraction(scale, ghost.beat),
            getBeatFraction(scale, ghost.end ?? ghost.stop),
          )}
        >
          <span className="absolute top-0.5 left-0.5 truncate rounded-sm bg-black/70 px-1 text-[10px] leading-3.5 font-medium text-white">
            {ghost.name}
          </span>
        </div>
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
