import { createCanvas } from "@napi-rs/canvas";
import type { CanvasProvider } from "./canvas.ts";

export const nodeCanvas: CanvasProvider = {
  createContext: (width, height) => createCanvas(width, height).getContext("2d"),
};
