import type { Output } from "@led-matrix/core";
import { FolderOpenIcon, PlayIcon, SquareIcon } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import type { DaemonStatus, Settings } from "../../shared/api.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDaemonStatus, useLog } from "./useDaemon.ts";

const outputs: readonly Output[] = ["device", "simulator"];

const outputLabels: Record<Output, string> = {
  device: "Device",
  simulator: "Simulator",
};

const SCROLL_THRESHOLD = 16;

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function getErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

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

function SettingsCard({
  settings,
  isDisabled,
  onChange,
}: {
  settings: Settings;
  isDisabled: boolean;
  onChange: (settings: Settings) => void;
}) {
  const id = useId();

  async function showMappingFileDialog() {
    const mappingFile = await window.api.showMappingFileDialog();
    if (mappingFile) {
      onChange({ ...settings, mappingFile });
    }
  }

  return (
    <Card className="shrink-0">
      <CardHeader>
        <CardTitle>Settings</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3">
        <Label htmlFor={`${id}-server`}>Server</Label>
        <Input
          id={`${id}-server`}
          value={settings.serverUrl}
          disabled={isDisabled}
          onChange={(event) => onChange({ ...settings, serverUrl: event.target.value })}
        />
        <Label htmlFor={`${id}-output`}>Output</Label>
        <Select
          value={settings.output}
          disabled={isDisabled}
          onValueChange={(output: Output | null) => {
            if (output) {
              onChange({ ...settings, output });
            }
          }}
        >
          <SelectTrigger id={`${id}-output`} className="w-full">
            <SelectValue>{(output: Output) => outputLabels[output]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {outputs.map((output) => (
              <SelectItem key={output} value={output}>
                {outputLabels[output]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Label htmlFor={`${id}-socket`}>Mixxx socket</Label>
        <Input
          id={`${id}-socket`}
          value={settings.socketPath}
          disabled={isDisabled}
          onChange={(event) => onChange({ ...settings, socketPath: event.target.value })}
        />
        <Label htmlFor={`${id}-mapping`}>Mapping file</Label>
        <div className="flex gap-2">
          <Input
            id={`${id}-mapping`}
            value={settings.mappingFile}
            disabled={isDisabled}
            onChange={(event) => onChange({ ...settings, mappingFile: event.target.value })}
          />
          <Button
            variant="outline"
            size="icon"
            aria-label="Choose mapping file"
            disabled={isDisabled}
            onClick={() => void showMappingFileDialog()}
          >
            <FolderOpenIcon />
          </Button>
        </div>
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
        {entries.map(({ id, time, message }) => (
          <div key={id} className="flex gap-3">
            <span className="shrink-0 text-muted-foreground">{timeFormat.format(time)}</span>
            <span className="break-all">{message}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function Daemon() {
  const status = useDaemonStatus();
  const [settings, setSettings] = useState<Settings>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    void window.api.getSettings().then(setSettings);
  }, []);

  async function start() {
    if (!settings) {
      return;
    }
    try {
      setSettings(await window.api.setSettings(settings));
      await window.api.start();
      setError(undefined);
    } catch (startError) {
      setError(getErrorMessage(startError));
    }
  }

  if (!status || !settings) {
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
      <SettingsCard settings={settings} isDisabled={status.isRunning} onChange={setSettings} />
      <LogCard />
    </div>
  );
}
