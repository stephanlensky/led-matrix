import { fileURLToPath } from "node:url";
import { GlobalFonts, createCanvas } from "@napi-rs/canvas";
import { canvasFontUrls } from "./canvas-fonts.ts";
import type { CanvasProvider } from "./canvas.ts";

for (const [family, url] of Object.entries(canvasFontUrls)) {
  GlobalFonts.registerFromPath(fileURLToPath(url), family);
}

export const nodeCanvas: CanvasProvider = {
  createContext: (width, height) => createCanvas(width, height).getContext("2d"),
};
