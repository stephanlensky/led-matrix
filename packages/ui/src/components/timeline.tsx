import { type Animation, createRenderer, getAnimationLength } from "@led-matrix/core";
import { RepeatIcon, SkipForwardIcon } from "lucide-react";
import { type KeyboardEvent, type PointerEvent, type ReactNode, useRef, useState } from "react";
import { browserCanvas } from "../lib/browser-canvas.ts";
import { useBrowserClips } from "../lib/clips.ts";
import { getPositionLabel, getSectionName } from "../lib/section-labels.ts";
import { cn } from "../lib/utils.ts";
import { Button } from "./button.tsx";
import { SectionFilmstrip } from "./filmstrip.tsx";

const STRIP_HEIGHT = 56;
const CONTROLS_HEIGHT = 32;
const ROW_GAP = 4;

export const TIMELINE_HEIGHT = STRIP_HEIGHT + ROW_GAP + CONTROLS_HEIGHT;

export type TimelinePosition = {
  index: number;
  progress: number;
  nextIndex: number | undefined;
};

type TimelineProps = {
  animation: Animation | undefined;
  position: TimelinePosition | undefined;
  bpm: number;
  fps: number;
  controls: ReactNode;
  actions?: ReactNode;
  onSeek: (index: number, progress: number) => void;
  onAdvance: () => void;
};

const KEYBOARD_STEP = 0.05;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function Timeline({
  animation,
  position,
  bpm,
  fps,
  controls,
  actions,
  onSeek,
  onAdvance,
}: TimelineProps) {
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const { clips } = useBrowserClips();
  const [renderer] = useState(() => createRenderer({ fps, canvas: browserCanvas, clips }));
  const sections = animation?.sections ?? [];
  const current = position && sections[position.index];
  const canAdvance =
    position !== undefined &&
    position.nextIndex === undefined &&
    current?.mode.type === "loop" &&
    position.index < sections.length - 1;

  function seekTo(clientX: number) {
    const rects = segmentRefs.current
      .slice(0, sections.length)
      .map((segment) => segment?.getBoundingClientRect());
    const index = Math.max(
      0,
      rects.findLastIndex((rect) => rect !== undefined && clientX >= rect.left),
    );
    const rect = rects[index];
    if (rect) {
      onSeek(index, clamp((clientX - rect.left) / rect.width));
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    seekTo(event.clientX);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      seekTo(event.clientX);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const offset = { ArrowLeft: -KEYBOARD_STEP, ArrowRight: KEYBOARD_STEP }[event.key];
    if (offset !== undefined && position) {
      event.preventDefault();
      onSeek(position.index, clamp(position.progress + offset));
    }
  }

  return (
    <div className="flex min-w-0 flex-col" style={{ height: TIMELINE_HEIGHT, gap: ROW_GAP }}>
      {animation && position ? (
        <div
          role="slider"
          aria-label="Position"
          aria-valuemin={0}
          aria-valuemax={sections.length}
          aria-valuenow={position.index + position.progress}
          tabIndex={0}
          style={{ height: STRIP_HEIGHT }}
          className="flex min-w-0 cursor-pointer touch-none gap-1 rounded-md outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onKeyDown={handleKeyDown}
        >
          {sections.map((section, index) => {
            const isCurrent = index === position.index;
            const isNext = index === position.nextIndex;
            return (
              <div
                key={index}
                ref={(element) => {
                  segmentRefs.current[index] = element;
                }}
                style={{ flexGrow: getAnimationLength(section.mode, bpm, fps) }}
                className="relative min-w-14 basis-0 overflow-hidden rounded-md bg-neutral-900"
              >
                <SectionFilmstrip
                  animation={animation}
                  section={index}
                  bpm={bpm}
                  fps={fps}
                  renderer={renderer}
                />
                {!isCurrent && <div className="absolute inset-0 bg-black/35" />}
                <div
                  className={cn(
                    "absolute inset-0 rounded-md ring-1 ring-white/10 ring-inset",
                    isCurrent && "ring-2 ring-white/70",
                    isNext && "animate-pulse ring-2 ring-white/70",
                  )}
                />
                {isCurrent && (
                  <div
                    className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.5)]"
                    style={{ left: `${position.progress * 100}%` }}
                  />
                )}
                {sections.length > 1 && (
                  <span className="pointer-events-none absolute top-1 left-1 flex max-w-[calc(100%-0.5rem)] items-center gap-1 rounded-sm bg-black/70 px-1 py-0.5 text-[10px] leading-none text-white">
                    {section.mode.type === "loop" && <RepeatIcon className="size-2.5 shrink-0" />}
                    <span className="truncate">{getSectionName(section, index)}</span>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div
          style={{ height: STRIP_HEIGHT }}
          className="flex items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground"
        >
          Nothing playing
        </div>
      )}
      <div
        className="grid grid-cols-[1fr_auto_1fr] items-center"
        style={{ height: CONTROLS_HEIGHT }}
      >
        <span className="font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums">
          {current && position && getPositionLabel(current.mode, position.progress)}
        </span>
        <div className="flex items-center gap-1">
          {controls}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Next section"
            aria-pressed={position?.nextIndex !== undefined}
            className="aria-pressed:bg-muted"
            disabled={!canAdvance}
            onClick={onAdvance}
          >
            <SkipForwardIcon />
          </Button>
        </div>
        <div className="flex items-center justify-end gap-1">{actions}</div>
      </div>
    </div>
  );
}
