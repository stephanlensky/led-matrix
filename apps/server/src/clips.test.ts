import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CLIP_FRAME_BYTES,
  type ClipInfo,
  createClip,
  getEncodedFrameCount,
  getRgbaPixel,
} from "@led-matrix/core";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";

let rootDir: string;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  rootDir = await mkdtemp(join(tmpdir(), "led-matrix-"));
  app = createApp({ databasePath: join(rootDir, "led-matrix.db"), logger: false });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  await rm(rootDir, { recursive: true, force: true });
});

type Upload = { name: string; type: string; data: Uint8Array };

async function upload(files: readonly Upload[], fields: Record<string, string> = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }
  for (const file of files) {
    form.append("files", new Blob([new Uint8Array(file.data)], { type: file.type }), file.name);
  }
  const request = new Request("http://localhost", { method: "POST", body: form });
  return app.inject({
    method: "POST",
    url: "/api/clips",
    headers: { "content-type": request.headers.get("content-type") ?? "" },
    body: Buffer.from(await request.arrayBuffer()),
  });
}

function createGif(colors: readonly (readonly [number, number, number])[], delay: number[]) {
  const width = 32;
  const height = 16;
  const raw = Buffer.alloc(width * height * colors.length * 4);
  for (const [page, color] of colors.entries()) {
    for (let pixel = 0; pixel < width * height; pixel++) {
      raw.set([...color, 255], (page * width * height + pixel) * 4);
    }
  }
  return sharp(raw, {
    raw: { width, height: height * colors.length, channels: 4, pageHeight: height },
  })
    .gif({ delay, loop: 0 })
    .toBuffer();
}

async function getFrames(id: string): Promise<Uint8ClampedArray> {
  const response = await app.inject({ method: "GET", url: `/api/clips/${id}/frames` });
  expect(response.headers["content-type"]).toBe("application/octet-stream");
  const data = new Uint8Array(response.rawPayload);
  const clip = createClip(data, []);
  const frames = new Uint8ClampedArray(getEncodedFrameCount(data) * CLIP_FRAME_BYTES);
  for (let index = 0; index < getEncodedFrameCount(data); index++) {
    frames.set(clip.getFrame(index) ?? [], index * CLIP_FRAME_BYTES);
  }
  return frames;
}

describe("clips", () => {
  it("imports animated GIFs with their frame delays", async () => {
    const gif = await createGif(
      [
        [255, 0, 0],
        [0, 0, 255],
      ],
      [50, 0],
    );
    const response = await upload([{ name: "Party Time.gif", type: "image/gif", data: gif }], {
      fit: "contain",
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      id: "party-time",
      name: "Party Time",
      source: "gif",
      durations: [50, 100],
    });
    const frames = await getFrames("party-time");
    expect(frames).toHaveLength(CLIP_FRAME_BYTES * 2);
    expect(getRgbaPixel(frames, 0, 0)[3]).toBe(0);
    expect(getRgbaPixel(frames, 32, 32)).toEqual([255, 0, 0, 255]);
    expect(getRgbaPixel(frames.subarray(CLIP_FRAME_BYTES), 32, 32)).toEqual([0, 0, 255, 255]);
  });

  it("imports SVGs", async () => {
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#00ff00"/></svg>',
    );
    const response = await upload([{ name: "square.svg", type: "image/svg+xml", data: svg }], {
      name: "Square",
    });
    expect(response.json<ClipInfo>()).toMatchObject({ id: "square", source: "svg" });
    expect(getRgbaPixel(await getFrames("square"), 0, 0)).toEqual([0, 255, 0, 255]);
  });

  it("imports image sequences in natural file name order", async () => {
    const images = await Promise.all(
      (
        [
          ["frame-10.png", "#0000ff"],
          ["frame-2.png", "#ff0000"],
        ] as const
      ).map(async ([name, background]) => ({
        name,
        type: "image/png",
        data: await sharp({ create: { width: 8, height: 8, channels: 4, background } })
          .png()
          .toBuffer(),
      })),
    );
    const response = await upload(images, { name: "Sequence", fps: "10" });
    expect(response.json<ClipInfo>()).toMatchObject({ source: "sequence", durations: [100, 100] });
    expect(getRgbaPixel(await getFrames("sequence"), 0, 0)).toEqual([255, 0, 0, 255]);
  });

  it("imports videos with ffmpeg", async () => {
    const path = join(rootDir, "video.mp4");
    execFileSync(
      "ffmpeg",
      "-v error -f lavfi -i color=c=red:s=80x60:d=1:r=10 -pix_fmt yuv420p".split(" ").concat(path),
    );
    const response = await upload(
      [{ name: "video.mp4", type: "video/mp4", data: await readFile(path) }],
      { fps: "5", duration: "0.6" },
    );
    expect(response.statusCode).toBe(201);
    const clip = response.json<ClipInfo>();
    expect(clip).toMatchObject({ id: "video", source: "video" });
    expect(clip.durations).toEqual([200, 200, 200]);
    const [red, green, blue] = getRgbaPixel(await getFrames("video"), 32, 32);
    expect(red).toBeGreaterThan(200);
    expect(green + blue).toBeLessThan(40);
  });

  it("rejects unsupported files and invalid options", async () => {
    const text = { name: "notes.txt", type: "text/plain", data: new TextEncoder().encode("hi") };
    expect((await upload([text])).statusCode).toBe(400);
    expect((await upload([text], { fit: "stretch" })).statusCode).toBe(400);
    expect((await upload([])).statusCode).toBe(400);
  });

  it("renames clips and protects clips used by animations", async () => {
    const gif = await createGif([[255, 255, 255]], [100]);
    await upload([{ name: "white.gif", type: "image/gif", data: gif }]);
    const renamed = await app.inject({
      method: "PATCH",
      url: "/api/clips/white",
      body: { name: "Bright" },
    });
    expect(renamed.json<ClipInfo>().name).toBe("Bright");
    await app.inject({
      method: "POST",
      url: "/api/animations",
      body: {
        id: "uses-white",
        name: "Uses white",
        mode: { type: "loop", beats: 1 },
        layers: [{ effect: "clip", params: { clip: "white" } }],
      },
    });
    const blocked = await app.inject({ method: "DELETE", url: "/api/clips/white" });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({ animations: ["uses-white"] });

    await app.inject({
      method: "POST",
      url: "/api/outputs/simulator/play",
      body: { id: "uses-white" },
    });
    const frame = await new Promise<Buffer>((resolve) => {
      void app.injectWS("/api/stream/simulator", undefined, {
        onInit: (client) =>
          client.on("message", (data: Buffer, isBinary: boolean) => {
            if (isBinary && data.some((value) => value > 0)) {
              client.terminate();
              resolve(data);
            }
          }),
      });
    });
    expect([...frame.subarray(0, 3)]).toEqual([255, 255, 255]);

    await app.inject({ method: "DELETE", url: "/api/animations/uses-white" });
    const deleted = await app.inject({ method: "DELETE", url: "/api/clips/white" });
    expect(deleted.statusCode).toBe(204);
    const list = await app.inject({ method: "GET", url: "/api/clips" });
    expect(list.json()).toEqual([]);
  });
});
