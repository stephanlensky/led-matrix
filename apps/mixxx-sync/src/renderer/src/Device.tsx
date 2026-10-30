import { DeviceMode } from "@led-matrix/core";
import { Badge } from "@led-matrix/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@led-matrix/ui/components/card";
import { Label } from "@led-matrix/ui/components/label";
import { Slider } from "@led-matrix/ui/components/slider";
import { createApiClient } from "@led-matrix/ui/lib/api";
import { useMemo, useState } from "react";
import type { ContentState, LogEntry, Settings } from "../../shared/api.ts";
import { LogLines } from "./LogLines.tsx";
import { LiveFrame, getLiveSource } from "./Playback.tsx";
import { StatusRow } from "./StatusRow.tsx";
import {
  type Device as DeviceValue,
  type DeviceInfo,
  getServerDeviceSource,
  localDeviceSource,
  useDevice,
} from "./useDevice.ts";
import { useSettings } from "./useSettings.ts";

const MAX_BRIGHTNESS = 255;

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

function getDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
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
      <StatusRow label="Uptime">{status ? getDuration(status.uptimeMs) : "—"}</StatusRow>
      {content && (
        <StatusRow label="Content">
          <span title={content.error ?? undefined}>{getContentLabel(content)}</span>
        </StatusRow>
      )}
    </dl>
  );
}

function BoardLog({ entries }: { entries: readonly LogEntry[] }) {
  return (
    <div className="flex flex-col gap-2">
      <Label>Board log</Label>
      <div className="flex max-h-48 flex-col-reverse overflow-y-auto font-mono text-xs scrollbar-thin">
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

function DeviceCard({ device, isLocal }: { device: DeviceValue; isLocal: boolean }) {
  const [draftBrightness, setDraftBrightness] = useState<number>();
  const { info, fps } = device;
  const state = info?.state;
  const brightness =
    draftBrightness ?? state?.brightness ?? state?.status?.brightness ?? MAX_BRIGHTNESS;

  function commitBrightness(value: number) {
    void device.setBrightness(value).finally(() => setDraftBrightness(undefined));
  }

  return (
    <Card className="max-h-full w-96 shrink-0 self-start overflow-y-auto scrollbar-thin">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
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

function DeviceContent({ settings }: { settings: Settings }) {
  const { serverUrl } = settings;
  const isLocal = settings.outputMode === "local";
  const source = useMemo(
    () =>
      isLocal
        ? localDeviceSource
        : getServerDeviceSource(createApiClient(serverUrl.replace(/\/+$/, ""))),
    [isLocal, serverUrl],
  );
  const device = useDevice(source);
  const isBoardOffline = device.info !== undefined && !device.info.state.connected;

  return (
    <div className="flex h-full gap-4 p-4">
      <DeviceCard device={device} isLocal={isLocal} />
      <LiveFrame
        source={getLiveSource(settings)}
        className="h-full min-h-0 flex-1"
        overlay={isBoardOffline && <Badge variant="destructive">Board offline</Badge>}
      />
    </div>
  );
}

export function Device() {
  const settings = useSettings();
  return settings ? <DeviceContent settings={settings} /> : null;
}
