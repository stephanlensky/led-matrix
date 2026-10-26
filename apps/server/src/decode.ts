import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { Worker } from "node:worker_threads";
import {
  CLIP_FRAME_BYTES,
  HEIGHT,
  WIDTH,
  type ClipImportOptions,
  type ClipSource,
  type ResampleMode,
  type SourceImage,
  fitImage,
} from "@led-matrix/core";
import sharp from "sharp";

export const MAX_FRAMES = 18_000;
const MAX_SOURCE_SIZE = 512;
const SVG_RENDER_SIZE = 256;
const SVG_BASE_DENSITY = 72;
const MIN_GIF_DELAY = 20;
const DEFAULT_FRAME_DURATION = 100;
const videoExtensions = new Set([".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v"]);

export type UploadedFile = {
  name: string;
  mimetype: string;
  data: Buffer;
};

export type DecodedClip = {
  source: ClipSource;
  durations: number[];
  frames: Uint8Array;
};

type DecodedImage = {
  format: string | undefined;
  frames: SourceImage[];
  delays: number[] | undefined;
};

export type DecodeWorkerMessage =
  | { type: "clip"; clip: DecodedClip }
  | { type: "error"; message: string };

export class DecodeError extends Error {}

function isVideo(file: UploadedFile): boolean {
  return (
    file.mimetype.startsWith("video/") || videoExtensions.has(extname(file.name).toLowerCase())
  );
}

function isSvg(file: UploadedFile): boolean {
  return file.mimetype === "image/svg+xml" || extname(file.name).toLowerCase() === ".svg";
}

async function getSvgDensity(data: Buffer): Promise<number> {
  const { width, height } = await sharp(data).metadata();
  return (SVG_BASE_DENSITY * SVG_RENDER_SIZE) / Math.max(width, height, 1);
}

async function decodeImage(file: UploadedFile, resample: ResampleMode): Promise<DecodedImage> {
  try {
    return await decodeSharpImage(file, resample);
  } catch {
    throw new DecodeError(`Unsupported file "${file.name}"`);
  }
}

async function decodeSharpImage(file: UploadedFile, resample: ResampleMode): Promise<DecodedImage> {
  const density = isSvg(file) ? await getSvgDensity(file.data) : undefined;
  const image = sharp(file.data, { animated: true, density });
  const metadata = await image.metadata();
  const { data, info } = await image
    .resize({
      width: MAX_SOURCE_SIZE,
      height: MAX_SOURCE_SIZE,
      fit: "inside",
      withoutEnlargement: true,
      kernel: resample === "nearest" ? "nearest" : "lanczos3",
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const frameHeight = info.pageHeight ?? info.height;
  const frameBytes = info.width * frameHeight * 4;
  const frames = Array.from(
    { length: Math.min(info.height / frameHeight, MAX_FRAMES) },
    (_, index) => ({
      data: data.subarray(index * frameBytes, (index + 1) * frameBytes),
      width: info.width,
      height: frameHeight,
    }),
  );
  return { format: metadata.format, frames, delays: metadata.delay };
}

function getVideoFilter({ fit, resample, fps }: ClipImportOptions): string {
  const flags = resample === "nearest" ? "neighbor" : "area";
  const size = `${WIDTH}:${HEIGHT}`;
  const scale = {
    fill: [`scale=${size}:flags=${flags}`],
    cover: [`scale=${size}:force_original_aspect_ratio=increase:flags=${flags}`, `crop=${size}`],
    contain: [
      `scale=${size}:force_original_aspect_ratio=decrease:flags=${flags}`,
      "format=rgba",
      `pad=${size}:-1:-1:color=0x00000000`,
    ],
  }[fit];
  return [`fps=${fps}`, ...scale, "format=rgba"].join(",");
}

function runFfmpeg(args: readonly string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    const output: Buffer[] = [];
    const errors: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => output.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
    child.on("error", (error) => reject(new DecodeError(`Failed to run ffmpeg: ${error.message}`)));
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(output));
      } else {
        const message = Buffer.concat(errors).toString().trim().split("\n").at(-1);
        reject(new DecodeError(`Failed to decode video: ${message ?? `exit code ${code}`}`));
      }
    });
  });
}

async function decodeVideo(file: UploadedFile, options: ClipImportOptions): Promise<DecodedClip> {
  const dir = await mkdtemp(join(tmpdir(), "led-matrix-video-"));
  try {
    const path = join(dir, `input${extname(file.name)}`);
    await writeFile(path, file.data);
    const output = await runFfmpeg([
      "-v",
      "error",
      "-ss",
      String(options.start),
      "-t",
      String(options.duration),
      "-i",
      path,
      "-an",
      "-vf",
      getVideoFilter(options),
      "-frames:v",
      String(MAX_FRAMES),
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "pipe:1",
    ]);
    const frameCount = Math.floor(output.length / CLIP_FRAME_BYTES);
    if (frameCount === 0) {
      throw new DecodeError("Video contains no frames in the selected range");
    }
    return {
      source: "video",
      durations: Array.from({ length: frameCount }, () => 1000 / options.fps),
      frames: new Uint8Array(output.subarray(0, frameCount * CLIP_FRAME_BYTES)),
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function getFrameData(images: readonly SourceImage[], options: ClipImportOptions): Uint8Array {
  const frames = new Uint8Array(images.length * CLIP_FRAME_BYTES);
  for (const [index, image] of images.entries()) {
    frames.set(fitImage(image, options), index * CLIP_FRAME_BYTES);
  }
  return frames;
}

function getGifDelay(delay: number | undefined): number {
  return delay === undefined || delay < MIN_GIF_DELAY ? DEFAULT_FRAME_DURATION : delay;
}

function getImageSource(file: UploadedFile, format: string | undefined): ClipSource {
  if (isSvg(file)) {
    return "svg";
  }
  return format === "gif" ? "gif" : "image";
}

async function decodeSequence(
  files: readonly UploadedFile[],
  options: ClipImportOptions,
): Promise<DecodedClip> {
  const sorted = files.toSorted((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
  const decoded = await Promise.all(
    sorted.slice(0, MAX_FRAMES).map((file) => decodeImage(file, options.resample)),
  );
  const images = decoded.flatMap(({ frames }) => frames.slice(0, 1));
  return {
    source: "sequence",
    durations: images.map(() => 1000 / options.fps),
    frames: getFrameData(images, options),
  };
}

export async function decodeClip(
  files: readonly UploadedFile[],
  options: ClipImportOptions,
): Promise<DecodedClip> {
  const [file] = files;
  if (!file) {
    throw new DecodeError("No files uploaded");
  }
  if (files.length > 1) {
    if (files.some(isVideo)) {
      throw new DecodeError("Image sequences cannot contain videos");
    }
    return decodeSequence(files, options);
  }
  if (isVideo(file)) {
    return decodeVideo(file, options);
  }
  const { format, frames, delays } = await decodeImage(file, options.resample);
  return {
    source: getImageSource(file, format),
    durations: frames.map((_, index) =>
      frames.length > 1 ? getGifDelay(delays?.[index]) : DEFAULT_FRAME_DURATION,
    ),
    frames: getFrameData(frames, options),
  };
}

export function decodeClipInWorker(
  files: readonly UploadedFile[],
  options: ClipImportOptions,
): Promise<DecodedClip> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./decode-worker.ts", import.meta.url), {
      workerData: { files, options },
    });
    worker.once("message", (message: DecodeWorkerMessage) => {
      if (message.type === "clip") {
        resolve(message.clip);
      } else {
        reject(new DecodeError(message.message));
      }
    });
    worker.once("error", reject);
    worker.once("exit", (code) => reject(new Error(`Clip decoder exited with code ${code}`)));
  });
}
