import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import type { Beats } from "../../shared/beats.ts";
import { type CueMarker, type CueRange, getCueMarkers } from "../../shared/cue-markers.ts";
import type { MixxxCue, Waveform } from "../../shared/library.ts";
import { getFraction, getTicks } from "../../shared/track-scale.ts";
import { getColorLabel } from "../../shared/track-list.ts";
import { getWaveformColumns } from "../../shared/waveform.ts";

const AXIS_COLOR = "#999999";
const TICK_COLOR = "rgba(153, 153, 153, 0.25)";
const STRONG_TICK_COLOR = "rgba(153, 153, 153, 0.55)";
const MIN_TICK_SPACING = 6;

type Size = { width: number; height: number };

function getPercent(position: number, duration: number): string {
  return `${getFraction(position, duration) * 100}%`;
}

function drawTicks(
  context: CanvasRenderingContext2D,
  beats: Beats,
  duration: number,
  { width, height }: Size,
) {
  const ticks = getTicks(beats, duration, width / devicePixelRatio, MIN_TICK_SPACING);
  for (const tick of ticks) {
    context.fillStyle = tick.isStrong ? STRONG_TICK_COLOR : TICK_COLOR;
    context.fillRect(Math.round(getFraction(tick.position, duration) * width), 0, 1, height);
  }
}

function drawWaveform(
  context: CanvasRenderingContext2D,
  waveform: Waveform,
  { width, height }: Size,
) {
  const { heights, colors } = getWaveformColumns(waveform, width);
  const middle = height / 2;
  for (let column = 0; column < width; column++) {
    const halfHeight = heights[column]! * middle;
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

function useCanvasSize(canvasRef: RefObject<HTMLCanvasElement | null>): Size | undefined {
  const [size, setSize] = useState<Size>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }
    const observer = new ResizeObserver(() =>
      setSize({
        width: Math.round(canvas.clientWidth * devicePixelRatio),
        height: Math.round(canvas.clientHeight * devicePixelRatio),
      }),
    );
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [canvasRef]);

  return size;
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
          className="absolute top-0 left-0 rounded-br-sm px-0.5 font-mono text-[10px] leading-3 font-semibold text-black"
          style={{ backgroundColor: color }}
        >
          {marker.label}
        </span>
      )}
    </div>
  );
}

export function WaveformLane({
  duration,
  waveform,
  beats,
  cues,
}: {
  duration: number;
  waveform: Waveform | undefined;
  beats: Beats | undefined;
  cues: readonly MixxxCue[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useCanvasSize(canvasRef);
  const { ranges, markers } = useMemo(() => getCueMarkers(cues), [cues]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !size) {
      return;
    }
    canvas.width = size.width;
    canvas.height = size.height;
    context.clearRect(0, 0, size.width, size.height);
    if (beats) {
      drawTicks(context, beats, duration, size);
    }
    if (waveform) {
      drawWaveform(context, waveform, size);
    }
  }, [size, waveform, beats, duration]);

  return (
    <div className="relative h-10 overflow-hidden rounded-sm bg-black">
      {ranges.map((range, index) => (
        <CueRangeShade key={index} range={range} duration={duration} />
      ))}
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
      {!waveform && (
        <span className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
          No analysis
        </span>
      )}
      {markers.map((marker, index) => (
        <CueMarkerLine key={index} marker={marker} duration={duration} />
      ))}
    </div>
  );
}
