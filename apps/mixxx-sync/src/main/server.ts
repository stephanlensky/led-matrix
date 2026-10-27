import {
  type Output,
  type PlaybackState,
  type StoredAnimation,
  playbackStateSchema,
  storedAnimationSchema,
} from "@led-matrix/core";
import type { z } from "zod";

export class ServerError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ServerError";
    this.status = status;
  }
}

function getFetchErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const { cause } = error;
  if (cause instanceof AggregateError) {
    return [...new Set(cause.errors.map((inner: unknown) => getFetchErrorMessage(inner)))].join(
      ", ",
    );
  }
  return cause instanceof Error ? getFetchErrorMessage(cause) : error.message;
}

export type PlayRequest = {
  id: string;
  section: number;
  beat: number;
  bpm: number;
  preset?: string | undefined;
  beats?: number;
};

export type ServerClient = {
  getState(): Promise<PlaybackState>;
  getAnimations(): Promise<StoredAnimation[]>;
  play(request: PlayRequest): Promise<PlaybackState>;
  stop(): Promise<PlaybackState>;
  setBeat(beat: number): Promise<PlaybackState>;
  setBpm(bpm: number): Promise<PlaybackState>;
};

export function createServerClient(baseUrl: string, output: Output): ServerClient {
  async function request<T>(schema: z.ZodType<T>, path: string, body?: unknown): Promise<T> {
    const url = new URL(path, baseUrl);
    let response: Response;
    try {
      response = await fetch(url, {
        method: body === undefined ? "GET" : "POST",
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(2000),
      });
    } catch (error) {
      throw new Error(`${url.href}: ${getFetchErrorMessage(error)}`, { cause: error });
    }
    if (!response.ok) {
      throw new ServerError(
        response.status,
        `${path}: ${response.status} ${await response.text()}`,
      );
    }
    return schema.parse(await response.json());
  }

  const outputPath = `/api/outputs/${output}`;
  return {
    getState: () => request(playbackStateSchema, outputPath),
    getAnimations: () => request(storedAnimationSchema.array(), "/api/animations"),
    play: (body) => request(playbackStateSchema, `${outputPath}/play`, body),
    stop: () => request(playbackStateSchema, `${outputPath}/stop`, {}),
    setBeat: (beat) => request(playbackStateSchema, `${outputPath}/beat`, { beat }),
    setBpm: (bpm) => request(playbackStateSchema, `${outputPath}/bpm`, { bpm }),
  };
}
