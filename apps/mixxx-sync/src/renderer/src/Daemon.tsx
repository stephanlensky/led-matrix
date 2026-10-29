import { PlayIcon, SquareIcon } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { DeviceMode } from "@led-matrix/core";
import type { ContentState, DaemonStatus, LogEntry } from "../../shared/api.ts";
import { Badge } from "@led-matrix/ui/components/badge";
import { Button } from "@led-matrix/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@led-matrix/ui/components/card";
import { Label } from "@led-matrix/ui/components/label";
import { Slider } from "@led-matrix/ui/components/slider";
import { createApiClient } from "@led-matrix/ui/lib/api";
import { getErrorMessage } from "./errors.ts";
import { useDaemonStatus, useLog } from "./useDaemon.ts";
import {
  type DeviceInfo,
  type DeviceSource,
  getServerDeviceSource,
  localDeviceSource,
  useDevice,
} from "./useDevice.ts";
import { useSettings } from "./useSettings.ts";

const MAX_BRIGHTNESS = 255;

const SCROLL_THRESHOLD = 16;

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const modeLabels: Readonly<Record<DeviceMode, string>> = {
  [DeviceMode.idle]: "Idle",
  [DeviceMode.streaming]: "Streaming",
  [DeviceMode.fallback]: "Fallback",
};

function StatusRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline gap-4">
      <dt className="w-24 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate">{children}</dd>
    </div>
  );
}

function getCueLabel({ cue }: DaemonStatus): string {
  if (!cue) {
    return "None";
  }
  if (cue.animationId === null) {
    return `Blank from beat ${cue.beat}`;
  }
  return `${cue.animationId}, section ${cue.section} from beat ${cue.beat}`;
}

function getMappingLabel({ trackCount, mappingErrors }: DaemonStatus): string {
  if (trackCount === undefined) {
    return "Not loaded";
  }
  const tracks = `${trackCount} ${trackCount === 1 ? "track" : "tracks"}`;
  if (mappingErrors.length === 0) {
    return tracks;
  }
  return `${tracks}, ${mappingErrors.length} ${mappingErrors.length === 1 ? "error" : "errors"}`;
}

function StatusCard({
  status,
  error,
  onStart,
  onStop,
}: {
  status: DaemonStatus;
  error: string | undefined;
  onStart: () => void;
  onStop: () => void;
}) {
  return (
    <Card className="shrink-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Daemon
          <Badge variant={status.isRunning ? "default" : "secondary"}>
            {status.isRunning ? "Running" : "Stopped"}
          </Badge>
        </CardTitle>
        <CardAction>
          {status.isRunning ? (
            <Button variant="outline" onClick={onStop}>
              <SquareIcon />
              Stop
            </Button>
          ) : (
            <Button onClick={onStart}>
              <PlayIcon />
              Start
            </Button>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && <p className="whitespace-pre-line text-destructive">{error}</p>}
        <dl className="flex flex-col gap-2">
          <StatusRow label="Mixxx">
            {!status.isRunning
              ? "Not running"
              : status.isMixxxConnected
                ? "Connected"
                : "Waiting for Mixxx"}
          </StatusRow>
          <StatusRow label="Mapping">{getMappingLabel(status)}</StatusRow>
          <StatusRow label="Live deck">{status.liveDeck ?? "None"}</StatusRow>
          <StatusRow label="Track">
            <span title={status.trackLocation}>{status.trackLocation ?? "None"}</span>
          </StatusRow>
          <StatusRow label="Cue">{getCueLabel(status)}</StatusRow>
        </dl>
      </CardContent>
    </Card>
  );
}

function DeviceBadge({ isEnabled, isConnected }: { isEnabled: boolean; isConnected: boolean }) {
  if (!isEnabled) {
    return <Badge variant="outline">Disabled</Badge>;
  }
  return isConnected ? (
    <Badge variant="default">Connected</Badge>
  ) : (
    <Badge variant="destructive">Disconnected</Badge>
  );
}

function getTransportLabel({ state, usb }: DeviceInfo): string {
  if (usb) {
    return usb.path ? `USB ${usb.path}` : "USB, searching for the board";
  }
  return state.address ? `WiFi ${state.address.address}:${state.address.port}` : "WiFi";
}

function getContentLabel({ origin, savedAt }: ContentState): string {
  if (origin === null) {
    return "Not loaded";
  }
  const saved = savedAt === null ? "" : ` (saved ${dateTimeFormat.format(savedAt)})`;
  return `${origin === "server" ? "Server" : "Cache"}${saved}`;
}

function DeviceRows({ info, fps }: { info: DeviceInfo; fps: number | undefined }) {
  const { state, usb, content } = info;
  const { status, latencyMs } = state;
  const transport = getTransportLabel(info);
  return (
    <dl className="flex flex-col gap-2">
      <StatusRow label="Transport">
        <span title={transport}>{transport}</span>
      </StatusRow>
      <StatusRow label="Mode">{status ? modeLabels[status.mode] : "—"}</StatusRow>
      <StatusRow label="FPS">{fps === undefined ? "—" : fps.toFixed(1)}</StatusRow>
      <StatusRow label="Latency">
        {latencyMs === null ? "—" : `${Math.round(latencyMs)} ms`}
      </StatusRow>
      <StatusRow label="Dropped">
        {status ? `${status.framesDropped.toLocaleString()} on board` : "—"}
        {usb && `, ${usb.droppedFrames.toLocaleString()} on USB`}
      </StatusRow>
      {usb && <StatusRow label="USB">{`${(usb.bytesPerSecond / 1024).toFixed(1)} KB/s`}</StatusRow>}
      {content && (
        <StatusRow label="Content">
          <span title={content.error ?? undefined}>{getContentLabel(content)}</span>
        </StatusRow>
      )}
    </dl>
  );
}

function LogLines({ entries }: { entries: readonly LogEntry[] }) {
  return (
    <>
      {entries.map(({ id, time, message }) => (
        <div key={id} className="flex gap-3">
          <span className="shrink-0 text-muted-foreground">{timeFormat.format(time)}</span>
          <span className="break-all">{message}</span>
        </div>
      ))}
    </>
  );
}

function BoardLog({ entries }: { entries: readonly LogEntry[] }) {
  return (
    <div className="flex flex-col gap-2">
      <Label>Board log</Label>
      <div className="flex max-h-32 flex-col-reverse overflow-y-auto font-mono text-xs scrollbar-thin">
        <div>
          {entries.length === 0 ? (
            <span className="text-muted-foreground">No messages</span>
          ) : (
            <LogLines entries={entries} />
          )}
        </div>
      </div>
    </div>
  );
}

function DeviceCard({ source, isLocal }: { source: DeviceSource; isLocal: boolean }) {
  const device = useDevice(source);
  const [draftBrightness, setDraftBrightness] = useState<number>();
  const { info, fps } = device;
  const state = info?.state;
  const brightness =
    draftBrightness ?? state?.brightness ?? state?.status?.brightness ?? MAX_BRIGHTNESS;

  function commitBrightness(value: number) {
    void device.setBrightness(value).finally(() => setDraftBrightness(undefined));
  }

  return (
    <Card className="shrink-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Device
          {state ? (
            <DeviceBadge isEnabled={state.enabled} isConnected={state.connected} />
          ) : (
            <Badge variant="destructive">{isLocal ? "Not running" : "Server offline"}</Badge>
          )}
          <Badge variant="outline">{isLocal ? "Local (USB)" : "Server (WiFi)"}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {device.error && <p className="text-destructive">{device.error}</p>}
        {info && <DeviceRows info={info} fps={fps} />}
        <div className="flex items-center justify-between gap-4">
          <Label>Brightness</Label>
          <span className="text-muted-foreground tabular-nums">
            {Math.round((brightness / MAX_BRIGHTNESS) * 100)}%
          </span>
        </div>
        <Slider
          aria-label="Brightness"
          min={0}
          max={MAX_BRIGHTNESS}
          value={brightness}
          disabled={!state?.enabled}
          onValueChange={(value) => setDraftBrightness(Number(value))}
          onValueCommitted={(value) => commitBrightness(Number(value))}
        />
        {info?.log && <BoardLog entries={info.log} />}
      </CardContent>
    </Card>
  );
}

function LogCard() {
  const entries = useLog();
  const contentRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  useEffect(() => {
    const content = contentRef.current;
    if (content && entries.length > 0 && isAtBottomRef.current) {
      content.scrollTop = content.scrollHeight;
    }
  }, [entries]);

  function updateIsAtBottom() {
    const content = contentRef.current;
    if (content) {
      isAtBottomRef.current =
        content.scrollHeight - content.scrollTop - content.clientHeight < SCROLL_THRESHOLD;
    }
  }

  return (
    <Card className="min-h-48 flex-1">
      <CardHeader>
        <CardTitle>Log</CardTitle>
      </CardHeader>
      <CardContent
        ref={contentRef}
        onScroll={updateIsAtBottom}
        className="min-h-0 flex-1 overflow-y-auto font-mono text-xs scrollbar-thin"
      >
        <LogLines entries={entries} />
      </CardContent>
    </Card>
  );
}

export function Daemon() {
  const status = useDaemonStatus();
  const settings = useSettings();
  const serverUrl = settings?.serverUrl;
  const isLocal = settings?.outputMode === "local";
  const source = useMemo(() => {
    if (isLocal) {
      return localDeviceSource;
    }
    return serverUrl === undefined
      ? undefined
      : getServerDeviceSource(createApiClient(serverUrl.replace(/\/+$/, "")));
  }, [isLocal, serverUrl]);
  const [error, setError] = useState<string>();

  async function start() {
    try {
      await window.api.start();
      setError(undefined);
    } catch (startError) {
      setError(getErrorMessage(startError));
    }
  }

  if (!status) {
    return null;
  }

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <StatusCard
        status={status}
        error={error}
        onStart={() => void start()}
        onStop={() => void window.api.stop()}
      />
      {source && <DeviceCard source={source} isLocal={isLocal} />}
      <LogCard />
    </div>
  );
}
