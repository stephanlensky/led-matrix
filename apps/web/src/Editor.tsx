import {
  type Animation,
  type AnimationMode,
  type Layer,
  type StoredAnimation,
  animationSchema,
  blendModes,
  effects,
  getEffect,
  getParamFields,
} from "@led-matrix/core";
import { PlayIcon, PlusIcon, SaveIcon, Trash2Icon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createAnimation, deleteAnimation, play, updateAnimation } from "./api.ts";
import { ParamControl } from "./ParamControl.tsx";
import { Preview } from "./Preview.tsx";
import { navigate } from "./usePathname.ts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type EditorProps = {
  isVisible: boolean;
  animationId: string | undefined;
  animations: readonly StoredAnimation[] | undefined;
  bpm: number;
  fps: number;
  showGrid: boolean;
  onShowGridChange: (showGrid: boolean) => void;
  onSaved: () => void;
};

type ModeType = "beats" | "frames" | "seconds";

const modeTypeLabels: Readonly<Record<ModeType, string>> = {
  beats: "Loop (beats)",
  frames: "Loop (frames)",
  seconds: "Duration (seconds)",
};

const NEW_ANIMATION: Animation = {
  name: "Untitled",
  mode: { type: "loop", beats: 4 },
  layers: [{ effect: "plasma", params: {}, blend: "normal", opacity: 1 }],
};

function getModeType(mode: AnimationMode): ModeType {
  if (mode.type === "duration") {
    return "seconds";
  }
  return "beats" in mode ? "beats" : "frames";
}

function getModeValue(mode: AnimationMode): number {
  if (mode.type === "duration") {
    return mode.ms / 1000;
  }
  return "beats" in mode ? mode.beats : mode.frames;
}

function getMode(type: ModeType, value: number): AnimationMode {
  if (type === "seconds") {
    return { type: "duration", ms: value * 1000 };
  }
  return type === "beats" ? { type: "loop", beats: value } : { type: "loop", frames: value };
}

function getEditorPathname(id: string | undefined): string {
  return id === undefined ? "/editor" : `/editor/${encodeURIComponent(id)}`;
}

function getDraft({ id: _id, ...animation }: StoredAnimation): Animation {
  return animation;
}

function getIssues(draft: Animation): Map<string, string> {
  const result = animationSchema.safeParse(draft);
  return new Map(
    (result.error?.issues ?? []).map((issue) => [issue.path.join("."), issue.message]),
  );
}

export function Editor({
  isVisible,
  animationId,
  animations,
  bpm,
  fps,
  showGrid,
  onShowGridChange,
  onSaved,
}: EditorProps) {
  const [selectedId, setSelectedId] = useState<string>();
  const [pendingSelection, setPendingSelection] = useState<{
    animation: StoredAnimation | undefined;
  }>();
  const [draft, setDraft] = useState<Animation>(NEW_ANIMATION);
  const [saved, setSaved] = useState<Animation>(NEW_ANIMATION);
  const [layerIndex, setLayerIndex] = useState(0);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [error, setError] = useState<string>();

  const issues = useMemo(() => getIssues(draft), [draft]);
  const [previewAnimation, setPreviewAnimation] = useState<Animation>(NEW_ANIMATION);
  if (issues.size === 0 && previewAnimation !== draft) {
    setPreviewAnimation(draft);
  }

  const layer = draft.layers[layerIndex] ?? draft.layers[0];
  const effect = layer && getEffect(layer.effect);
  const fields = useMemo(() => (effect ? getParamFields(effect.params) : []), [effect]);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const modeType = getModeType(draft.mode);
  const generalIssues = [...issues.entries()].filter(
    ([path]) =>
      !path.startsWith(`layers.${layerIndex}.params.`) && path !== "name" && path !== "mode",
  );

  function load(animation: StoredAnimation | undefined) {
    const next = animation ? getDraft(animation) : NEW_ANIMATION;
    setSelectedId(animation?.id);
    setDraft(next);
    setSaved(next);
    setLayerIndex(0);
    setIsConfirmingDelete(false);
    setError(undefined);
  }

  const routeAnimation = animations?.find((animation) => animation.id === animationId);
  const isRouteChanged = isVisible && animationId !== selectedId;
  if (isRouteChanged && (routeAnimation || animationId === undefined)) {
    if (!isDirty) {
      load(routeAnimation);
    } else if (!pendingSelection) {
      setPendingSelection({ animation: routeAnimation });
    }
  }

  useEffect(() => {
    if (isRouteChanged && animations && !routeAnimation) {
      navigate(getEditorPathname(selectedId), { replace: true });
    }
  }, [isRouteChanged, animations, routeAnimation, selectedId]);

  useEffect(() => {
    if (!isDirty) {
      return undefined;
    }
    const preventUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    addEventListener("beforeunload", preventUnload);
    return () => removeEventListener("beforeunload", preventUnload);
  }, [isDirty]);

  function requestSelect(animation: StoredAnimation | undefined) {
    if (animation?.id !== selectedId) {
      navigate(getEditorPathname(animation?.id));
    } else if (isDirty) {
      setPendingSelection({ animation });
    }
  }

  function cancelSelection() {
    navigate(getEditorPathname(selectedId), { replace: true });
    setPendingSelection(undefined);
  }

  function confirmSelection() {
    load(pendingSelection?.animation);
    setPendingSelection(undefined);
  }

  function updateLayer(update: Partial<Layer>) {
    setDraft({
      ...draft,
      layers: draft.layers.map((current, index) =>
        index === layerIndex ? { ...current, ...update } : current,
      ),
    });
  }

  function updateParam(key: string, value: unknown) {
    if (!layer) {
      return;
    }
    const { [key]: _previous, ...params } = layer.params;
    updateLayer({ params: value === undefined ? params : { ...params, [key]: value } });
  }

  function run(action: () => Promise<unknown>) {
    action()
      .then(() => setError(undefined))
      .catch((cause: unknown) => setError(String(cause)));
  }

  async function save({ shouldNavigate = true } = {}): Promise<string> {
    const animation = animationSchema.parse(draft);
    const stored = selectedId
      ? await updateAnimation(selectedId, animation)
      : await createAnimation(animation);
    setSelectedId(stored.id);
    if (shouldNavigate) {
      navigate(getEditorPathname(stored.id), { replace: true });
    }
    setSaved(draft);
    onSaved();
    return stored.id;
  }

  async function remove() {
    if (!selectedId) {
      return;
    }
    await deleteAnimation(selectedId);
    load(undefined);
    navigate(getEditorPathname(undefined), { replace: true });
    onSaved();
  }

  return (
    <>
      <Card className="self-start md:w-96">
        <CardHeader className="flex items-center justify-between gap-2">
          <CardTitle>Editor</CardTitle>
          {isDirty && <Badge variant="secondary">Unsaved</Badge>}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Select
              value={selectedId ?? null}
              onValueChange={(id) =>
                requestSelect(animations?.find((animation) => animation.id === id))
              }
            >
              <SelectTrigger size="sm" className="min-w-0 flex-1" aria-label="Animation">
                <SelectValue placeholder="New animation">
                  {(id: string | null) =>
                    animations?.find((animation) => animation.id === id)?.name ?? "New animation"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {animations?.map((animation) => (
                  <SelectItem key={animation.id} value={animation.id}>
                    {animation.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => requestSelect(undefined)}>
              <PlusIcon />
              New
            </Button>
          </div>
          <Separator />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="animation-name" className="text-xs text-muted-foreground">
              Name
            </Label>
            <Input
              id="animation-name"
              className="h-7 text-xs"
              value={draft.name}
              aria-invalid={issues.has("name")}
              onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="animation-length" className="text-xs text-muted-foreground">
              Length
            </Label>
            <div className="flex items-center gap-2">
              <Select
                value={modeType}
                onValueChange={(type: ModeType | null) => {
                  if (type) {
                    setDraft({ ...draft, mode: getMode(type, getModeValue(draft.mode)) });
                  }
                }}
              >
                <SelectTrigger size="sm" className="min-w-0 flex-1" aria-label="Length unit">
                  <SelectValue>{(type: ModeType) => modeTypeLabels[type]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(modeTypeLabels).map(([type, label]) => (
                    <SelectItem key={type} value={type}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                id="animation-length"
                type="number"
                className="h-7 w-20 shrink-0 font-mono text-xs tabular-nums"
                min={0}
                step={modeType === "seconds" ? 0.1 : 1}
                aria-invalid={[...issues.keys()].some((path) => path.startsWith("mode"))}
                value={getModeValue(draft.mode)}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    mode: getMode(modeType, Number(event.currentTarget.value)),
                  })
                }
              />
            </div>
          </div>
          <Separator />
          {draft.layers.length > 1 && (
            <Tabs
              value={layerIndex}
              onValueChange={(index: number) => setLayerIndex(index)}
              className="gap-0"
            >
              <TabsList variant="line" className="gap-4">
                {draft.layers.map((current, index) => (
                  <TabsTrigger key={index} value={index} className="flex-none px-0">
                    {getEffect(current.effect)?.name ?? current.effect}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
          {layer && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="layer-effect" className="text-xs text-muted-foreground">
                  Effect
                </Label>
                <Select
                  value={layer.effect}
                  onValueChange={(id: string | null) => {
                    if (id && id !== layer.effect) {
                      updateLayer({ effect: id, params: {} });
                    }
                  }}
                >
                  <SelectTrigger id="layer-effect" size="sm" className="w-full">
                    <SelectValue>{(id: string) => getEffect(id)?.name ?? id}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {effects.map((current) => (
                      <SelectItem key={current.id} value={current.id}>
                        {current.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {fields.map((field) => (
                <ParamControl
                  key={`${layerIndex}-${layer.effect}-${field.key}`}
                  field={field}
                  value={layer.params[field.key]}
                  error={issues.get(`layers.${layerIndex}.params.${field.key}`)}
                  onChange={(value) => updateParam(field.key, value)}
                />
              ))}
              {draft.layers.length > 1 && (
                <>
                  <Separator />
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="layer-blend" className="text-xs text-muted-foreground">
                      Blend
                    </Label>
                    <Select
                      value={layer.blend}
                      onValueChange={(blend: Layer["blend"] | null) => {
                        if (blend) {
                          updateLayer({ blend });
                        }
                      }}
                    >
                      <SelectTrigger id="layer-blend" size="sm" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {blendModes.map((mode) => (
                          <SelectItem key={mode} value={mode}>
                            {mode}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs text-muted-foreground">Opacity</Label>
                    <Slider
                      aria-label="Opacity"
                      min={0}
                      max={1}
                      step={0.01}
                      value={layer.opacity}
                      onValueChange={(value) =>
                        updateLayer({ opacity: Array.isArray(value) ? (value[0] ?? 1) : value })
                      }
                    />
                  </div>
                </>
              )}
            </>
          )}
          {(generalIssues.length > 0 || error) && (
            <div className="flex flex-col gap-1 text-xs text-destructive">
              {generalIssues.map(([path, message]) => (
                <p key={path}>
                  {path}: {message}
                </p>
              ))}
              {error && <p>{error}</p>}
            </div>
          )}
          <Separator />
          <div className="flex items-center gap-2">
            <Button
              disabled={issues.size > 0 || (!isDirty && selectedId !== undefined)}
              onClick={() => run(save)}
            >
              <SaveIcon />
              Save
            </Button>
            <Button
              variant="outline"
              disabled={issues.size > 0}
              onClick={() =>
                run(async () => play(isDirty || !selectedId ? await save() : selectedId))
              }
            >
              <PlayIcon />
              {isDirty || !selectedId ? "Save and play" : "Play"}
            </Button>
            {selectedId && (
              <Button
                variant={isConfirmingDelete ? "destructive" : "ghost"}
                size={isConfirmingDelete ? "default" : "icon"}
                className="ml-auto"
                aria-label="Delete animation"
                onClick={() => (isConfirmingDelete ? run(remove) : setIsConfirmingDelete(true))}
                onBlur={() => setIsConfirmingDelete(false)}
              >
                <Trash2Icon />
                {isConfirmingDelete && "Confirm"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      <AlertDialog
        open={pendingSelection !== undefined}
        onOpenChange={(isOpen) => {
          if (!isOpen && pendingSelection) {
            cancelSelection();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your changes to "{draft.name}" will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmSelection}>
              Discard
            </AlertDialogAction>
            <AlertDialogAction
              disabled={issues.size > 0}
              onClick={() =>
                run(async () => {
                  await save({ shouldNavigate: false });
                  confirmSelection();
                })
              }
            >
              Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
