import {
  CHANNELS,
  HEIGHT,
  RGBA_CHANNELS,
  WIDTH,
  type Animation,
  type Frame,
  type Renderer,
  getAnimationLength,
} from "@led-matrix/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBrowserClips } from "../lib/clips.ts";

const RENDER_DELAY_MS = 150;

type FilmstripProps = {
  getFrame: (progress: number) => Frame;
};

type Size = { width: number; height: number };

function getImageData(frame: Frame): ImageData {
  const image = new ImageData(WIDTH, HEIGHT);
  for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel++) {
    image.data.set(frame.subarray(pixel * CHANNELS, (pixel + 1) * CHANNELS), pixel * RGBA_CHANNELS);
    image.data[pixel * RGBA_CHANNELS + 3] = 255;
  }
  return image;
}

export function Filmstrip({ getFrame }: FilmstripProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<Size>();
  const { subscribe } = useBrowserClips();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }
    const observer = new ResizeObserver(() =>
      setSize({
        width: Math.round(container.clientWidth * devicePixelRatio),
        height: Math.round(container.clientHeight * devicePixelRatio),
      }),
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size || size.width === 0 || size.height === 0) {
      return undefined;
    }
    const tile = size.height;
    const count = Math.ceil(size.width / tile);
    const pixels = new OffscreenCanvas(WIDTH, HEIGHT);
    const pixelContext = pixels.getContext("2d");

    const strip = new OffscreenCanvas(size.width, tile);
    const stripContext = strip.getContext("2d");
    if (!pixelContext || !stripContext) {
      return undefined;
    }
    stripContext.imageSmoothingQuality = "high";

    function drawTile(index: number) {
      if (!canvas || !pixelContext || !stripContext) {
        return;
      }
      if (index === count) {
        canvas.width = strip.width;
        canvas.height = strip.height;
        canvas.style.width = `${strip.width / devicePixelRatio}px`;
        canvas.getContext("2d")?.drawImage(strip, 0, 0);
        return;
      }
      const progress = Math.min(((index + 0.5) * tile) / strip.width, 1);
      pixelContext.putImageData(getImageData(getFrame(progress)), 0, 0);
      stripContext.drawImage(pixels, index * tile, 0, tile, tile);
      timeout = setTimeout(() => drawTile(index + 1), 0);
    }

    let timeout = setTimeout(() => drawTile(0), RENDER_DELAY_MS);
    const unsubscribe = subscribe(() => {
      clearTimeout(timeout);
      timeout = setTimeout(() => drawTile(0), RENDER_DELAY_MS);
    });
    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, [getFrame, size, subscribe]);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      <canvas ref={canvasRef} className="absolute top-0 left-0 h-full w-0" />
    </div>
  );
}

type SectionFilmstripProps = {
  animation: Animation;
  section: number;
  bpm: number;
  fps: number;
  renderer: Renderer;
};

export function SectionFilmstrip({
  animation,
  section,
  bpm,
  fps,
  renderer,
}: SectionFilmstripProps) {
  const getFrame = useCallback(
    (progress: number) => {
      const current = animation.sections[section];
      const length = current ? getAnimationLength(current.mode, bpm, fps) : 0;
      return renderer.render(animation, progress * length, bpm, section);
    },
    [animation, section, bpm, fps, renderer],
  );
  return <Filmstrip getFrame={getFrame} />;
}
