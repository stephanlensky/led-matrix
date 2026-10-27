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

const RENDER_DELAY_MS = 150;

type FilmstripProps = {
  getFrame: (progress: number) => Frame;
  version: unknown;
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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function Filmstrip({ getFrame, version }: FilmstripProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size || size.width === 0 || size.height === 0) {
      return undefined;
    }
    let isCancelled = false;
    const tile = size.height;
    const count = Math.ceil(size.width / tile);
    const pixels = new OffscreenCanvas(WIDTH, HEIGHT);
    const pixelContext = pixels.getContext("2d");

    const strip = new OffscreenCanvas(size.width, tile);
    const stripContext = strip.getContext("2d");

    async function draw() {
      if (!canvas || !pixelContext || !stripContext) {
        return;
      }
      await wait(RENDER_DELAY_MS);
      stripContext.imageSmoothingQuality = "high";
      for (let index = 0; index < count; index++) {
        if (isCancelled) {
          return;
        }
        const progress = Math.min(((index + 0.5) * tile) / strip.width, 1);
        pixelContext.putImageData(getImageData(getFrame(progress)), 0, 0);
        stripContext.drawImage(pixels, index * tile, 0, tile, tile);
        await wait(0);
      }
      if (!isCancelled) {
        canvas.width = strip.width;
        canvas.height = strip.height;
        canvas.getContext("2d")?.drawImage(strip, 0, 0);
      }
    }

    draw().catch(() => undefined);
    return () => {
      isCancelled = true;
    };
  }, [getFrame, version, size]);

  return <canvas ref={canvasRef} className="absolute inset-0 size-full" />;
}

type SectionFilmstripProps = {
  animation: Animation;
  section: number;
  bpm: number;
  fps: number;
  renderer: Renderer;
  clipsVersion: number;
};

export function SectionFilmstrip({
  animation,
  section,
  bpm,
  fps,
  renderer,
  clipsVersion,
}: SectionFilmstripProps) {
  const getFrame = useCallback(
    (progress: number) => {
      const current = animation.sections[section];
      const length = current ? getAnimationLength(current.mode, bpm, fps) : 0;
      return renderer.render(animation, progress * length, bpm, section);
    },
    [animation, section, bpm, fps, renderer],
  );
  return <Filmstrip getFrame={getFrame} version={clipsVersion} />;
}
