import {
  type PlaybackState,
  type StoredAnimation,
  playbackStateSchema,
  storedAnimationSchema,
} from "@led-matrix/core";
import { z } from "zod";

async function request<S extends z.ZodType>(
  schema: S,
  method: string,
  url: string,
  body?: unknown,
): Promise<z.output<S>> {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${method} ${url} failed with ${response.status}`);
  }
  return schema.parse(await response.json());
}

export function getAnimations(): Promise<StoredAnimation[]> {
  return request(z.array(storedAnimationSchema), "GET", "/api/animations");
}

export function play(id: string): Promise<PlaybackState> {
  return request(playbackStateSchema, "POST", "/api/play", { id });
}

export function stop(): Promise<PlaybackState> {
  return request(playbackStateSchema, "POST", "/api/stop");
}

export function setBpm(bpm: number): Promise<PlaybackState> {
  return request(playbackStateSchema, "POST", "/api/bpm", { bpm });
}
