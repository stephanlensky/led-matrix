import websocket from "@fastify/websocket";
import {
  HEIGHT,
  WIDTH,
  animationSchema,
  createRenderer,
  effects,
  type StreamMessage,
} from "@led-matrix/core";
import { nodeCanvas } from "@led-matrix/core/node-canvas";
import Fastify from "fastify";
import { z } from "zod";
import { createPlaybackEngine } from "./engine.ts";
import { seedAnimations } from "./seeds.ts";
import { animationIdSchema, createAnimationStore, getAnimationId } from "./storage.ts";

export type AppOptions = {
  dataDir: string;
  logger?: boolean;
  fps?: number;
  bpm?: number;
};

const bpmSchema = z.number().min(20).max(300);
const playSchema = z.object({ id: animationIdSchema });
const setBpmSchema = z.object({ bpm: bpmSchema });
const createAnimationSchema = animationSchema.extend({ id: animationIdSchema.optional() });
const idParamsSchema = z.object({ id: z.string() });

function getValidationError(message: string, error: z.ZodError) {
  return { error: message, issues: error.issues };
}

export function createApp({ dataDir, logger = true, fps = 30, bpm = 120 }: AppOptions) {
  const app = Fastify({ logger });
  const store = createAnimationStore(dataDir);
  const engine = createPlaybackEngine({
    renderer: createRenderer({ fps, canvas: nodeCanvas }),
    fps,
    bpm,
    onError: (error) => app.log.error(error, "Failed to render animation"),
  });

  app.addHook("onReady", async () => {
    if (await store.init()) {
      await Promise.all(
        Object.entries(seedAnimations).map(async ([id, animation]) =>
          store.set(id, animationSchema.parse(animation)),
        ),
      );
    }
    engine.start();
  });
  app.addHook("onClose", () => engine.close());

  app.register(websocket);

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
    const animation = animationIdSchema.safeParse(id).success ? await store.get(id) : undefined;
    return animation ?? reply.code(404).send({ error: "Animation not found" });
  });

  app.post("/api/animations", async (request, reply) => {
    const result = createAnimationSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send(getValidationError("Invalid animation", result.error));
    }
    const { id: requestedId, ...animation } = result.data;
    if (requestedId && (await store.has(requestedId))) {
      return reply.code(409).send({ error: "Animation already exists" });
    }
    const existingIds = new Set((await store.list()).map((stored) => stored.id));
    const id = requestedId ?? getAnimationId(animation.name, existingIds);
    return reply.code(201).send(await store.set(id, animation));
  });

  app.put("/api/animations/:id", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    if (!animationIdSchema.safeParse(id).success || !(await store.has(id))) {
      return reply.code(404).send({ error: "Animation not found" });
    }
    const result = animationSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send(getValidationError("Invalid animation", result.error));
    }
    const stored = await store.set(id, result.data);
    engine.updateAnimation(id, result.data);
    return stored;
  });

  app.delete("/api/animations/:id", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    if (!animationIdSchema.safeParse(id).success || !(await store.delete(id))) {
      return reply.code(404).send({ error: "Animation not found" });
    }
    if (engine.getState().animationId === id) {
      engine.stop();
    }
    return reply.code(204).send();
  });

  app.get("/api/playback", () => engine.getState());

  app.post("/api/play", async (request, reply) => {
    const result = playSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send(getValidationError("Invalid play request", result.error));
    }
    const animation = await store.get(result.data.id);
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
