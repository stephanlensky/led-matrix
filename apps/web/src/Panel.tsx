import { CHANNELS, HEIGHT, RGBA_CHANNELS, WIDTH, type Frame } from "@led-matrix/core";
import { useEffect, useRef } from "react";

const LED_PITCH = 8;
const LED_RADIUS = 3;

function createLedMask(): OffscreenCanvas {
  const mask = new OffscreenCanvas(WIDTH * LED_PITCH, HEIGHT * LED_PITCH);
  const context = mask.getContext("2d");
  if (context) {
    context.fillStyle = "#000";
    context.fillRect(0, 0, mask.width, mask.height);
    context.globalCompositeOperation = "destination-out";
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        context.beginPath();
        context.arc((x + 0.5) * LED_PITCH, (y + 0.5) * LED_PITCH, LED_RADIUS, 0, Math.PI * 2);
        context.fill();
      }
    }
  }
  return mask;
}

export function Panel({ frame }: { frame: Frame }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resourcesRef = useRef<{ mask: OffscreenCanvas; pixels: OffscreenCanvas; image: ImageData }>(
    null,
  );

  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    resourcesRef.current ??= {
      mask: createLedMask(),
      pixels: new OffscreenCanvas(WIDTH, HEIGHT),
      image: new ImageData(WIDTH, HEIGHT),
    };
    const { mask, pixels, image } = resourcesRef.current;
    const pixelContext = pixels.getContext("2d");
    if (!context || !pixelContext) {
      return;
    }
    for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel++) {
      image.data.set(
        frame.subarray(pixel * CHANNELS, pixel * CHANNELS + CHANNELS),
        pixel * RGBA_CHANNELS,
      );
      image.data[pixel * RGBA_CHANNELS + 3] = 255;
    }
    pixelContext.putImageData(image, 0, 0);
    context.imageSmoothingEnabled = false;
    context.drawImage(pixels, 0, 0, WIDTH * LED_PITCH, HEIGHT * LED_PITCH);
    context.drawImage(mask, 0, 0);
  }, [frame]);

  return (
    <canvas
      ref={canvasRef}
      className="block h-auto max-w-full"
      width={WIDTH * LED_PITCH}
      height={HEIGHT * LED_PITCH}
    />
  );
}
