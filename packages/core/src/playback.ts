import { z } from "zod";

export const playbackStateSchema = z.object({
  animationId: z.string().nullable(),
  bpm: z.number(),
  fps: z.number(),
});

export const streamMessageSchema = z.object({
  type: z.literal("state"),
  state: playbackStateSchema,
});

export type PlaybackState = z.infer<typeof playbackStateSchema>;

export type StreamMessage = z.infer<typeof streamMessageSchema>;
