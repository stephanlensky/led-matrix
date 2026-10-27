import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname } from "node:path";
import { Readable } from "node:stream";

const contentTypes: Record<string, string> = {
  ".aac": "audio/aac",
  ".aif": "audio/aiff",
  ".aiff": "audio/aiff",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".mp4": "audio/mp4",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".wav": "audio/wav",
};

export type ByteRange = { start: number; end: number };

export function getContentType(path: string): string {
  return contentTypes[extname(path).toLowerCase()] ?? "application/octet-stream";
}

export function getByteRange(header: string | null, size: number): ByteRange | null | undefined {
  if (header === null) {
    return undefined;
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) {
    return null;
  }
  const [, first = "", last = ""] = match;
  if (first === "") {
    const length = Math.min(Number(last), size);
    return length > 0 ? { start: size - length, end: size - 1 } : null;
  }
  const start = Number(first);
  const end = last === "" ? size - 1 : Math.min(Number(last), size - 1);
  return start < size && start <= end ? { start, end } : null;
}

export function getTrackId(url: string): number | undefined {
  const { pathname } = new URL(url);
  const id = Number(pathname.slice(1));
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

export function createTrackAudioHandler(getLocation: (trackId: number) => string | undefined) {
  return async (request: Request): Promise<Response> => {
    const trackId = getTrackId(request.url);
    const location = trackId === undefined ? undefined : getLocation(trackId);
    if (!location) {
      return new Response("Track not found", { status: 404 });
    }
    let size: number;
    try {
      size = (await stat(location)).size;
    } catch {
      return new Response("Track file not found", { status: 404 });
    }
    const headers = new Headers({
      "Accept-Ranges": "bytes",
      "Content-Type": getContentType(location),
    });
    const range = getByteRange(request.headers.get("Range"), size);
    if (range === null) {
      headers.set("Content-Range", `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    const { start, end } = range ?? { start: 0, end: size - 1 };
    headers.set("Content-Length", String(end - start + 1));
    if (range) {
      headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    }
    const body =
      request.method === "HEAD" || size === 0
        ? null
        : (Readable.toWeb(createReadStream(location, { start, end })) as ReadableStream);
    return new Response(body, { status: range ? 206 : 200, headers });
  };
}
