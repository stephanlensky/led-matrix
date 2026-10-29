import { basename, extname } from "node:path";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import {
  HEIGHT,
  WIDTH,
  type Animation,
  type DeviceState,
  type Frame,
  type Output,
  type PlaybackState,
  type StoredAnimation,
  type StreamMessage,
  animationIdSchema,
  animationObjectSchema,
  getParameterSelectionError,
  parameterSelectionSchema,
  animationSchema,
  clipIdSchema,
  clipImportOptionsSchema,
  clipInfoSchema,
  createFrameCache,
  createRenderer,
  disabledDeviceState,
  effects,
  getSectionedAnimation,
  outputSchema,
  timelineCueSchema,
  timelineIdSchema,
  type PlaybackEngine,
  createPlaybackEngine,
} from "@led-matrix/core";
import { nodeCanvas } from "@led-matrix/core/node-canvas";
import Fastify from "fastify";
import { z } from "zod";
import { createAnimationStore } from "./animations.ts";
import { createClipStore } from "./clips.ts";
import { getSlugId, openDatabase } from "./database.ts";
import { DecodeError, type UploadedFile, decodeClipInWorker } from "./decode.ts";
import { type UdpDeviceLink, type UdpDeviceLinkOptions, createUdpDeviceLink } from "./device.ts";
import { seedAnimations } from "./seeds.ts";

const MAX_UPLOAD_BYTES = 256 * 1024 * 1024;
const MAX_UPLOAD_FILES = 2000;

export type AppOptions = {
  databasePath: string;
  logger?: boolean;
  fps?: number;
  bpm?: number;
  device?: Omit<UdpDeviceLinkOptions, "engine" | "onError">;
  webRoot?: string;
};

const bpmSchema = z.number().positive();
const beatSchema = z.number().min(0);
const sectionIndexSchema = z.int().min(0);
const playSchema = z.object({
  id: animationIdSchema,
  beat: beatSchema.optional(),
  bpm: bpmSchema.optional(),
  section: sectionIndexSchema.optional(),
  beats: z.number().positive().optional(),
  params: parameterSelectionSchema.optional(),
});
const seekSchema = z.object({ section: sectionIndexSchema, progress: z.number().min(0).max(1) });
const advanceSchema = z.object({ at: z.enum(["end", "now"]).optional() }).default({});
const setBpmSchema = z.object({ bpm: bpmSchema });
const setBeatSchema = z.object({ beat: beatSchema });
const clockSchema = z.object({
  beat: z.number(),
  bpm: bpmSchema.optional(),
  paused: z.boolean().optional(),
});
const timelineSchema = clockSchema.extend({
  id: timelineIdSchema,
  cues: z.array(timelineCueSchema).max(10_000),
  keepCurrent: z.boolean().optional(),
});
const setParamsSchema = z.object({ params: parameterSelectionSchema });
const setBrightnessSchema = z.object({ brightness: z.int().min(0).max(255) });
const createAnimationSchema = z.preprocess(
  getSectionedAnimation,
  animationObjectSchema.safeExtend({ id: animationIdSchema.optional() }),
);
const idParamsSchema = z.object({ id: z.string() });
const outputParamsSchema = z.object({ output: outputSchema });
const updateClipSchema = clipInfoSchema.pick({ name: true });

function getValidationError(message: string, error: z.ZodError) {
  return { error: message, issues: error.issues };
}

function getClipUsers(animations: readonly StoredAnimation[], clipId: string): string[] {
  return animations
    .filter(({ sections }) =>
      sections.some(({ layers }) =>
        layers.some(({ effect, params }) => effect === "clip" && params["clip"] === clipId),
      ),
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
  webRoot,
}: AppOptions) {
  const app = Fastify({ logger });
  const database = openDatabase(databasePath);
  const store = createAnimationStore(database);
  const clips = createClipStore(database);
  const frameCache = createFrameCache();
  const engines: Readonly<Record<Output, PlaybackEngine>> = {
    simulator: createEngine("simulator"),
    device: createEngine("device", () => device?.getLatency() ?? 0),
  };

  function createEngine(output: Output, getLatency?: () => number): PlaybackEngine {
    return createPlaybackEngine({
      renderer: createRenderer({
        fps,
        canvas: nodeCanvas,
        clips: clips.library,
        cache: frameCache,
      }),
      fps,
      bpm,
      getLatency,
      onError: (error) => app.log.error(error, `Failed to render animation on ${output}`),
    });
  }

  function getEngine(params: unknown): PlaybackEngine | undefined {
    const result = outputParamsSchema.safeParse(params);
    return result.success ? engines[result.data.output] : undefined;
  }

  for (const [id, animation] of Object.entries(seedAnimations)) {
    store.set(id, animationSchema.parse(animation));
  }

  let device: UdpDeviceLink | undefined;

  app.addHook("onReady", async () => {
    if (deviceOptions) {
      device = await createUdpDeviceLink({
        ...deviceOptions,
        engine: engines.device,
        onError: (error) => app.log.error(error, "Device link error"),
      });
      app.log.info(`Device link listening on UDP port ${device.getPort()}`);
    }
    for (const engine of Object.values(engines)) {
      engine.start();
    }
  });
  app.addHook("onClose", () => {
    device?.close();
    for (const engine of Object.values(engines)) {
      engine.close();
    }
    database.close();
  });

  app.register(cors, { origin: true, methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"] });
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
    for (const engine of Object.values(engines)) {
      engine.updateAnimation(id, result.data);
    }
    return stored;
  });

  app.delete("/api/animations/:id", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    if (!animationIdSchema.safeParse(id).success || !store.delete(id)) {
      return reply.code(404).send({ error: "Animation not found" });
    }
    for (const engine of Object.values(engines)) {
      engine.removeAnimation(id);
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
    const frames = clipIdSchema.safeParse(id).success ? clips.getEncodedFrames(id) : undefined;
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
      const decoded = await decodeClipInWorker(files, options.data);
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

  app.get("/api/outputs/:output", async (request, reply) => {
    const engine = getEngine(request.params);
    return engine ? engine.getState() : reply.code(404).send({ error: "Output not found" });
  });

  app.post("/api/outputs/:output/play", async (request, reply) => {
    const engine = getEngine(request.params);
    if (!engine) {
      return reply.code(404).send({ error: "Output not found" });
    }
    const result = playSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send(getValidationError("Invalid play request", result.error));
    }
    const animation = store.get(result.data.id);
    if (!animation) {
      return reply.code(404).send({ error: "Animation not found" });
    }
    const { id, ...rest } = animation;
    const { bpm: requestedBpm, beat, section, beats, params } = result.data;
    if (section !== undefined && section >= rest.sections.length) {
      return reply.code(400).send({ error: "Section not found" });
    }
    const paramsError = params && getParameterSelectionError(rest, params);
    if (paramsError) {
      return reply.code(400).send({ error: paramsError });
    }
    if (requestedBpm !== undefined) {
      engine.setBpm(requestedBpm);
    }
    engine.play(id, rest, { beat, section, beats, params });
    return engine.getState();
  });

  app.post("/api/outputs/:output/params", async (request, reply) => {
    const engine = getEngine(request.params);
    if (!engine) {
      return reply.code(404).send({ error: "Output not found" });
    }
    if (engine.hasTimeline()) {
      return reply.code(409).send({ error: "A timeline is playing" });
    }
    const result = setParamsSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send(getValidationError("Invalid params", result.error));
    }
    const { animationId } = engine.getState();
    const animation = animationId === null ? undefined : store.get(animationId);
    if (!animation) {
      return reply.code(409).send({ error: "Nothing is playing" });
    }
    const paramsError = getParameterSelectionError(animation, result.data.params);
    if (paramsError) {
      return reply.code(400).send({ error: paramsError });
    }
    engine.setParams(result.data.params);
    return engine.getState();
  });

  app.post("/api/outputs/:output/seek", async (request, reply) => {
    const engine = getEngine(request.params);
    if (!engine) {
      return reply.code(404).send({ error: "Output not found" });
    }
    if (engine.hasTimeline()) {
      return reply.code(409).send({ error: "A timeline is playing" });
    }
    const result = seekSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send(getValidationError("Invalid seek", result.error));
    }
    const animationId = engine.getState().animationId;
    if (animationId === null) {
      return reply.code(409).send({ error: "Nothing is playing" });
    }
    if (result.data.section >= (store.get(animationId)?.sections.length ?? 0)) {
      return reply.code(400).send({ error: "Section not found" });
    }
    engine.seek(result.data.section, result.data.progress);
    return engine.getState();
  });

  for (const action of ["pause", "resume"] as const) {
    app.post(`/api/outputs/:output/${action}`, async (request, reply) => {
      const engine = getEngine(request.params);
      if (!engine) {
        return reply.code(404).send({ error: "Output not found" });
      }
      if (!engine.isLoaded()) {
        return reply.code(409).send({ error: "Nothing is playing" });
      }
      engine[action]();
      return engine.getState();
    });
  }

  app.post("/api/outputs/:output/advance", async (request, reply) => {
    const engine = getEngine(request.params);
    if (!engine) {
      return reply.code(404).send({ error: "Output not found" });
    }
    if (engine.hasTimeline()) {
      return reply.code(409).send({ error: "A timeline is playing" });
    }
    const result = advanceSchema.safeParse(request.body ?? {});
    if (!result.success) {
      return reply.code(400).send(getValidationError("Invalid advance", result.error));
    }
    if (!engine.advance(result.data.at)) {
      return reply.code(409).send({ error: "No next section" });
    }
    return engine.getState();
  });

  app.post("/api/outputs/:output/beat", async (request, reply) => {
    const engine = getEngine(request.params);
    if (!engine) {
      return reply.code(404).send({ error: "Output not found" });
    }
    const result = setBeatSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send(getValidationError("Invalid beat", result.error));
    }
    if (!engine.isLoaded()) {
      return reply.code(409).send({ error: "Nothing is playing" });
    }
    engine.setBeat(result.data.beat);
    return engine.getState();
  });

  app.post("/api/outputs/:output/timeline", async (request, reply) => {
    const engine = getEngine(request.params);
    if (!engine) {
      return reply.code(404).send({ error: "Output not found" });
    }
    const result = timelineSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send(getValidationError("Invalid timeline", result.error));
    }
    const documents = new Map<string, Animation>();
    for (const cue of result.data.cues) {
      if (cue.animationId === null) {
        continue;
      }
      const animation = store.get(cue.animationId);
      if (!animation) {
        return reply.code(404).send({ error: `Animation "${cue.animationId}" not found` });
      }
      if (cue.section >= animation.sections.length) {
        return reply
          .code(400)
          .send({ error: `Section ${cue.section} not found in "${cue.animationId}"` });
      }
      const paramsError = cue.params && getParameterSelectionError(animation, cue.params);
      if (paramsError) {
        return reply.code(400).send({ error: `${paramsError} in "${cue.animationId}"` });
      }
      const { id, ...document } = animation;
      documents.set(id, document);
    }
    engine.loadTimeline(result.data, documents);
    return engine.getState();
  });

  app.post("/api/outputs/:output/clock", async (request, reply) => {
    const engine = getEngine(request.params);
    if (!engine) {
      return reply.code(404).send({ error: "Output not found" });
    }
    const result = clockSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send(getValidationError("Invalid clock", result.error));
    }
    if (!engine.isLoaded()) {
      return reply.code(409).send({ error: "Nothing is playing" });
    }
    engine.setClock(result.data);
    return engine.getState();
  });

  app.post("/api/outputs/:output/stop", async (request, reply) => {
    const engine = getEngine(request.params);
    if (!engine) {
      return reply.code(404).send({ error: "Output not found" });
    }
    engine.stop();
    return engine.getState();
  });

  app.post("/api/outputs/:output/bpm", async (request, reply) => {
    const engine = getEngine(request.params);
    if (!engine) {
      return reply.code(404).send({ error: "Output not found" });
    }
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
    scope.get("/api/stream/:output", { websocket: true }, (socket, request) => {
      const result = outputParamsSchema.safeParse(request.params);
      if (!result.success) {
        socket.close(4404, "Output not found");
        return;
      }
      const { output } = result.data;
      const engine = engines[output];
      const sendMessage = (message: StreamMessage) => socket.send(JSON.stringify(message));
      const sendState = (state: PlaybackState) => sendMessage({ type: "state", state });
      const sendDevice = (state: DeviceState) => sendMessage({ type: "device", device: state });
      const sendFrame = (frame: Frame) => {
        if (socket.readyState === socket.OPEN && socket.bufferedAmount < frame.length * 4) {
          socket.send(frame);
        }
      };
      const getLatency = () => (output === "device" ? (device?.getLatency() ?? 0) : 0);
      const unsubscribers = [
        engine.subscribe({
          setFrame: (frame) => {
            const latency = getLatency();
            if (latency > 0) {
              setTimeout(() => sendFrame(frame), latency);
            } else {
              sendFrame(frame);
            }
          },
          setState: sendState,
        }),
      ];
      sendState(engine.getState());
      if (output === "device") {
        sendDevice(device?.getState() ?? disabledDeviceState);
        if (device) {
          unsubscribers.push(device.subscribe(sendDevice));
        }
      }
      socket.on("close", () => {
        for (const unsubscribe of unsubscribers) {
          unsubscribe();
        }
      });
    });
  });

  if (webRoot) {
    app.register(fastifyStatic, { root: webRoot, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.method !== "GET" || request.url.startsWith("/api/")) {
        return reply.code(404).send({ error: "Not found" });
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}
