import { z } from "zod";
import { defineEffect } from "../effect.ts";
import { HEIGHT, RGBA_CHANNELS, WIDTH } from "../frame.ts";
import { getLuminance } from "../sample.ts";

const SHININESS = 16;
const GRAY = 200;

export const emboss = defineEffect({
  id: "emboss",
  name: "Emboss",
  kind: "filter",
  params: z.object({
    angle: z.number().min(0).max(360).default(225),
    rotations: z.number().int().min(-8).max(8).default(0),
    elevation: z.number().min(5).max(90).default(40),
    depth: z.number().min(0).max(16).default(4),
    ambient: z.number().min(0).max(1).default(0.25),
    specular: z.number().min(0).max(1).default(0.4),
    keepColor: z.boolean().default(true),
  }),
  render(image, { params, progress, source }) {
    const azimuth = ((params.angle + progress * params.rotations * 360) * Math.PI) / 180;
    const elevation = (params.elevation * Math.PI) / 180;
    const lightX = Math.cos(elevation) * Math.cos(azimuth);
    const lightY = Math.cos(elevation) * Math.sin(azimuth);
    const lightZ = Math.sin(elevation);
    const halfLength = Math.hypot(lightX, lightY, lightZ + 1);
    const [halfX = 0, halfY = 0, halfZ = 1] = [lightX, lightY, lightZ + 1].map(
      (value) => value / halfLength,
    );
    const flatHighlight = halfZ ** SHININESS;
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const slopeX =
          (getLuminance(source, x + 1, y - 1) +
            2 * getLuminance(source, x + 1, y) +
            getLuminance(source, x + 1, y + 1) -
            getLuminance(source, x - 1, y - 1) -
            2 * getLuminance(source, x - 1, y) -
            getLuminance(source, x - 1, y + 1)) /
          8;
        const slopeY =
          (getLuminance(source, x - 1, y + 1) +
            2 * getLuminance(source, x, y + 1) +
            getLuminance(source, x + 1, y + 1) -
            getLuminance(source, x - 1, y - 1) -
            2 * getLuminance(source, x, y - 1) -
            getLuminance(source, x + 1, y - 1)) /
          8;
        const normalX = -slopeX * params.depth;
        const normalY = -slopeY * params.depth;
        const normalLength = Math.hypot(normalX, normalY, 1);
        const diffuse =
          Math.max(0, (normalX * lightX + normalY * lightY + lightZ) / normalLength) / lightZ;
        const highlight =
          Math.max(0, (normalX * halfX + normalY * halfY + halfZ) / normalLength) ** SHININESS;
        const shade = params.ambient + (1 - params.ambient) * diffuse;
        const specular =
          (Math.max(0, highlight - flatHighlight) / (1 - flatHighlight)) * params.specular * 255;
        const offset = (y * WIDTH + x) * RGBA_CHANNELS;
        for (let channel = 0; channel < 3; channel++) {
          const base = params.keepColor ? (source[offset + channel] ?? 0) : GRAY;
          image[offset + channel] = base * shade + specular;
        }
        image[offset + 3] = 255;
      }
    }
  },
});
