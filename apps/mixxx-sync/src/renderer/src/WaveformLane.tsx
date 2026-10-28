import { clearImageCanvas, setImageCanvas } from "@led-matrix/ui/lib/canvas-image";
import {
  type MouseEvent,
  type PointerEvent,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type Beats, getBeat, getPosition } from "../../shared/beats.ts";
import { type CueMarker, type CueRange, getCueMarkers } from "../../shared/cue-markers.ts";
import {
  type BeatRange,
  type LaneScale,
  getClampedBeat,
  getSnap,
  getSnapTargets,
  getTrackRange,
} from "../../shared/lane-edit.ts";
import type { MixxxCue, Waveform } from "../../shared/library.ts";
import { type BeatSelection, getBeatSelection, getSelectionLabel } from "../../shared/loop.ts";
import { type TrackRange, getFraction, getTicks } from "../../shared/track-scale.ts";
import { getColorLabel } from "../../shared/track-list.ts";
import { getWaveformColumns } from "../../shared/waveform.ts";
import type { TrackDataCache } from "./useLibrary.ts";

const AXIS_COLOR = "#999999";
const TICK_COLOR = "rgba(153, 153, 153, 0.25)";
const STRONG_TICK_COLOR = "rgba(153, 153, 153, 0.55)";
const MIN_TICK_SPACING = 6;
const WAVEFORM_SCALE = 0.7;
const DRAG_DISTANCE = 3;

type SelectionDrag = {
  pointerId: number;
  startX: number;
  left: number;
  anchor: number;
  laneScale: LaneScale;
  track: BeatRange;
  targets: number[];
  isMoved: boolean;
};

type Size = { width: number; height: number };

function getPercent(position: number, duration: number): string {
  return `${getFraction(position, duration) * 100}%`;
}

function getRangeSize({ start, end }: TrackRange): number {
  return end - start;
}

function drawTicks(
  context: OffscreenCanvasRenderingContext2D,
  beats: Beats,
  duration: number,
  range: TrackRange,
  { width, height }: Size,
) {
  const rangeSize = getRangeSize(range);
  const trackWidth = width / devicePixelRatio / rangeSize;
  for (const tick of getTicks(beats, duration, trackWidth, MIN_TICK_SPACING)) {
    const x = Math.round(
      ((getFraction(tick.position, duration) - range.start) / rangeSize) * width,
    );
    if (x >= 0 && x < width) {
      context.fillStyle = tick.isStrong ? STRONG_TICK_COLOR : TICK_COLOR;
      context.fillRect(x, 0, 1, height);
    }
  }
}

function drawWaveform(
  context: OffscreenCanvasRenderingContext2D,
  waveform: Waveform,
  range: TrackRange,
  { width, height }: Size,
) {
  const { heights, colors } = getWaveformColumns(waveform, width, range);
  const middle = height / 2;
  for (let column = 0; column < width; column++) {
    const halfHeight = heights[column]! * middle * WAVEFORM_SCALE;
    if (halfHeight <= 0) {
      continue;
    }
    const offset = column * 3;
    context.fillStyle = `rgb(${colors[offset]} ${colors[offset + 1]} ${colors[offset + 2]})`;
    context.fillRect(column, middle - halfHeight, 1, halfHeight * 2);
  }
  context.fillStyle = AXIS_COLOR;
  context.fillRect(0, Math.floor(middle), width, 1);
}

function useImageSize(imageRef: RefObject<HTMLImageElement | null>): Size | undefined {
  const [size, setSize] = useState<Size>();

  useEffect(() => {
    const image = imageRef.current;
    if (!image) {
      return undefined;
    }
    const observer = new ResizeObserver(() =>
      setSize({
        width: Math.round(image.clientWidth * devicePixelRatio),
        height: Math.round(image.clientHeight * devicePixelRatio),
      }),
    );
    observer.observe(image);
    return () => {
      observer.disconnect();
      clearImageCanvas(image);
    };
  }, [imageRef]);

  return size;
}

function useFullWaveform(
  cache: TrackDataCache,
  trackId: number,
  isNeeded: boolean,
): Waveform | undefined {
  const [waveform, setWaveform] = useState<Waveform>();
  const isRequested = isNeeded || waveform !== undefined;

  useEffect(() => {
    if (!isRequested) {
      return undefined;
    }
    let isCancelled = false;
    cache.getFullWaveform(trackId).then(
      (value) => {
        if (!isCancelled) {
          setWaveform(value);
        }
      },
      () => undefined,
    );
    return () => {
      isCancelled = true;
    };
  }, [cache, trackId, isRequested]);

  return waveform;
}

function getPointerBeat({ beats, duration, width }: LaneScale, left: number, clientX: number) {
  return getBeat(beats, width > 0 ? ((clientX - left) / width) * duration : 0);
}

function getDragBeat(
  drag: Pick<SelectionDrag, "left" | "laneScale" | "track" | "targets">,
  clientX: number,
  isFree: boolean,
): number {
  const beat = getPointerBeat(drag.laneScale, drag.left, clientX);
  const snapped = isFree ? beat : getSnap(beat, drag.targets, drag.laneScale).beat;
  return getClampedBeat(snapped, drag.track);
}

function SelectionShade({
  selection,
  beats,
  duration,
}: {
  selection: BeatSelection;
  beats: Beats;
  duration: number;
}) {
  const left = getFraction(getPosition(beats, selection.start), duration);
  const right = getFraction(getPosition(beats, selection.end), duration);
  return (
    <div
      className="pointer-events-none absolute top-2 bottom-0 z-[5] border-x border-sky-400 bg-sky-400/20"
      style={{ left: `${left * 100}%`, width: `${(right - left) * 100}%` }}
    >
      <span className="absolute bottom-0.5 left-0.5 rounded-sm bg-sky-400 px-1 font-mono text-xs leading-4 font-semibold whitespace-nowrap text-black">
        {getSelectionLabel(selection)}
      </span>
    </div>
  );
}

function CueRangeShade({ range, duration }: { range: CueRange; duration: number }) {
  const left = getFraction(range.start, duration);
  const right = getFraction(range.end, duration);
  return (
    <div
      className="absolute inset-y-0 opacity-30"
      style={{
        left: `${left * 100}%`,
        width: `${(right - left) * 100}%`,
        backgroundColor: getColorLabel(range.color),
      }}
    />
  );
}

function CueMarkerLine({ marker, duration }: { marker: CueMarker; duration: number }) {
  const color = getColorLabel(marker.color);
  return (
    <div
      className="absolute inset-y-0 w-px"
      style={{ left: getPercent(marker.position, duration), backgroundColor: color }}
      title={marker.title}
    >
      {marker.label && (
        <span
          className="absolute top-0 left-0 rounded-r-sm px-1 font-mono text-xs leading-4 font-semibold text-black"
          style={{ backgroundColor: color }}
        >
          {marker.label}
        </span>
      )}
    </div>
  );
}

export function WaveformLane({
  trackId,
  cache,
  range,
  duration,
  waveform,
  beats,
  cues,
  selection,
  onSelectionChange,
}: {
  trackId: number;
  cache: TrackDataCache;
  range: TrackRange;
  duration: number;
  waveform: Waveform | undefined;
  beats: Beats | undefined;
  cues: readonly MixxxCue[];
  selection: BeatSelection | undefined;
  onSelectionChange: (selection: BeatSelection | undefined) => void;
}) {
  const laneRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<SelectionDrag>(undefined);
  const isClickSuppressedRef = useRef(false);
  const [draft, setDraft] = useState<BeatSelection>();
  const imageRef = useRef<HTMLImageElement>(null);
  const size = useImageSize(imageRef);
  const { ranges, markers } = useMemo(() => getCueMarkers(cues), [cues]);
  const isDetailNeeded =
    waveform !== undefined &&
    size !== undefined &&
    waveform.all.length * getRangeSize(range) < size.width;
  const fullWaveform = useFullWaveform(cache, trackId, isDetailNeeded);
  const visibleWaveform = isDetailNeeded ? (fullWaveform ?? waveform) : waveform;

  useEffect(() => {
    const image = imageRef.current;
    if (!image || !size || size.width === 0 || size.height === 0) {
      return;
    }
    const canvas = new OffscreenCanvas(size.width, size.height);
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    if (beats) {
      drawTicks(context, beats, duration, range, size);
    }
    if (visibleWaveform) {
      drawWaveform(context, visibleWaveform, range, size);
    }
    void setImageCanvas(image, canvas);
  }, [size, visibleWaveform, beats, duration, range]);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    const rect = laneRef.current?.getBoundingClientRect();
    if (event.button !== 0 || !beats || !rect) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    isClickSuppressedRef.current = false;
    const scale = {
      left: rect.left,
      laneScale: { beats, duration, width: rect.width },
      track: getTrackRange(beats, duration),
      targets: getSnapTargets([], undefined, cues, beats),
    };
    dragRef.current = {
      ...scale,
      pointerId: event.pointerId,
      startX: event.clientX,
      anchor: getDragBeat(scale, event.clientX, event.altKey),
      isMoved: false,
    };
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    if (!drag.isMoved && Math.abs(event.clientX - drag.startX) < DRAG_DISTANCE) {
      return;
    }
    drag.isMoved = true;
    setDraft(getBeatSelection(drag.anchor, getDragBeat(drag, event.clientX, event.altKey)));
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
      const next = getBeatSelection(drag.anchor, getDragBeat(drag, event.clientX, event.altKey));
      onSelectionChange(next.end > next.start ? next : undefined);
    }
  }

  function handlePointerCancel() {
    dragRef.current = undefined;
    setDraft(undefined);
  }

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (isClickSuppressedRef.current) {
      isClickSuppressedRef.current = false;
      event.stopPropagation();
      return;
    }
    const rect = laneRef.current?.getBoundingClientRect();
    if (!selection || !beats || !rect) {
      return;
    }
    const beat = getPointerBeat({ beats, duration, width: rect.width }, rect.left, event.clientX);
    if (beat < selection.start || beat > selection.end) {
      onSelectionChange(undefined);
    }
  }

  const visibleSelection = draft ?? selection;

  return (
    <div
      ref={laneRef}
      className="relative h-22 overflow-hidden"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onClick={handleClick}
      onDoubleClick={() => onSelectionChange(undefined)}
    >
      <div className="absolute inset-x-0 top-2 bottom-0 overflow-hidden rounded-sm bg-black">
        {ranges.map((cueRange) => (
          <CueRangeShade
            key={`${cueRange.start}-${cueRange.end}-${cueRange.color}`}
            range={cueRange}
            duration={duration}
          />
        ))}
        <img
          ref={imageRef}
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-y-0 h-full"
          style={{
            left: `${range.start * 100}%`,
            width: `${getRangeSize(range) * 100}%`,
          }}
        />
        {!waveform && (
          <span className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
            No analysis
          </span>
        )}
      </div>
      {markers.map((marker) => (
        <CueMarkerLine
          key={`${marker.position}-${marker.title}`}
          marker={marker}
          duration={duration}
        />
      ))}
      {visibleSelection && beats && (
        <SelectionShade selection={visibleSelection} beats={beats} duration={duration} />
      )}
    </div>
  );
}
