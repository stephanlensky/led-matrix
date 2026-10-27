import { z } from "zod";
import { deviceStatusSchema } from "./device-protocol.ts";

export const outputSchema = z.enum(["simulator", "device"]);

export const sectionStateSchema = z.object({
  index: z.int(),
  time: z.number(),
  next: z.object({ index: z.int(), delay: z.number() }).nullable(),
});

export const playbackStateSchema = z.object({
  animationId: z.string().nullable(),
  bpm: z.number(),
  fps: z.number(),
  beat: z.number().nullable(),
  section: sectionStateSchema.nullable(),
  paused: z.boolean(),
});

export const deviceStateSchema = z.object({
  enabled: z.boolean(),
  connected: z.boolean(),
  address: z.object({ address: z.string(), port: z.int() }).nullable(),
  status: deviceStatusSchema.nullable(),
  brightness: z.int().nullable(),
  latencyMs: z.number().nullable(),
});

export const streamMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("state"), state: playbackStateSchema }),
  z.object({ type: z.literal("device"), device: deviceStateSchema }),
]);

export type Output = z.infer<typeof outputSchema>;

export type SectionState = z.infer<typeof sectionStateSchema>;

export type PlaybackState = z.infer<typeof playbackStateSchema>;

export type DeviceState = z.infer<typeof deviceStateSchema>;

export type StreamMessage = z.infer<typeof streamMessageSchema>;
