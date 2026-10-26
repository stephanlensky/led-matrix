import {
  type Animation,
  type ClipImportOptions,
  type ClipInfo,
  type DeviceState,
  type Output,
  type PlaybackState,
  type StoredAnimation,
  clipInfoSchema,
  deviceStateSchema,
  playbackStateSchema,
  storedAnimationSchema,
} from "@led-matrix/core";
import { z } from "zod";

const errorResponseSchema = z.object({ error: z.string() });

async function getResponseError(method: string, url: string, response: Response): Promise<Error> {
  const body = errorResponseSchema.safeParse(await response.json().catch(() => undefined));
  return new Error(
    body.success ? body.data.error : `${method} ${url} failed with ${response.status}`,
  );
}

async function send(method: string, url: string, body?: unknown): Promise<Response> {
  const response = await fetch(url, {
    method,
    headers:
      body === undefined || body instanceof FormData ? {} : { "content-type": "application/json" },
    body: body === undefined || body instanceof FormData ? body : JSON.stringify(body),
  });
  if (!response.ok) {
    throw await getResponseError(method, url, response);
  }
  return response;
}

async function request<S extends z.ZodType>(
  schema: S,
  method: string,
  url: string,
  body?: unknown,
): Promise<z.output<S>> {
  const response = await send(method, url, body);
  return schema.parse(await response.json());
}

export function getAnimations(): Promise<StoredAnimation[]> {
  return request(z.array(storedAnimationSchema), "GET", "/api/animations");
}

export function play(output: Output, id: string): Promise<PlaybackState> {
  return request(playbackStateSchema, "POST", `/api/outputs/${output}/play`, { id });
}

export function stop(output: Output): Promise<PlaybackState> {
  return request(playbackStateSchema, "POST", `/api/outputs/${output}/stop`);
}

export function setBpm(output: Output, bpm: number): Promise<PlaybackState> {
  return request(playbackStateSchema, "POST", `/api/outputs/${output}/bpm`, { bpm });
}

export function setBrightness(brightness: number): Promise<DeviceState> {
  return request(deviceStateSchema, "PUT", "/api/device/brightness", { brightness });
}

export function createAnimation(animation: Animation): Promise<StoredAnimation> {
  return request(storedAnimationSchema, "POST", "/api/animations", animation);
}

export function updateAnimation(id: string, animation: Animation): Promise<StoredAnimation> {
  return request(storedAnimationSchema, "PUT", `/api/animations/${id}`, animation);
}

export async function deleteAnimation(id: string): Promise<void> {
  await send("DELETE", `/api/animations/${id}`);
}

export function getClips(): Promise<ClipInfo[]> {
  return request(z.array(clipInfoSchema), "GET", "/api/clips");
}

export function getClip(id: string): Promise<ClipInfo> {
  return request(clipInfoSchema, "GET", `/api/clips/${id}`);
}

export async function getClipFrames(id: string): Promise<Uint8Array> {
  const response = await send("GET", `/api/clips/${id}/frames`);
  return new Uint8Array(await response.arrayBuffer());
}

export function importClip(
  files: readonly File[],
  options: Partial<ClipImportOptions>,
): Promise<ClipInfo> {
  const form = new FormData();
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined && value !== "") {
      form.append(key, String(value));
    }
  }
  for (const file of files) {
    form.append("files", file);
  }
  return request(clipInfoSchema, "POST", "/api/clips", form);
}

export function renameClip(id: string, name: string): Promise<ClipInfo> {
  return request(clipInfoSchema, "PATCH", `/api/clips/${id}`, { name });
}

export async function deleteClip(id: string): Promise<void> {
  await send("DELETE", `/api/clips/${id}`);
}
