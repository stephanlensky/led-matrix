import type { DeviceState, PlaybackState, StoredAnimation } from "@led-matrix/core";
import { z } from "zod";
import type { ClockRequest, PlayRequest, TimelineRequest } from "./server.ts";

export const renderOptionsSchema = z.object({
  fps: z.number().positive().default(30),
  bpm: z.number().positive().default(120),
  devicePath: z.string().optional(),
});

export type RenderOptions = z.infer<typeof renderOptionsSchema>;

export type RenderRequest =
  | { type: "getState" }
  | { type: "play"; request: PlayRequest }
  | { type: "stop" }
  | { type: "pause" }
  | { type: "setTimeline"; request: TimelineRequest }
  | { type: "setClock"; request: ClockRequest };

export type RenderClip = {
  id: string;
  durations: readonly number[];
  frames: Uint8Array;
};

export type RenderMessage =
  | { type: "request"; id: number; request: RenderRequest }
  | { type: "setAnimations"; animations: StoredAnimation[] }
  | { type: "setClip"; id: string; durations: readonly number[]; frames: string }
  | { type: "removeClip"; id: string }
  | { type: "setBrightness"; brightness: number };

export type RenderDeviceState = DeviceState & { path: string | null };

export type RenderEvent =
  | { type: "response"; id: number; state: PlaybackState }
  | { type: "response"; id: number; error: string }
  | { type: "state"; state: PlaybackState }
  | { type: "device"; state: RenderDeviceState }
  | { type: "log"; message: string };
