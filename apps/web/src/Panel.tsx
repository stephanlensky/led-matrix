import { CHANNELS, HEIGHT, RGBA_CHANNELS, WIDTH, type Frame } from "@led-matrix/core";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";

const OFF_LEVEL = 14;
const GAP_RATIO = 0.2;
const MIN_GRID_PITCH = 4;

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

function getPitch(element: HTMLElement, inset: number): number {
  const size = Math.min(
    (element.clientWidth - inset) / WIDTH,
    (element.clientHeight - inset) / HEIGHT,
  );
  return Math.max(1, Math.floor(size * devicePixelRatio));
}

export function usePanelPitch(containerRef: RefObject<HTMLElement | null>, inset = 0): number {
  const [pitch, setPitch] = useState(1);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }
    const updatePitch = () => setPitch(getPitch(container, inset));
    const observer = new ResizeObserver(updatePitch);
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, inset]);

  return pitch;
}

function createGapMask(pitch: number, gap: number): OffscreenCanvas {
  const mask = new OffscreenCanvas(WIDTH * pitch - gap, HEIGHT * pitch - gap);
  const context = mask.getContext("2d");
  if (context) {
    for (let x = 1; x < WIDTH; x++) {
      context.fillRect(x * pitch - gap, 0, gap, mask.height);
    }
    for (let y = 1; y < HEIGHT; y++) {
      context.fillRect(0, y * pitch - gap, mask.width, gap);
    }
  }
  return mask;
}

export function Panel({ frame, pitch, showGrid }: PanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pixelsRef = useRef<{ canvas: OffscreenCanvas; image: ImageData }>(null);
  const gap = getGap(pitch, showGrid);
  const mask = useMemo(() => (gap > 0 ? createGapMask(pitch, gap) : undefined), [pitch, gap]);

  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    pixelsRef.current ??= {
      canvas: new OffscreenCanvas(WIDTH, HEIGHT),
      image: new ImageData(WIDTH, HEIGHT),
    };
    const { canvas, image } = pixelsRef.current;
    const pixelContext = canvas.getContext("2d");
    if (!context || !pixelContext) {
      return;
    }
    for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel++) {
      for (let channel = 0; channel < CHANNELS; channel++) {
        image.data[pixel * RGBA_CHANNELS + channel] = getLevel(
          frame[pixel * CHANNELS + channel] ?? 0,
        );
      }
      image.data[pixel * RGBA_CHANNELS + 3] = 255;
    }
    pixelContext.putImageData(image, 0, 0);
    context.globalCompositeOperation = "copy";
    context.imageSmoothingEnabled = false;
    context.drawImage(canvas, 0, 0, WIDTH * pitch, HEIGHT * pitch);
    if (mask) {
      context.globalCompositeOperation = "destination-out";
      context.drawImage(mask, 0, 0);
    }
  }, [frame, pitch, mask]);

  return (
    <canvas
      ref={canvasRef}
      className="block"
      width={WIDTH * pitch - gap}
      height={HEIGHT * pitch - gap}
      style={{
        width: (WIDTH * pitch - gap) / devicePixelRatio,
        height: (HEIGHT * pitch - gap) / devicePixelRatio,
      }}
    />
  );
}
