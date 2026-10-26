import { HEIGHT, WIDTH, getPixel, type Frame } from "@led-matrix/core";
import { useEffect, useRef } from "react";

const LED_PITCH = 8;
const LED_RADIUS = 3;

export function Panel({ frame }: { frame: Frame }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (!context) {
      return;
    }
    context.fillStyle = "#000";
    context.fillRect(0, 0, WIDTH * LED_PITCH, HEIGHT * LED_PITCH);
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const [r, g, b] = getPixel(frame, x, y);
        context.fillStyle = `rgb(${r} ${g} ${b})`;
        context.beginPath();
        context.arc((x + 0.5) * LED_PITCH, (y + 0.5) * LED_PITCH, LED_RADIUS, 0, Math.PI * 2);
        context.fill();
      }
    }
  }, [frame]);

  return <canvas ref={canvasRef} width={WIDTH * LED_PITCH} height={HEIGHT * LED_PITCH} />;
}
