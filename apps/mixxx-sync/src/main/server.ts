import {
  type ClipInfo,
  type Output,
  type PlaybackState,
  type ParameterSelection,
  type StoredAnimation,
  type TimelineCue,
  clipInfoSchema,
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
  params?: ParameterSelection | undefined;
  beats?: number;
};

export type ClockRequest = {
  beat: number;
  bpm: number;
  paused: boolean;
};

export type TimelineRequest = ClockRequest & {
  id: string;
  cues: readonly TimelineCue[];
  keepCurrent: boolean;
};

export type ServerClient = {
  getState(): Promise<PlaybackState>;
  getAnimations(): Promise<StoredAnimation[]>;
  play(request: PlayRequest): Promise<PlaybackState>;
  stop(): Promise<PlaybackState>;
  pause(): Promise<PlaybackState>;
  setTimeline(request: TimelineRequest): Promise<PlaybackState>;
  setClock(request: ClockRequest): Promise<PlaybackState>;
};

export type ContentSource = {
  getAnimations(): Promise<StoredAnimation[]>;
  getClips(): Promise<ClipInfo[]>;
  getClipFrames(id: string): Promise<Uint8Array>;
};

const REQUEST_TIMEOUT = 2000;
const CLIP_FRAMES_TIMEOUT = 30_000;

async function send(
  baseUrl: string,
  path: string,
  body?: unknown,
  timeout = REQUEST_TIMEOUT,
): Promise<Response> {
  const url = new URL(path, baseUrl);
  let response: Response;
  try {
    response = await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });
  } catch (error) {
    throw new Error(`${url.href}: ${getFetchErrorMessage(error)}`, { cause: error });
  }
  if (!response.ok) {
    throw new ServerError(response.status, `${path}: ${response.status} ${await response.text()}`);
  }
  return response;
}

async function request<T>(
  baseUrl: string,
  schema: z.ZodType<T>,
  path: string,
  body?: unknown,
): Promise<T> {
  return schema.parse(await (await send(baseUrl, path, body)).json());
}

function getAnimations(baseUrl: string): Promise<StoredAnimation[]> {
  return request(baseUrl, storedAnimationSchema.array(), "/api/animations");
}

export function createServerContent(baseUrl: string): ContentSource {
  return {
    getAnimations: () => getAnimations(baseUrl),
    getClips: () => request(baseUrl, clipInfoSchema.array(), "/api/clips"),
    async getClipFrames(id) {
      const response = await send(
        baseUrl,
        `/api/clips/${encodeURIComponent(id)}/frames`,
        undefined,
        CLIP_FRAMES_TIMEOUT,
      );
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}

export function createServerClient(baseUrl: string, output: Output): ServerClient {
  const outputPath = `/api/outputs/${output}`;
  const requestState = (path: string, body?: unknown) =>
    request(baseUrl, playbackStateSchema, path, body);
  return {
    getState: () => requestState(outputPath),
    getAnimations: () => getAnimations(baseUrl),
    play: (body) => requestState(`${outputPath}/play`, body),
    stop: () => requestState(`${outputPath}/stop`, {}),
    pause: () => requestState(`${outputPath}/pause`, {}),
    setTimeline: (body) => requestState(`${outputPath}/timeline`, body),
    setClock: (body) => requestState(`${outputPath}/clock`, body),
  };
}
