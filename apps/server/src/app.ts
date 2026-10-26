import { basename, extname } from "node:path";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import {
  HEIGHT,
  WIDTH,
  type StoredAnimation,
  type StreamMessage,
  animationIdSchema,
  animationSchema,
  clipIdSchema,
  clipImportOptionsSchema,
  clipInfoSchema,
  createRenderer,
  effects,
} from "@led-matrix/core";
import { nodeCanvas } from "@led-matrix/core/node-canvas";
import Fastify from "fastify";
import { z } from "zod";
import { createAnimationStore } from "./animations.ts";
import { createClipStore } from "./clips.ts";
import { getSlugId, openDatabase } from "./database.ts";
import { DecodeError, type UploadedFile, decodeClip } from "./decode.ts";
import { type DeviceLink, type DeviceLinkOptions, createDeviceLink } from "./device.ts";
import { createPlaybackEngine } from "./engine.ts";
import { seedAnimations } from "./seeds.ts";

const MAX_UPLOAD_BYTES = 256 * 1024 * 1024;
const MAX_UPLOAD_FILES = 2000;

export type AppOptions = {
  databasePath: string;
  logger?: boolean;
  fps?: number;
  bpm?: number;
  device?: Omit<DeviceLinkOptions, "engine" | "onError">;
};

const bpmSchema = z.number().min(20).max(300);
const playSchema = z.object({ id: animationIdSchema });
const setBpmSchema = z.object({ bpm: bpmSchema });
const setBrightnessSchema = z.object({ brightness: z.int().min(0).max(255) });
const createAnimationSchema = animationSchema.extend({ id: animationIdSchema.optional() });
const idParamsSchema = z.object({ id: z.string() });
const updateClipSchema = clipInfoSchema.pick({ name: true });

function getValidationError(message: string, error: z.ZodError) {
  return { error: message, issues: error.issues };
}

function getClipUsers(animations: readonly StoredAnimation[], clipId: string): string[] {
  return animations
    .filter(({ layers }) =>
      layers.some(({ effect, params }) => effect === "clip" && params["clip"] === clipId),
    )
    .map(({ id }) => id);
}

function getFileName(name: string): string {
  return basename(name, extname(name)) || "Clip";
}

export function createApp({
  databasePath,
  logger = true,
  fps = 30,
  bpm = 120,
  device: deviceOptions,
}: AppOptions) {
  const app = Fastify({ logger });
  const database = openDatabase(databasePath);
  const store = createAnimationStore(database.connection);
  const clips = createClipStore(database.connection);
  const engine = createPlaybackEngine({
    renderer: createRenderer({ fps, canvas: nodeCanvas, clips: clips.library }),
    fps,
    bpm,
    onError: (error) => app.log.error(error, "Failed to render animation"),
  });

  if (database.isCreated) {
    for (const [id, animation] of Object.entries(seedAnimations)) {
      store.set(id, animationSchema.parse(animation));
    }
  }

  let device: DeviceLink | undefined;

  app.addHook("onReady", async () => {
    if (deviceOptions) {
      device = await createDeviceLink({
        ...deviceOptions,
        engine,
        onError: (error) => app.log.error(error, "Device link error"),
      });
      app.log.info(`Device link listening on UDP port ${device.getPort()}`);
    }
    engine.start();
  });
  app.addHook("onClose", () => {
    device?.close();
    engine.close();
    database.connection.close();
  });

  app.register(websocket);
  app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: MAX_UPLOAD_FILES } });

  app.get("/api/health", () => ({ status: "ok", width: WIDTH, height: HEIGHT }));

  app.get("/api/effects", () =>
    effects.map((effect) => ({
      id: effect.id,
      name: effect.name,
      kind: effect.kind,
      params: z.toJSONSchema(effect.params, { io: "input" }),
    })),
  );

  app.get("/api/animations", () => store.list());

  app.get("/api/animations/:id", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const animation = animationIdSchema.safeParse(id).success ? store.get(id) : undefined;
    return animation ?? reply.code(404).send({ error: "Animation not found" });
  });

  app.post("/api/animations", async (request, reply) => {
    const result = createAnimationSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send(getValidationError("Invalid animation", result.error));
    }
    const { id: requestedId, ...animation } = result.data;
    if (requestedId && store.has(requestedId)) {
      return reply.code(409).send({ error: "Animation already exists" });
    }
    const existingIds = new Set(store.list().map((stored) => stored.id));
    const id = requestedId ?? getSlugId(animation.name, existingIds, "animation");
    return reply.code(201).send(store.set(id, animation));
  });

  app.put("/api/animations/:id", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    if (!animationIdSchema.safeParse(id).success || !store.has(id)) {
      return reply.code(404).send({ error: "Animation not found" });
    }
    const result = animationSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send(getValidationError("Invalid animation", result.error));
    }
    const stored = store.set(id, result.data);
    engine.updateAnimation(id, result.data);
    return stored;
  });

  app.delete("/api/animations/:id", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    if (!animationIdSchema.safeParse(id).success || !store.delete(id)) {
      return reply.code(404).send({ error: "Animation not found" });
    }
    if (engine.getState().animationId === id) {
      engine.stop();
    }
    return reply.code(204).send();
  });

  app.get("/api/clips", () => clips.list());

  app.get("/api/clips/:id", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const clip = clipIdSchema.safeParse(id).success ? clips.get(id) : undefined;
    return clip ?? reply.code(404).send({ error: "Clip not found" });
  });

  app.get("/api/clips/:id/frames", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const frames = clipIdSchema.safeParse(id).success ? clips.getFrames(id) : undefined;
    if (!frames) {
      return reply.code(404).send({ error: "Clip not found" });
    }
    return reply
      .type("application/octet-stream")
      .send(Buffer.from(frames.buffer, frames.byteOffset, frames.byteLength));
  });

  app.post("/api/clips", async (request, reply) => {
    if (!request.isMultipart()) {
      return reply.code(415).send({ error: "Expected multipart form data" });
    }
    const files: UploadedFile[] = [];
    const fields: Record<string, unknown> = {};
    for await (const part of request.parts()) {
      if (part.type === "file") {
        files.push({ name: part.filename, mimetype: part.mimetype, data: await part.toBuffer() });
      } else {
        fields[part.fieldname] = part.value;
      }
    }
    const options = clipImportOptionsSchema.safeParse(fields);
    if (!options.success) {
      return reply.code(400).send(getValidationError("Invalid import options", options.error));
    }
    try {
      const decoded = await decodeClip(files, options.data);
      const name = options.data.name ?? getFileName(files[0]?.name ?? "");
      const existingIds = new Set(clips.list().map((clip) => clip.id));
      const id = getSlugId(name, existingIds, "clip");
      const { frames, ...info } = decoded;
      return reply.code(201).send(clips.create({ id, name, ...info }, frames));
    } catch (error) {
      if (error instanceof DecodeError) {
        return reply.code(400).send({ error: error.message });
      }
      throw error;
    }
  });

  app.patch("/api/clips/:id", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    if (!clipIdSchema.safeParse(id).success || !clips.get(id)) {
      return reply.code(404).send({ error: "Clip not found" });
    }
    const result = updateClipSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send(getValidationError("Invalid clip", result.error));
    }
    return clips.rename(id, result.data.name);
  });

  app.delete("/api/clips/:id", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    if (!clipIdSchema.safeParse(id).success || !clips.get(id)) {
      return reply.code(404).send({ error: "Clip not found" });
    }
    const users = getClipUsers(store.list(), id);
    if (users.length > 0) {
      return reply
        .code(409)
        .send({ error: `Clip is used by animations: ${users.join(", ")}`, animations: users });
    }
    clips.delete(id);
    return reply.code(204).send();
  });

  app.get("/api/playback", () => engine.getState());

  app.post("/api/play", async (request, reply) => {
    const result = playSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send(getValidationError("Invalid play request", result.error));
    }
    const animation = store.get(result.data.id);
    if (!animation) {
      return reply.code(404).send({ error: "Animation not found" });
    }
    const { id, ...rest } = animation;
    engine.play(id, rest);
    return engine.getState();
  });

  app.post("/api/stop", () => {
    engine.stop();
    return engine.getState();
  });

  app.post("/api/bpm", async (request, reply) => {
    const result = setBpmSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send(getValidationError("Invalid bpm", result.error));
    }
    engine.setBpm(result.data.bpm);
    return engine.getState();
  });

  app.get("/api/device", async (_request, reply) =>
    device ? device.getState() : reply.code(503).send({ error: "Device link is disabled" }),
  );

  app.put("/api/device/brightness", async (request, reply) => {
    if (!device) {
      return reply.code(503).send({ error: "Device link is disabled" });
    }
    const result = setBrightnessSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send(getValidationError("Invalid brightness", result.error));
    }
    device.setBrightness(result.data.brightness);
    return device.getState();
  });

  app.register(async (scope) => {
    scope.get("/api/stream", { websocket: true }, (socket) => {
      const sendState = (state: StreamMessage["state"]) =>
        socket.send(JSON.stringify({ type: "state", state } satisfies StreamMessage));
      const unsubscribe = engine.subscribe({
        setFrame: (frame) => {
          if (socket.bufferedAmount < frame.length * 4) {
            socket.send(frame);
          }
        },
        setState: sendState,
      });
      sendState(engine.getState());
      socket.on("close", unsubscribe);
    });
  });

  return app;
}
