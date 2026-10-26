import { parentPort, workerData } from "node:worker_threads";
import { clipImportOptionsSchema, encodeClipFrames } from "@led-matrix/core";
import { z } from "zod";
import { DecodeError, type DecodeWorkerMessage, decodeClip } from "./decode.ts";

const workerDataSchema = z.object({
  files: z.array(
    z.object({
      name: z.string(),
      mimetype: z.string(),
      data: z
        .instanceof(Uint8Array)
        .transform((data) => Buffer.from(data.buffer, data.byteOffset, data.byteLength)),
    }),
  ),
  options: clipImportOptionsSchema,
});

function send(message: DecodeWorkerMessage) {
  parentPort?.postMessage(message);
}

const { files, options } = workerDataSchema.parse(workerData);
try {
  const { frames, ...info } = await decodeClip(files, options);
  const encoded = encodeClipFrames(frames);
  send({ type: "clip", clip: { ...info, frames: encoded } });
} catch (error) {
  if (!(error instanceof DecodeError)) {
    throw error;
  }
  send({ type: "error", message: error.message });
}
