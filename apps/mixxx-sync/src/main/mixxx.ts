import { createConnection } from "node:net";
import { z } from "zod";

export const trackSchema = z.object({
  location: z.string(),
  artist: z.string().nullish(),
  title: z.string().nullish(),
});

export const deckSchema = z.object({
  group: z.string(),
  play: z.boolean(),
  bpm: z.number(),
  beat: z.number().nullable(),
  volume: z.number(),
  orientation: z.enum(["left", "center", "right"]),
});

export const decksMessageSchema = z.object({
  type: z.literal("decks"),
  time: z.number(),
  outputLatency: z.number(),
  crossfader: z.number(),
  decks: z.array(deckSchema),
});

export const trackMessageSchema = z.object({
  type: z.literal("track"),
  group: z.string(),
  track: trackSchema.nullable(),
});

export const messageSchema = z.discriminatedUnion("type", [decksMessageSchema, trackMessageSchema]);

export type Track = z.infer<typeof trackSchema>;

export type Deck = z.infer<typeof deckSchema>;

export type DecksMessage = z.infer<typeof decksMessageSchema>;

export type Message = z.infer<typeof messageSchema>;

export type MixxxState = {
  tracks: ReadonlyMap<string, Track | null>;
  decks: DecksMessage;
};

export type MixxxConnectionOptions = {
  path: string;
  reconnectDelay?: number;
  onState: (state: MixxxState) => void;
  onConnect?: () => void;
  onDisconnect?: (error: Error | undefined) => void;
  onInvalidMessage?: (line: string, error: unknown) => void;
};

export function connectToMixxx({
  path,
  reconnectDelay = 1000,
  onState,
  onConnect,
  onDisconnect,
  onInvalidMessage,
}: MixxxConnectionOptions) {
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let socket: ReturnType<typeof createConnection> | undefined;

  function connect(): void {
    const tracks = new Map<string, Track | null>();
    let buffer = "";
    let error: Error | undefined;
    let connected = false;
    socket = createConnection(path);
    socket.setEncoding("utf8");
    socket.on("connect", () => {
      connected = true;
      onConnect?.();
    });
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim() === "") {
          continue;
        }
        let message: Message;
        try {
          message = messageSchema.parse(JSON.parse(line));
        } catch (parseError) {
          onInvalidMessage?.(line, parseError);
          continue;
        }
        if (message.type === "track") {
          tracks.set(message.group, message.track);
        } else {
          onState({ tracks, decks: message });
        }
      }
    });
    socket.on("error", (socketError) => {
      error = socketError;
    });
    socket.on("close", () => {
      socket = undefined;
      if (closed) {
        return;
      }
      if (connected) {
        onDisconnect?.(error);
      }
      timer = setTimeout(connect, reconnectDelay);
    });
  }

  connect();

  return {
    close(): void {
      closed = true;
      clearTimeout(timer);
      socket?.destroy();
    },
  };
}
