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

export type ApiClient = ReturnType<typeof createApiClient>;

export function createApiClient(baseUrl: string) {
  return {
    getAnimations(): Promise<StoredAnimation[]> {
      return request(z.array(storedAnimationSchema), "GET", `${baseUrl}/api/animations`);
    },

    play(output: Output, id: string, preset?: string): Promise<PlaybackState> {
      return request(playbackStateSchema, "POST", `${baseUrl}/api/outputs/${output}/play`, {
        id,
        preset,
      });
    },

    setPreset(output: Output, preset: string): Promise<PlaybackState> {
      return request(playbackStateSchema, "POST", `${baseUrl}/api/outputs/${output}/preset`, {
        preset,
      });
    },

    seek(output: Output, section: number, progress: number): Promise<PlaybackState> {
      return request(playbackStateSchema, "POST", `${baseUrl}/api/outputs/${output}/seek`, {
        section,
        progress,
      });
    },

    pause(output: Output): Promise<PlaybackState> {
      return request(playbackStateSchema, "POST", `${baseUrl}/api/outputs/${output}/pause`);
    },

    resume(output: Output): Promise<PlaybackState> {
      return request(playbackStateSchema, "POST", `${baseUrl}/api/outputs/${output}/resume`);
    },

    advance(output: Output): Promise<PlaybackState> {
      return request(playbackStateSchema, "POST", `${baseUrl}/api/outputs/${output}/advance`, {});
    },

    stop(output: Output): Promise<PlaybackState> {
      return request(playbackStateSchema, "POST", `${baseUrl}/api/outputs/${output}/stop`);
    },

    setBpm(output: Output, bpm: number): Promise<PlaybackState> {
      return request(playbackStateSchema, "POST", `${baseUrl}/api/outputs/${output}/bpm`, { bpm });
    },

    setBrightness(brightness: number): Promise<DeviceState> {
      return request(deviceStateSchema, "PUT", `${baseUrl}/api/device/brightness`, { brightness });
    },

    createAnimation(animation: Animation): Promise<StoredAnimation> {
      return request(storedAnimationSchema, "POST", `${baseUrl}/api/animations`, animation);
    },

    updateAnimation(id: string, animation: Animation): Promise<StoredAnimation> {
      return request(storedAnimationSchema, "PUT", `${baseUrl}/api/animations/${id}`, animation);
    },

    async deleteAnimation(id: string): Promise<void> {
      await send("DELETE", `${baseUrl}/api/animations/${id}`);
    },

    getClips(): Promise<ClipInfo[]> {
      return request(z.array(clipInfoSchema), "GET", `${baseUrl}/api/clips`);
    },

    getClip(id: string): Promise<ClipInfo> {
      return request(clipInfoSchema, "GET", `${baseUrl}/api/clips/${id}`);
    },

    async getClipFrames(id: string): Promise<Uint8Array> {
      const response = await send("GET", `${baseUrl}/api/clips/${id}/frames`);
      return new Uint8Array(await response.arrayBuffer());
    },

    importClip(files: readonly File[], options: Partial<ClipImportOptions>): Promise<ClipInfo> {
      const form = new FormData();
      for (const [key, value] of Object.entries(options)) {
        if (value !== undefined && value !== "") {
          form.append(key, String(value));
        }
      }
      for (const file of files) {
        form.append("files", file);
      }
      return request(clipInfoSchema, "POST", `${baseUrl}/api/clips`, form);
    },

    renameClip(id: string, name: string): Promise<ClipInfo> {
      return request(clipInfoSchema, "PATCH", `${baseUrl}/api/clips/${id}`, { name });
    },

    async deleteClip(id: string): Promise<void> {
      await send("DELETE", `${baseUrl}/api/clips/${id}`);
    },
  };
}
