import { PlayIcon, SquareIcon } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { DaemonStatus } from "../../shared/api.ts";
import { Badge } from "@led-matrix/ui/components/badge";
import { Button } from "@led-matrix/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@led-matrix/ui/components/card";
import { getErrorMessage } from "./errors.ts";
import { useDaemonStatus, useLog } from "./useDaemon.ts";

const SCROLL_THRESHOLD = 16;

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

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
      <LogCard />
    </div>
  );
}
