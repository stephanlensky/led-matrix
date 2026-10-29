import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import {
  type Frame,
  animationSchema,
  createRenderer,
  getParameterAnimation,
  getParameterSelection,
} from "@led-matrix/core";
import { nodeCanvas } from "@led-matrix/core/node-canvas";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { Mesh, MeshDrawing, Raster } from "../../../packages/core/src/mesh.ts";
import { seedAnimations } from "./seeds.ts";

const meshCalls = vi.hoisted(() => ({ count: 0 }));

vi.mock(import("../../../packages/core/src/mesh.ts"), async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    drawMesh: <M extends string>(raster: Raster, model: Mesh<M>, drawing: MeshDrawing<M>) => {
      meshCalls.count++;
      original.drawMesh(raster, model, drawing);
    },
    resolveRaster: (...args: Parameters<typeof original.resolveRaster>) => {
      meshCalls.count++;
      original.resolveRaster(...args);
    },
    compositeRaster: (...args: Parameters<typeof original.compositeRaster>) => {
      meshCalls.count++;
      original.compositeRaster(...args);
    },
  };
});

const FPS = 30;
const BPM = 120;
const FRAME_INDICES = [0, 13, 29, 47, 71, 97];
const TOLERANCE = 1;
const INDEX_URL = new URL("golden-frames/sections.json", import.meta.url);
const FRAMES_URL = new URL("golden-frames/frames.bin.gz", import.meta.url);
const isUpdating = process.env["UPDATE_GOLDEN_FRAMES"] === "1";

const sectionSchema = z.object({ name: z.string(), id: z.string(), section: z.number() });

const goldenSchema = z.object({
  fps: z.number(),
  bpm: z.number(),
  frames: z.array(z.number()),
  sections: z.array(sectionSchema),
});

type Section = z.infer<typeof sectionSchema>;

function getSectionFrames({ id, section }: Section): Frame[] {
  const document = animationSchema.parse(seedAnimations[id]);
  const animation = getParameterAnimation(document, getParameterSelection(document, {}));
  const renderer = createRenderer({ fps: FPS, canvas: nodeCanvas });
  return FRAME_INDICES.map((index) =>
    renderer.render(animation, (index * 1000) / FPS, BPM, section).slice(),
  );
}

function getAllSections(): Section[] {
  return Object.entries(seedAnimations).flatMap(([id, input]) =>
    animationSchema
      .parse(input)
      .sections.map((_, section) => ({ name: `${id}#${section}`, id, section })),
  );
}

function getDifference(actual: Frame, expected: Uint8Array): { count: number; max: number } {
  let count = 0;
  let max = 0;
  for (let offset = 0; offset < expected.length; offset++) {
    const difference = Math.abs((actual[offset] ?? 0) - (expected[offset] ?? 0));
    max = Math.max(max, difference);
    if (difference > TOLERANCE) {
      count++;
    }
  }
  return { count, max };
}

function writeGoldenFrames(): void {
  const sections: Section[] = [];
  const frames: Uint8Array[] = [];
  for (const section of getAllSections()) {
    meshCalls.count = 0;
    const sectionFrames = getSectionFrames(section);
    if (meshCalls.count > 0) {
      sections.push(section);
      frames.push(...sectionFrames.map((frame) => new Uint8Array(frame.buffer)));
    }
  }
  writeFileSync(
    INDEX_URL,
    `${JSON.stringify({ fps: FPS, bpm: BPM, frames: FRAME_INDICES, sections }, null, 2)}\n`,
  );
  writeFileSync(FRAMES_URL, gzipSync(Buffer.concat(frames), { level: 9 }));
}

if (isUpdating) {
  writeGoldenFrames();
}

const golden = goldenSchema.parse(JSON.parse(readFileSync(INDEX_URL, "utf8")));
const goldenData = gunzipSync(readFileSync(FRAMES_URL));
const frameLength = goldenData.length / (golden.sections.length * golden.frames.length);

describe("golden frames of mesh-based seed sections", () => {
  it("use the current frame settings", () => {
    expect({ fps: golden.fps, bpm: golden.bpm, frames: golden.frames }).toEqual({
      fps: FPS,
      bpm: BPM,
      frames: FRAME_INDICES,
    });
  });

  it.each(golden.sections.map((section, index) => ({ name: section.name, section, index })))(
    "$name matches within ±1 per channel",
    ({ section, index }) => {
      const frames = getSectionFrames(section);
      const differences = frames.map((frame, frameIndex) => {
        const start = (index * golden.frames.length + frameIndex) * frameLength;
        const expected = goldenData.subarray(start, start + frameLength);
        const { count, max } = getDifference(frame, expected);
        return { frame: golden.frames[frameIndex], count, max };
      });
      expect(differences.filter(({ count }) => count > 0)).toEqual([]);
    },
  );
});
