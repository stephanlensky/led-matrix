export type PlaybackState = {
  animationId: string | null;
  bpm: number;
  fps: number;
};

export type StreamMessage = { type: "state"; state: PlaybackState };
