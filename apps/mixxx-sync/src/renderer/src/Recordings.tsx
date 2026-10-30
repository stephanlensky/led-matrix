import { type Frame, createFrame } from "@led-matrix/core";
import { Button } from "@led-matrix/ui/components/button";
import { MatrixFrame } from "@led-matrix/ui/components/matrix-frame";
import { Panel } from "@led-matrix/ui/components/panel";
import { Slider } from "@led-matrix/ui/components/slider";
import {
  ArrowLeftIcon,
  FolderOpenIcon,
  PauseIcon,
  PlayIcon,
  RefreshCwIcon,
  UploadIcon,
} from "lucide-react";
import { type DragEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import {
  type RecordingFile,
  type RecordingPlayerState,
  idleRecordingPlayerState,
} from "../../shared/api.ts";
import { getErrorMessage } from "./errors.ts";
import { useSettings } from "./useSettings.ts";

const THUMBNAIL_PITCH = 3;
const CONTROLS_HEIGHT = 36;

const blankFrame = createFrame();

const dateFormat = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function getTimeLabel(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
}

function getSizeLabel(bytes: number): string {
  return `${(bytes / 1e6).toFixed(1)} MB`;
}

function getFrame(data: Uint8Array): Frame {
  return new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
}

function getFileName(path: string): string {
  return path.split("/").at(-1) ?? path;
}

function hasFiles(event: DragEvent): boolean {
  return event.dataTransfer.types.includes("Files");
}

function useRecordingPlayer(): RecordingPlayerState {
  const [state, setState] = useState(idleRecordingPlayerState);
  useEffect(() => {
    const unsubscribe = window.api.onRecordingPlayer(setState);
    void window.api.getRecordingPlayer().then(setState);
    return () => {
      unsubscribe();
      window.api.pauseRecording();
    };
  }, []);
  return state;
}

function useRecordingFiles() {
  const [files, setFiles] = useState<RecordingFile[]>();
  const [error, setError] = useState<string>();
  const refresh = useCallback(() => {
    window.api.getRecordingFiles().then(
      (result) => {
        setFiles(result);
        setError(undefined);
      },
      (cause: unknown) => setError(getErrorMessage(cause)),
    );
  }, []);
  useEffect(refresh, [refresh]);
  return { files, error, refresh };
}

function DropZone({
  onDropPath,
  children,
}: {
  onDropPath: (path: string) => void;
  children: ReactNode;
}) {
  const [isDragging, setIsDragging] = useState(false);

  function drop(event: DragEvent) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) {
      onDropPath(window.api.getPathForFile(file));
    }
  }

  return (
    <div
      className="relative h-full"
      onDragOver={(event) => {
        if (hasFiles(event)) {
          event.preventDefault();
          setIsDragging(true);
        }
      }}
      onDragLeave={(event) => {
        const { relatedTarget } = event;
        if (!(relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget))) {
          setIsDragging(false);
        }
      }}
      onDrop={drop}
    >
      {children}
      {isDragging && (
        <div className="pointer-events-none absolute inset-2 z-20 grid place-items-center rounded-xl border-2 border-dashed border-primary bg-background/80">
          <p className="flex items-center gap-2 text-lg">
            <UploadIcon /> Drop a recording to play it
          </p>
        </div>
      )}
    </div>
  );
}

function RecordingCard({ file, onOpen }: { file: RecordingFile; onOpen: () => void }) {
  return (
    <button
      type="button"
      className="flex flex-col gap-2 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-accent"
      onClick={onOpen}
    >
      <div className="self-center rounded-md bg-neutral-900 p-2">
        <Panel
          frame={file.thumbnail ? getFrame(file.thumbnail) : blankFrame}
          pitch={THUMBNAIL_PITCH * devicePixelRatio}
          showGrid
        />
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{dateFormat.format(file.recordedAt)}</span>
        <span className="truncate text-xs text-muted-foreground" title={file.path}>
          {file.name}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {file.durationMs === null ? "—" : getTimeLabel(file.durationMs)} ·{" "}
          {getSizeLabel(file.bytes)}
        </span>
      </div>
    </button>
  );
}

function RecordingBrowser({
  directory,
  error,
  onOpen,
  onShowDialog,
}: {
  directory: string | undefined;
  error: string | null;
  onOpen: (path: string) => void;
  onShowDialog: () => void;
}) {
  const { files, error: filesError, refresh } = useRecordingFiles();

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="text-lg font-medium">Recordings</h1>
          <span className="truncate text-sm text-muted-foreground" title={directory}>
            {directory}
          </span>
        </div>
        <Button variant="outline" size="icon" aria-label="Refresh" onClick={refresh}>
          <RefreshCwIcon />
        </Button>
        <Button variant="outline" onClick={onShowDialog}>
          <FolderOpenIcon />
          Open file
        </Button>
      </div>
      {(error ?? filesError) && <p className="text-destructive">{error ?? filesError}</p>}
      {files?.length === 0 && (
        <p className="text-muted-foreground">
          No recordings yet. Record from the Device tab, or drop an .mkv file here.
        </p>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4">
        {files?.map((file) => (
          <RecordingCard key={file.path} file={file} onOpen={() => onOpen(file.path)} />
        ))}
      </div>
    </div>
  );
}

function RecordingPlayer({ state }: { state: RecordingPlayerState }) {
  const [frame, setFrame] = useState<Frame>(blankFrame);
  const [positionMs, setPositionMs] = useState(state.positionMs);
  const [draftMs, setDraftMs] = useState<number>();
  const { info, isPlaying, error } = state;
  const durationMs = info?.durationMs ?? 0;
  const shownMs = draftMs ?? positionMs;

  useEffect(
    () =>
      window.api.onRecordingFrame((value) => {
        setFrame(getFrame(value.frame));
        setPositionMs(value.positionMs);
      }),
    [],
  );

  return (
    <div className="flex h-full flex-col gap-2 p-4">
      <div className="flex min-w-0 items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Back to recordings"
          onClick={() => window.api.closeRecording()}
        >
          <ArrowLeftIcon />
        </Button>
        <h1 className="min-w-0 font-medium break-all">{info && getFileName(info.path)}</h1>
      </div>
      {error && <p className="text-destructive">{error}</p>}
      <MatrixFrame
        frame={frame}
        showGrid
        className="min-h-0 flex-1"
        footerHeight={CONTROLS_HEIGHT}
        footer={
          <div className="flex h-9 items-center gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={isPlaying ? "Pause" : "Play"}
              onClick={() => (isPlaying ? window.api.pauseRecording() : window.api.playRecording())}
            >
              {isPlaying ? <PauseIcon /> : <PlayIcon />}
            </Button>
            <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
              {getTimeLabel(shownMs)}
            </span>
            <Slider
              aria-label="Position"
              className="flex-1"
              min={0}
              max={Math.max(durationMs, 1)}
              value={shownMs}
              onValueChange={(value) => setDraftMs(Number(value))}
              onValueCommitted={(value) => {
                window.api.seekRecording(Number(value));
                setPositionMs(Number(value));
                setDraftMs(undefined);
              }}
            />
            <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
              {getTimeLabel(durationMs)}
            </span>
          </div>
        }
      />
    </div>
  );
}

export function Recordings() {
  const settings = useSettings();
  const state = useRecordingPlayer();
  const [error, setError] = useState<string | null>(null);

  function open(path: string) {
    window.api.openRecording(path).then(
      (result) => setError(result.error),
      (cause: unknown) => setError(getErrorMessage(cause)),
    );
  }

  async function showDialog() {
    const path = await window.api.showRecordingDialog();
    if (path) {
      open(path);
    }
  }

  return (
    <DropZone onDropPath={open}>
      {state.info ? (
        <RecordingPlayer key={state.info.path} state={state} />
      ) : (
        <RecordingBrowser
          directory={settings?.recordingDirectory}
          error={error}
          onOpen={open}
          onShowDialog={() => void showDialog()}
        />
      )}
    </DropZone>
  );
}
