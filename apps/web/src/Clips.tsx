import {
  type Animation,
  type ClipImportOptions,
  type ClipInfo,
  type ClipSource,
  type FitMode,
  type ResampleMode,
  clipImportOptionsSchema,
  fitModes,
  getClipDuration,
  resampleModes,
} from "@led-matrix/core";
import {
  FileImageIcon,
  FilmIcon,
  ImagesIcon,
  type LucideIcon,
  PencilRulerIcon,
  ShapesIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { type DragEvent, useMemo, useRef, useState } from "react";
import { createAnimation, deleteClip, importClip, renameClip } from "./api.ts";
import { removeClip } from "./clipLibrary.ts";
import { ListEmpty, ListRow } from "./ListRow.tsx";
import { Preview } from "./Preview.tsx";
import { navigate } from "./usePathname.ts";
import { Button } from "@led-matrix/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@led-matrix/ui/components/card";
import { Input } from "@led-matrix/ui/components/input";
import { Label } from "@led-matrix/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@led-matrix/ui/components/select";
import { Separator } from "@led-matrix/ui/components/separator";
import { cn } from "@led-matrix/ui/lib/utils";

type ClipsProps = {
  isVisible: boolean;
  clipId: string | undefined;
  clips: readonly ClipInfo[] | undefined;
  bpm: number;
  fps: number;
  showGrid: boolean;
  onShowGridChange: (showGrid: boolean) => void;
  onClipsChanged: () => void;
  onAnimationsChanged: () => Promise<void>;
};

type ImportSettings = Pick<ClipImportOptions, "fit" | "resample" | "fps" | "start" | "duration">;

const defaultImportSettings: ImportSettings = clipImportOptionsSchema.parse({});

const sourceIcons: Readonly<Record<ClipSource, LucideIcon>> = {
  image: FileImageIcon,
  gif: ImagesIcon,
  svg: ShapesIcon,
  video: FilmIcon,
  sequence: ImagesIcon,
};

const fitLabels: Readonly<Record<FitMode, string>> = {
  cover: "Cover (crop)",
  contain: "Contain (letterbox)",
  fill: "Fill (stretch)",
};

const resampleLabels: Readonly<Record<ResampleMode, string>> = {
  nearest: "Nearest (pixel art)",
  area: "Area (smooth)",
};

const ACCEPTED_FILES = "image/*,video/*,.svg";

function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/");
}

function getClipPathname(id: string | undefined): string {
  return id === undefined ? "/clips" : `/clips/${encodeURIComponent(id)}`;
}

function getDurationLabel(clip: ClipInfo): string {
  return `${Math.round(getClipDuration(clip) / 1000)}s`;
}

function getFrameCountLabel(clip: ClipInfo): string {
  const count = clip.durations.length;
  return `${clip.source} · ${count} frame${count === 1 ? "" : "s"}`;
}

function getClipAnimation(clip: ClipInfo): Animation {
  return {
    name: clip.name,
    sections: [
      {
        mode: { type: "once", ms: getClipDuration(clip) },
        layers: [{ effect: "clip", params: { clip: clip.id }, blend: "normal", opacity: 1 }],
      },
    ],
  };
}

function NumberSetting({
  id,
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        className="h-7 font-mono text-xs tabular-nums"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </div>
  );
}

function EnumSetting<T extends string>({
  id,
  label,
  value,
  options,
  labels,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: readonly T[];
  labels: Readonly<Record<T, string>>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Select
        value={value}
        onValueChange={(next: T | null) => {
          if (next) {
            onChange(next);
          }
        }}
      >
        <SelectTrigger id={id} size="sm" className="w-full">
          <SelectValue>{(current: T) => labels[current]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {labels[option]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function Clips({
  isVisible,
  clipId,
  clips,
  bpm,
  fps,
  showGrid,
  onShowGridChange,
  onClipsChanged,
  onAnimationsChanged,
}: ClipsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [settings, setSettings] = useState(defaultImportSettings);
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [error, setError] = useState<string>();

  const clip = clips?.find((current) => current.id === clipId);
  const previewAnimation = useMemo(() => clip && getClipAnimation(clip), [clip]);
  const hasVideo = files.some(isVideoFile);
  const isSequence = files.length > 1;

  function run(action: () => Promise<unknown>) {
    action()
      .then(() => setError(undefined))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }

  function updateSettings(update: Partial<ImportSettings>) {
    setSettings({ ...settings, ...update });
  }

  function selectFiles(selected: FileList | null) {
    setFiles(selected ? [...selected] : []);
    setError(undefined);
  }

  function drop(event: DragEvent) {
    event.preventDefault();
    setIsDragging(false);
    selectFiles(event.dataTransfer.files);
  }

  async function submitImport() {
    setIsImporting(true);
    try {
      const imported = await importClip(files, {
        fit: settings.fit,
        resample: settings.resample,
        ...(hasVideo || isSequence ? { fps: settings.fps } : {}),
        ...(hasVideo ? { start: settings.start, duration: settings.duration } : {}),
      });
      setFiles([]);
      onClipsChanged();
      navigate(getClipPathname(imported.id));
    } finally {
      setIsImporting(false);
    }
  }

  async function rename(name: string) {
    if (clip && name && name !== clip.name) {
      await renameClip(clip.id, name);
      onClipsChanged();
    }
  }

  async function createClipAnimation() {
    if (!clip) {
      return;
    }
    const animation = await createAnimation({
      name: clip.name,
      sections: [
        {
          mode: {
            type: "loop",
            frames: Math.max(1, Math.round((getClipDuration(clip) * fps) / 1000)),
          },
          layers: [
            {
              effect: "clip",
              params: { clip: clip.id, timing: "stretch" },
              blend: "normal",
              opacity: 1,
            },
          ],
        },
      ],
    });
    await onAnimationsChanged();
    navigate(`/editor/${encodeURIComponent(animation.id)}`);
  }

  async function remove() {
    if (!clip) {
      return;
    }
    await deleteClip(clip.id);
    removeClip(clip.id);
    setIsConfirmingDelete(false);
    onClipsChanged();
    navigate(getClipPathname(undefined), { replace: true });
  }

  return (
    <>
      <Card className="self-start md:w-96">
        <CardHeader>
          <CardTitle>Clips</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPTED_FILES}
            className="hidden"
            onChange={(event) => {
              selectFiles(event.currentTarget.files);
              event.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={drop}
            className={cn(
              "flex flex-col items-center gap-1 rounded-lg border border-dashed px-3 py-5 text-center text-xs text-muted-foreground outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50",
              isDragging && "border-foreground bg-muted",
            )}
          >
            <UploadIcon className="size-4" />
            <span>
              {files.length === 0
                ? "Drop a GIF, video, image or SVG, or several images for a sequence"
                : files.length === 1
                  ? files[0]?.name
                  : `${files.length} images as a sequence`}
            </span>
          </button>
          {files.length > 0 && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <EnumSetting
                  id="import-fit"
                  label="Fit"
                  value={settings.fit}
                  options={fitModes}
                  labels={fitLabels}
                  onChange={(fit) => updateSettings({ fit })}
                />
                <EnumSetting
                  id="import-resample"
                  label="Resample"
                  value={settings.resample}
                  options={resampleModes}
                  labels={resampleLabels}
                  onChange={(resample) => updateSettings({ resample })}
                />
                {(hasVideo || isSequence) && (
                  <NumberSetting
                    id="import-fps"
                    label="Frames per second"
                    value={settings.fps}
                    min={1}
                    max={60}
                    step={1}
                    onChange={(value) => updateSettings({ fps: value })}
                  />
                )}
                {hasVideo && (
                  <>
                    <NumberSetting
                      id="import-start"
                      label="Start (s)"
                      value={settings.start}
                      min={0}
                      max={3600}
                      step={0.1}
                      onChange={(start) => updateSettings({ start })}
                    />
                    <NumberSetting
                      id="import-duration"
                      label="Duration (s)"
                      value={settings.duration}
                      min={0.1}
                      max={600}
                      step={0.1}
                      onChange={(duration) => updateSettings({ duration })}
                    />
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button disabled={isImporting} onClick={() => run(submitImport)}>
                  <UploadIcon />
                  {isImporting ? "Importing…" : "Import"}
                </Button>
                <Button variant="ghost" disabled={isImporting} onClick={() => setFiles([])}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
          <Separator />
          <div className="-mx-(--card-spacing)">
            {clips?.length === 0 ? (
              <ListEmpty>No clips</ListEmpty>
            ) : (
              <ul>
                {clips?.map((current) => {
                  const Icon = sourceIcons[current.source];
                  return (
                    <li key={current.id}>
                      <ListRow
                        isActive={current.id === clipId}
                        icon={<Icon />}
                        title={current.name}
                        subtitle={getFrameCountLabel(current)}
                        detail={getDurationLabel(current)}
                        onClick={() => {
                          setIsConfirmingDelete(false);
                          navigate(getClipPathname(current.id));
                        }}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {clip && (
            <>
              <Separator />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="clip-name" className="text-xs text-muted-foreground">
                  Name
                </Label>
                <Input
                  key={`${clip.id}-${clip.name}`}
                  id="clip-name"
                  className="h-7 text-xs"
                  maxLength={100}
                  defaultValue={clip.name}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.currentTarget.blur();
                    }
                  }}
                  onBlur={(event) => {
                    const name = event.currentTarget.value.trim();
                    run(() => rename(name));
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => run(createClipAnimation)}>
                  <PencilRulerIcon />
                  Create animation
                </Button>
                <Button
                  variant={isConfirmingDelete ? "destructive" : "ghost"}
                  size={isConfirmingDelete ? "default" : "icon"}
                  className="ml-auto"
                  aria-label="Delete clip"
                  onClick={() => (isConfirmingDelete ? run(remove) : setIsConfirmingDelete(true))}
                  onBlur={() => setIsConfirmingDelete(false)}
                >
                  <Trash2Icon />
                  {isConfirmingDelete && "Confirm"}
                </Button>
              </div>
            </>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </CardContent>
      </Card>
      {isVisible && (
        <Preview
          animation={previewAnimation}
          bpm={bpm}
          fps={fps}
          showGrid={showGrid}
          onShowGridChange={onShowGridChange}
        />
      )}
    </>
  );
}
