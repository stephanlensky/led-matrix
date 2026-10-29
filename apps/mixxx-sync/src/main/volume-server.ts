import { type IncomingMessage, type ServerResponse, createServer } from "node:http";
import { z } from "zod";
import { getGainParameter, getGainValue } from "./gain.ts";
import { volumePage } from "./volume-page.ts";

const MAX_BODY_SIZE = 1024;

export const volumeRequestSchema = z.object({ parameter: z.number().min(0).max(1) });

export type Volume = {
  parameter: number | null;
  value: number | null;
  connected: boolean;
};

export type VolumeServerOptions = {
  getMainGain: () => number | undefined;
  isConnected: () => boolean;
  setMainGain: (parameter: number) => boolean;
};

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

async function getBody(request: IncomingMessage): Promise<string | undefined> {
  let body = "";
  for await (const chunk of request.setEncoding("utf8")) {
    body += chunk;
    if (body.length > MAX_BODY_SIZE) {
      return undefined;
    }
  }
  return body;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function createVolumeServer({ getMainGain, isConnected, setMainGain }: VolumeServerOptions) {
  function getVolume(): Volume {
    const value = getMainGain() ?? null;
    return {
      parameter: value === null ? null : getGainParameter(value),
      value,
      connected: isConnected(),
    };
  }

  async function postVolume(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const body = await getBody(request);
    const result = volumeRequestSchema.safeParse(body === undefined ? undefined : parseJson(body));
    if (!result.success) {
      sendJson(response, 400, { error: z.prettifyError(result.error) });
      return;
    }
    const { parameter } = result.data;
    if (!isConnected() || !setMainGain(parameter)) {
      sendJson(response, 503, { error: "Mixxx is not connected" });
      return;
    }
    sendJson(response, 200, { parameter, value: getGainValue(parameter), connected: true });
  }

  return createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (path === "/" && request.method === "GET") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(volumePage);
    } else if (path === "/api/volume" && request.method === "GET") {
      sendJson(response, 200, getVolume());
    } else if (path === "/api/volume" && request.method === "POST") {
      postVolume(request, response).catch(() => sendJson(response, 400, { error: "Bad request" }));
    } else if (path === "/" || path === "/api/volume") {
      sendJson(response, 405, { error: "Method not allowed" });
    } else {
      sendJson(response, 404, { error: "Not found" });
    }
  });
}
