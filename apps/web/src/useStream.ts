import { type Frame, type PlaybackState, createFrame, streamMessageSchema } from "@led-matrix/core";
import { useEffect, useState } from "react";

const RECONNECT_DELAY_MS = 1000;

export type Stream = {
  frame: Frame;
  state: PlaybackState | undefined;
  isConnected: boolean;
};

function getStreamUrl(): string {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/api/stream`;
}

export function useStream(): Stream {
  const [frame, setFrame] = useState<Frame>(createFrame);
  const [state, setState] = useState<PlaybackState>();
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let socket: WebSocket | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let isClosed = false;

    function connect() {
      socket = new WebSocket(getStreamUrl());
      socket.binaryType = "arraybuffer";
      socket.addEventListener("open", () => setIsConnected(true));
      socket.addEventListener("message", (event: MessageEvent<ArrayBuffer | string>) => {
        if (typeof event.data === "string") {
          setState(streamMessageSchema.parse(JSON.parse(event.data)).state);
        } else {
          setFrame(new Uint8ClampedArray(event.data));
        }
      });
      socket.addEventListener("close", () => {
        setIsConnected(false);
        if (!isClosed) {
          reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      });
    }

    connect();
    return () => {
      isClosed = true;
      clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, []);

  return { frame, state, isConnected };
}
