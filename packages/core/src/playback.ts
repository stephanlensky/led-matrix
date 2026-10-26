import { z } from "zod";
import { deviceStatusSchema } from "./device-protocol.ts";

export const outputSchema = z.enum(["simulator", "device"]);

export const playbackStateSchema = z.object({
  animationId: z.string().nullable(),
  bpm: z.number(),
  fps: z.number(),
  beat: z.number().nullable(),
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

export type PlaybackState = z.infer<typeof playbackStateSchema>;

export type DeviceState = z.infer<typeof deviceStateSchema>;

export type StreamMessage = z.infer<typeof streamMessageSchema>;
