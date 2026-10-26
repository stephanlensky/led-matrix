export const canvasFontFamilies = ["Anton", "Bungee"] as const;

export type CanvasFontFamily = (typeof canvasFontFamilies)[number];

export const canvasFontUrls: Readonly<Record<CanvasFontFamily, URL>> = {
  Anton: new URL("../fonts/Anton-Regular.ttf", import.meta.url),
  Bungee: new URL("../fonts/Bungee-Regular.ttf", import.meta.url),
};
