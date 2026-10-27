import { type Renderer, type StoredAnimation, createFrame } from "@led-matrix/core";
import { Filmstrip } from "@led-matrix/ui/components/filmstrip";
import { useClipsVersion } from "@led-matrix/ui/lib/clips";
import { getSectionName } from "@led-matrix/ui/lib/section-labels";
import { RepeatIcon } from "lucide-react";
import { useCallback, useMemo } from "react";
import {
  type AnimationBlock,
  getAnimationLane,
  getBlockPosition,
} from "../../shared/animation-lane.ts";
import { type Beats, getBeat, getPosition } from "../../shared/beats.ts";
import type { Cue } from "../../shared/mapping.ts";
import { getFraction } from "../../shared/track-scale.ts";

const blankFrame = createFrame();

export type AnimationSource = {
  animationsById: ReadonlyMap<string, StoredAnimation> | undefined;
  renderer: Renderer;
  fps: number;
};

type Scale = { beats: Beats; duration: number };

function getBeatFraction({ beats, duration }: Scale, beat: number): number {
  return getFraction(getPosition(beats, beat), duration);
}

function getSpanStyle(left: number, right: number) {
  return { left: `${left * 100}%`, width: `${Math.max(right - left, 0) * 100}%` };
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
  const clipsVersion = useClipsVersion();
  const { renderer, fps } = source;
  const getFrame = useCallback(
    (progress: number) => {
      const seconds = (start + progress * (end - start)) * scale.duration;
      const position = getBlockPosition(block, getBeat(scale.beats, seconds), fps);
      return position
        ? renderer.render(block.animation, position.time, block.bpm, position.index)
        : blankFrame;
    },
    [block, scale, start, end, renderer, fps],
  );
  return <Filmstrip getFrame={getFrame} version={clipsVersion} />;
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

function Block({
  block,
  scale,
  source,
}: {
  block: AnimationBlock;
  scale: Scale;
  source: AnimationSource;
}) {
  const start = getBeatFraction(scale, block.beat);
  const end = getBeatFraction(scale, block.end);
  const stop = getBeatFraction(scale, block.stop);
  const hasSections = block.animation.sections.length > 1;

  return (
    <>
      <div
        className="absolute inset-y-0 overflow-hidden border-l-2 border-white/80 bg-neutral-900"
        style={getSpanStyle(start, end)}
        title={block.animation.name}
      >
        {end > start && (
          <BlockFilmstrip block={block} scale={scale} start={start} end={end} source={source} />
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
        </div>
        {block.hasEnd && <div className="absolute inset-y-0 right-0 w-0.5 bg-white/80" />}
      </div>
      {stop > end && (
        <div
          className="absolute inset-y-0 border-y border-dashed border-white/15 bg-black/40"
          style={getSpanStyle(end, stop)}
        />
      )}
    </>
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
  duration,
  beats,
  cues,
  source,
}: {
  duration: number;
  beats: Beats | undefined;
  cues: readonly Cue[] | undefined;
  source: AnimationSource;
}) {
  const { animationsById, fps } = source;
  const scale = useMemo(() => beats && { beats, duration }, [beats, duration]);
  const lane = useMemo(
    () =>
      cues && animationsById
        ? getAnimationLane(cues, animationsById, beats, duration, fps)
        : undefined,
    [cues, beats, animationsById, duration, fps],
  );

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
  if (!cues) {
    return <LaneMessage>{""}</LaneMessage>;
  }
  if (!lane) {
    return <LaneMessage>{`${cues.length} ${cues.length === 1 ? "cue" : "cues"}`}</LaneMessage>;
  }
  return (
    <div className="relative h-8 overflow-hidden rounded-sm bg-muted/40">
      {lane.blocks.map((block) => (
        <Block key={block.beat} block={block} scale={scale} source={source} />
      ))}
    </div>
  );
}
