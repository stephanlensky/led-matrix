import { type CanvasProvider, canvasFontUrls } from "@led-matrix/core";

export const browserCanvas: CanvasProvider = {
  createContext(width, height) {
    const context = new OffscreenCanvas(width, height).getContext("2d");
    if (!context) {
      throw new Error("OffscreenCanvas 2D context is unavailable");
    }
    return context;
  },
};

export function loadCanvasFonts(): Promise<unknown> {
  return Promise.all(
    Object.entries(canvasFontUrls).map(async ([family, url]) => {
      const font = await new FontFace(family, `url(${url.href})`).load();
      document.fonts.add(font);
    }),
  );
}
