import { CHANNELS, HEIGHT, RGBA_CHANNELS, WIDTH, type Frame } from "@led-matrix/core";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";

const OFF_LEVEL = 14;
const GAP_RATIO = 0.2;
const MIN_GRID_PITCH = 4;
const colors = new Uint8ClampedArray(WIDTH * HEIGHT * RGBA_CHANNELS);
const colorWords = new Uint32Array(colors.buffer);

type PanelProps = {
  frame: Frame;
  pitch: number;
  showGrid: boolean;
};

function getGap(pitch: number, showGrid: boolean): number {
  return showGrid && pitch >= MIN_GRID_PITCH ? Math.max(1, Math.round(pitch * GAP_RATIO)) : 0;
}

function getLevel(value: number): number {
  return OFF_LEVEL + (value * (255 - OFF_LEVEL)) / 255;
}

function getPitch(element: HTMLElement, insetX: number, insetY: number): number {
  const size = Math.min(
    (element.clientWidth - insetX) / WIDTH,
    (element.clientHeight - insetY) / HEIGHT,
  );
  return Math.max(1, size * devicePixelRatio);
}

export function usePanelPitch(
  containerRef: RefObject<HTMLElement | null>,
  insetX = 0,
  insetY = insetX,
): number {
  const [pitch, setPitch] = useState(1);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }
    const updatePitch = () => setPitch(getPitch(container, insetX, insetY));
    const observer = new ResizeObserver(updatePitch);
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, insetX, insetY]);

  return pitch;
}

function getCellMap(count: number, pitch: number, gap: number): Int16Array {
  const map = new Int16Array(Math.round(count * pitch) - gap).fill(-1);
  for (let cell = 0; cell < count; cell++) {
    map.fill(cell, Math.round(cell * pitch), Math.round((cell + 1) * pitch) - gap);
  }
  return map;
}

export function Panel({ frame, pitch, showGrid }: PanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gap = getGap(pitch, showGrid);
  const layout = useMemo(() => {
    const columns = getCellMap(WIDTH, pitch, gap);
    const rows = getCellMap(HEIGHT, pitch, gap);
    return { columns, rows, image: new ImageData(columns.length, rows.length) };
  }, [pitch, gap]);

  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (!context) {
      return;
    }
    for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel++) {
      for (let channel = 0; channel < CHANNELS; channel++) {
        colors[pixel * RGBA_CHANNELS + channel] = getLevel(frame[pixel * CHANNELS + channel] ?? 0);
      }
      colors[pixel * RGBA_CHANNELS + 3] = 255;
    }
    const { columns, rows, image } = layout;
    const imageWords = new Uint32Array(image.data.buffer);
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y] ?? -1;
      const offset = y * columns.length;
      for (let x = 0; x < columns.length; x++) {
        const column = columns[x] ?? -1;
        imageWords[offset + x] =
          row < 0 || column < 0 ? 0 : (colorWords[row * WIDTH + column] ?? 0);
      }
    }
    context.putImageData(image, 0, 0);
  }, [frame, layout]);

  return (
    <canvas
      ref={canvasRef}
      className="block"
      width={layout.columns.length}
      height={layout.rows.length}
      style={{
        width: layout.columns.length / devicePixelRatio,
        height: layout.rows.length / devicePixelRatio,
      }}
    />
  );
}
