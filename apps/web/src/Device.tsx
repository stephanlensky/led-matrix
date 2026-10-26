import { DeviceMode, type DeviceStatus, type StoredAnimation } from "@led-matrix/core";
import { useState } from "react";
import { setBrightness } from "./api.ts";
import { MatrixFrame } from "./MatrixFrame.tsx";
import { PlaybackControls } from "./PlaybackControls.tsx";
import type { Stream } from "./useStream.ts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";

const MAX_BRIGHTNESS = 255;

const modeLabels: Readonly<Record<DeviceMode, string>> = {
  [DeviceMode.idle]: "Idle",
  [DeviceMode.streaming]: "Streaming",
  [DeviceMode.fallback]: "Fallback",
};

type DeviceProps = {
  stream: Stream;
  animations: readonly StoredAnimation[];
  showGrid: boolean;
  onShowGridChange: (showGrid: boolean) => void;
};

type FpsSample = { status: DeviceStatus | null; fps: number | undefined };

function getFps(previous: DeviceStatus | null, current: DeviceStatus | null): number | undefined {
  if (!previous || !current) {
    return undefined;
  }
  const elapsedMs = current.uptimeMs - previous.uptimeMs;
  const frames = current.framesShown - previous.framesShown;
  return elapsedMs > 0 && frames >= 0 ? (frames * 1000) / elapsedMs : undefined;
}

function getDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function DeviceBadge({ stream }: { stream: Stream }) {
  if (!stream.isConnected) {
    return <Badge variant="destructive">Server offline</Badge>;
  }
  if (!stream.device?.enabled) {
    return <Badge variant="outline">Disabled</Badge>;
  }
  return stream.device.connected ? (
    <Badge variant="secondary">Connected</Badge>
  ) : (
    <Badge variant="destructive">Disconnected</Badge>
  );
}

function StatusRow({ label, value }: { label: string; value: string | undefined }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right tabular-nums">{value ?? "—"}</dd>
    </>
  );
}

export function Device({ stream, animations, showGrid, onShowGridChange }: DeviceProps) {
  const { frame, state, device } = stream;
  const status = device?.status ?? null;
  const latencyMs = device?.latencyMs ?? null;
  const [fpsSample, setFpsSample] = useState<FpsSample>({ status, fps: undefined });
  if (status !== fpsSample.status) {
    setFpsSample({ status, fps: getFps(fpsSample.status, status) });
  }
  const [draftBrightness, setDraftBrightness] = useState<number>();
  const [error, setError] = useState<string>();
  const brightness = draftBrightness ?? device?.brightness ?? status?.brightness ?? MAX_BRIGHTNESS;
  const address = device?.address;

  function commitBrightness(value: number) {
    setBrightness(value)
      .then(() => setError(undefined))
      .catch((cause: unknown) => setError(String(cause)))
      .finally(() => setDraftBrightness(undefined));
  }

  return (
    <>
      <Card className="self-start md:w-80">
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Device</CardTitle>
          <DeviceBadge stream={stream} />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <StatusRow
              label="Address"
              value={address ? `${address.address}:${address.port}` : undefined}
            />
            <StatusRow label="Mode" value={status ? modeLabels[status.mode] : undefined} />
            <StatusRow label="FPS" value={fpsSample.fps?.toFixed(1)} />
            <StatusRow
              label="Latency"
              value={latencyMs === null ? undefined : `${Math.round(latencyMs)} ms`}
            />
            <StatusRow label="Dropped frames" value={status?.framesDropped.toLocaleString()} />
            <StatusRow label="Uptime" value={status ? getDuration(status.uptimeMs) : undefined} />
          </dl>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4">
              <Label>Brightness</Label>
              <span className="text-sm text-muted-foreground tabular-nums">
                {Math.round((brightness / MAX_BRIGHTNESS) * 100)}%
              </span>
            </div>
            <Slider
              aria-label="Brightness"
              min={0}
              max={MAX_BRIGHTNESS}
              value={brightness}
              disabled={!device?.enabled}
              onValueChange={(value) => setDraftBrightness(Number(value))}
              onValueCommitted={(value) => commitBrightness(Number(value))}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Separator />
          <PlaybackControls
            output="device"
            state={state}
            animations={animations}
            showGrid={showGrid}
            onShowGridChange={onShowGridChange}
          />
        </CardContent>
      </Card>
      <MatrixFrame
        frame={frame}
        showGrid={showGrid}
        overlay={!device?.connected && <Badge variant="destructive">Board offline</Badge>}
      />
    </>
  );
}
