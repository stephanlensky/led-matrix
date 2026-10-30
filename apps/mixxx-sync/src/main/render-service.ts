import {
  type Animation,
  type Frame,
  type Clip,
  type ClipLibrary,
  type ParameterSelection,
  type PlaybackEngine,
  type PlaybackState,
  type StoredAnimation,
  createClip,
  getParameterSelectionError,
} from "@led-matrix/core";
import type { RenderClip, RenderEvent, RenderMessage, RenderRequest } from "./render-protocol.ts";
import type { TimelineRequest } from "./server.ts";

type AnimationEntry = { animation: Animation; json: string };

export type ClipStore = ReturnType<typeof createClipStore>;

export function createClipStore() {
  const clips = new Map<string, Clip>();
  const library: ClipLibrary = { getClip: (id) => clips.get(id) };
  return {
    library,
    set({ id, durations, frames }: RenderClip): void {
      clips.set(id, createClip(frames, durations));
    },
    delete(id: string): void {
      clips.delete(id);
    },
  };
}

export type RenderServiceOptions = {
  engine: PlaybackEngine;
  clips: ClipStore;
  setBrightness: (brightness: number) => void;
  setRecording?: (directory: string | null) => void;
  getLatency?: () => number;
  send: (event: RenderEvent) => void;
};

function checkSection(animation: Animation, id: string, section: number): void {
  if (section >= animation.sections.length) {
    throw new Error(`Section ${section} not found in "${id}"`);
  }
}

function checkParams(animation: Animation, id: string, params?: ParameterSelection): void {
  const error = params && getParameterSelectionError(animation, params);
  if (error) {
    throw new Error(`${error} in "${id}"`);
  }
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createRenderService({
  engine,
  clips,
  setBrightness,
  setRecording,
  getLatency = () => 0,
  send,
}: RenderServiceOptions) {
  let animations = new Map<string, AnimationEntry>();
  let unsubscribeFrames: (() => void) | undefined;

  function sendFrame(frame: Frame): void {
    send({
      type: "frame",
      frame: Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength).toString("base64"),
    });
  }

  function setFrameStream(isEnabled: boolean): void {
    unsubscribeFrames?.();
    unsubscribeFrames = isEnabled
      ? engine.subscribe({
          setFrame(frame) {
            const latency = getLatency();
            if (latency > 0) {
              setTimeout(() => sendFrame(frame), latency);
            } else {
              sendFrame(frame);
            }
          },
        })
      : undefined;
  }

  function getAnimation(id: string): Animation {
    const entry = animations.get(id);
    if (!entry) {
      throw new Error(`Animation "${id}" not found`);
    }
    return entry.animation;
  }

  function checkLoaded(): void {
    if (!engine.isLoaded()) {
      throw new Error("Nothing is playing");
    }
  }

  function getDocuments({ cues }: TimelineRequest): Map<string, Animation> {
    const documents = new Map<string, Animation>();
    for (const cue of cues) {
      if (cue.animationId === null) {
        continue;
      }
      const animation = getAnimation(cue.animationId);
      checkSection(animation, cue.animationId, cue.section);
      checkParams(animation, cue.animationId, cue.params);
      documents.set(cue.animationId, animation);
    }
    return documents;
  }

  function getResponse(request: RenderRequest): PlaybackState {
    switch (request.type) {
      case "getState":
        break;
      case "play": {
        const { id, section, beat, bpm, beats, params } = request.request;
        const animation = getAnimation(id);
        checkSection(animation, id, section);
        checkParams(animation, id, params);
        engine.setBpm(bpm);
        engine.play(id, animation, { beat, section, beats, params });
        break;
      }
      case "stop":
        engine.stop();
        break;
      case "pause":
        checkLoaded();
        engine.pause();
        break;
      case "setTimeline":
        engine.loadTimeline(request.request, getDocuments(request.request));
        break;
      case "setClock":
        checkLoaded();
        engine.setClock(request.request);
        break;
    }
    return engine.getState();
  }

  function setAnimations(stored: readonly StoredAnimation[]): void {
    const next = new Map<string, AnimationEntry>();
    for (const { id, ...animation } of stored) {
      const json = JSON.stringify(animation);
      const previous = animations.get(id);
      if (previous?.json === json) {
        next.set(id, previous);
        continue;
      }
      next.set(id, { animation, json });
      if (previous) {
        engine.updateAnimation(id, animation);
      }
    }
    const removed = [...animations.keys()].filter((id) => !next.has(id));
    animations = next;
    for (const id of removed) {
      engine.removeAnimation(id);
    }
  }

  const unsubscribe = engine.subscribe({ setState: (state) => send({ type: "state", state }) });

  return {
    handle(message: RenderMessage): void {
      switch (message.type) {
        case "request":
          try {
            send({ type: "response", id: message.id, state: getResponse(message.request) });
          } catch (error) {
            send({ type: "response", id: message.id, error: getErrorMessage(error) });
          }
          break;
        case "setAnimations":
          setAnimations(message.animations);
          break;
        case "setClip":
          clips.set({
            id: message.id,
            durations: message.durations,
            frames: Buffer.from(message.frames, "base64"),
          });
          break;
        case "removeClip":
          clips.delete(message.id);
          break;
        case "setBrightness":
          setBrightness(message.brightness);
          break;
        case "setFrameStream":
          setFrameStream(message.isEnabled);
          break;
        case "setRecording":
          setRecording?.(message.directory);
          break;
      }
    },
    close(): void {
      unsubscribe();
      unsubscribeFrames?.();
    },
  };
}
