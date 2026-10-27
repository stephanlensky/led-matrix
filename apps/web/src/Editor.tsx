import {
  type Animation,
  type AnimationFolder,
  type AnimationMode,
  type ClipInfo,
  type Layer,
  type ModeType,
  type Section,
  type StoredAnimation,
  animationSchema,
  blendModes,
  getEffect,
  getFolderTree,
  getFolders,
  getParamFields,
  type ParameterSelection,
  getParameterAnimation,
  getParameterReference,
  getParameterSelection,
  getParameterValues,
  getValueParameter,
} from "@led-matrix/core";
import { PlayIcon, PlusIcon, SaveIcon, Trash2Icon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "./api.ts";
import { EffectSelectItems } from "./EffectItems.tsx";
import { LayerList } from "./LayerList.tsx";
import { TruncatedText } from "@led-matrix/ui/components/truncated-text";
import { ParamControl } from "./ParamControl.tsx";
import { Preview } from "./Preview.tsx";
import { getSectionName } from "@led-matrix/ui/lib/section-labels";
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
} from "@led-matrix/ui/components/alert-dialog";
import { Badge } from "@led-matrix/ui/components/badge";
import { Button } from "@led-matrix/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@led-matrix/ui/components/card";
import { Input } from "@led-matrix/ui/components/input";
import { Label } from "@led-matrix/ui/components/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@led-matrix/ui/components/select";
import { Separator } from "@led-matrix/ui/components/separator";
import { Slider } from "@led-matrix/ui/components/slider";
import { Switch } from "@led-matrix/ui/components/switch";

type EditorProps = {
  isVisible: boolean;
  animationId: string | undefined;
  animations: readonly StoredAnimation[] | undefined;
  clips: readonly ClipInfo[];
  bpm: number;
  fps: number;
  showGrid: boolean;
  onShowGridChange: (showGrid: boolean) => void;
  onSaved: () => void;
};

type LengthUnit = "beats" | "frames" | "seconds";

const modeTypeLabels: Readonly<Record<ModeType, string>> = {
  loop: "Loop",
  once: "Once",
};

const lengthUnitLabels: Readonly<Record<LengthUnit, string>> = {
  beats: "Beats",
  frames: "Frames",
  seconds: "Seconds",
};

const DEFAULT_SECTION: Section = {
  mode: { type: "loop", beats: 4 },
  layers: [{ effect: "plasma", params: {}, blend: "normal", opacity: 1 }],
};

const NEW_ANIMATION: Animation = { name: "Untitled", sections: [DEFAULT_SECTION] };

function getLengthUnit(mode: AnimationMode): LengthUnit {
  if ("ms" in mode) {
    return "seconds";
  }
  return "beats" in mode ? "beats" : "frames";
}

function getModeValue(mode: AnimationMode): number {
  if ("ms" in mode) {
    return mode.ms / 1000;
  }
  return "beats" in mode ? mode.beats : mode.frames;
}

function getMode(type: ModeType, unit: LengthUnit, value: number): AnimationMode {
  if (unit === "seconds") {
    return { type, ms: value * 1000 };
  }
  return unit === "beats" ? { type, beats: value } : { type, frames: value };
}

function getEditorPathname(id: string | undefined): string {
  return id === undefined ? "/editor" : `/editor/${encodeURIComponent(id)}`;
}

function getFolderGroups(folder: AnimationFolder): AnimationFolder[] {
  return [folder, ...folder.folders.flatMap(getFolderGroups)].filter(
    ({ animations }) => animations.length > 0,
  );
}

function AnimationSelectItems({ animations }: { animations: readonly StoredAnimation[] }) {
  return getFolderGroups(getFolderTree(animations)).map(({ path, animations: items }) => (
    <SelectGroup key={path}>
      {path && <SelectLabel>{path.replaceAll("/", " / ")}</SelectLabel>}
      {items.map((animation) => (
        <SelectItem key={animation.id} value={animation.id}>
          {animation.name}
        </SelectItem>
      ))}
    </SelectGroup>
  ));
}

function getDraft({ id: _id, ...animation }: StoredAnimation): Animation {
  return animation;
}

function getInvalidLayerIndexes(
  issues: ReadonlyMap<string, string>,
  sectionIndex: number,
): Set<number> {
  const prefix = `sections.${sectionIndex}.layers.`;
  return new Set(
    [...issues.keys()]
      .filter((path) => path.startsWith(prefix))
      .map((path) => /^(\d+)\./.exec(path.slice(prefix.length))?.[1])
      .filter((index) => index !== undefined)
      .map(Number),
  );
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
  clips,
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
  const [sectionIndex, setSectionIndex] = useState(0);
  const [layerIndex, setLayerIndex] = useState(0);
  const [selectedParams, setSelectedParams] = useState<ParameterSelection>({});
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [error, setError] = useState<string>();

  const issues = useMemo(() => getIssues(draft), [draft]);
  const [previewAnimation, setPreviewAnimation] = useState<Animation>(NEW_ANIMATION);
  if (issues.size === 0 && previewAnimation !== draft) {
    setPreviewAnimation(draft);
  }

  const params = getParameterSelection(draft, selectedParams);
  const parameterValues = getParameterValues(draft, params);
  const previewWithParams = useMemo(
    () => getParameterAnimation(previewAnimation, selectedParams),
    [previewAnimation, selectedParams],
  );

  const section = draft.sections[sectionIndex] ?? draft.sections[0] ?? DEFAULT_SECTION;
  const { layers, mode } = section;
  const layer = layers[layerIndex] ?? layers[0];
  const sectionPath = `sections.${sectionIndex}`;
  const layerPath = `${sectionPath}.layers.${layerIndex}`;
  const effect = layer && getEffect(layer.effect);
  const fields = useMemo(() => (effect ? getParamFields(effect.params) : []), [effect]);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const lengthUnit = getLengthUnit(mode);
  const generalIssues = [...issues.entries()].filter(
    ([path]) =>
      !path.startsWith(`${layerPath}.params.`) &&
      path !== "name" &&
      !path.startsWith(`${sectionPath}.mode`),
  );

  function load(animation: StoredAnimation | undefined) {
    const next = animation ? getDraft(animation) : NEW_ANIMATION;
    setSelectedId(animation?.id);
    setDraft(next);
    setSaved(next);
    setSectionIndex(0);
    setLayerIndex(0);
    setSelectedParams({});
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

  function updateSection(update: Partial<Section>) {
    setDraft({
      ...draft,
      sections: draft.sections.map((current, index) =>
        index === sectionIndex ? { ...current, ...update } : current,
      ),
    });
  }

  function selectSection(index: number) {
    setSectionIndex(index);
    setLayerIndex(0);
  }

  function updateLayer(update: Partial<Layer>) {
    updateSection({
      layers: layers.map((current, index) =>
        index === layerIndex ? { ...current, ...update } : current,
      ),
    });
  }

  function addLayer(effectId: string) {
    updateSection({
      layers: [...layers, { effect: effectId, params: {}, blend: "normal", opacity: 1 }],
    });
    setLayerIndex(layers.length);
  }

  function moveLayer(index: number, offset: number) {
    const moved = layers[index];
    if (!moved) {
      return;
    }
    updateSection({ layers: layers.toSpliced(index, 1).toSpliced(index + offset, 0, moved) });
    setLayerIndex(index + offset);
  }

  function removeLayer(index: number) {
    updateSection({ layers: layers.toSpliced(index, 1) });
    setLayerIndex(Math.max(0, layerIndex >= index ? layerIndex - 1 : layerIndex));
  }

  function updateParameterValue(key: string, value: unknown) {
    const owner = getValueParameter(draft, key);
    setDraft({
      ...draft,
      parameters: draft.parameters?.map((parameter) =>
        parameter === owner
          ? {
              ...parameter,
              options: parameter.options.map((option) =>
                option.name === params[parameter.name]
                  ? { ...option, values: { ...option.values, [key]: value } }
                  : option,
              ),
            }
          : parameter,
      ),
    });
  }

  function updateParam(key: string, value: unknown) {
    if (!layer) {
      return;
    }
    const reference = getParameterReference(layer.params[key]);
    if (reference !== undefined) {
      updateParameterValue(reference, value);
      return;
    }
    const { [key]: _previous, ...rest } = layer.params;
    updateLayer({ params: value === undefined ? rest : { ...rest, [key]: value } });
  }

  function run(action: () => Promise<unknown>) {
    action()
      .then(() => setError(undefined))
      .catch((cause: unknown) => setError(String(cause)));
  }

  async function save({ shouldNavigate = true } = {}): Promise<string> {
    const animation = animationSchema.parse(draft);
    const stored = selectedId
      ? await api.updateAnimation(selectedId, animation)
      : await api.createAnimation(animation);
    setSelectedId(stored.id);
    if (shouldNavigate) {
      navigate(getEditorPathname(stored.id), { replace: true });
    }
    const next = { ...draft, folder: animation.folder };
    setDraft(next);
    setSaved(next);
    onSaved();
    return stored.id;
  }

  async function remove() {
    if (!selectedId) {
      return;
    }
    await api.deleteAnimation(selectedId);
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
                  {(id: string | null) => (
                    <TruncatedText>
                      {animations?.find((animation) => animation.id === id)?.name ??
                        "New animation"}
                    </TruncatedText>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <AnimationSelectItems animations={animations ?? []} />
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
            <Label htmlFor="animation-folder" className="text-xs text-muted-foreground">
              Folder
            </Label>
            <Input
              id="animation-folder"
              className="h-7 text-xs"
              placeholder="None (use / to nest, e.g. Basics/Wipes)"
              list="animation-folders"
              value={draft.folder ?? ""}
              aria-invalid={issues.has("folder")}
              onChange={(event) =>
                setDraft({ ...draft, folder: event.currentTarget.value || undefined })
              }
            />
            <datalist id="animation-folders">
              {getFolders(animations ?? []).map((folder) => (
                <option key={folder} value={folder} />
              ))}
            </datalist>
          </div>
          {draft.sections.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="animation-section" className="text-xs text-muted-foreground">
                Section
              </Label>
              <Select
                value={sectionIndex}
                onValueChange={(index: number | null) => {
                  if (index !== null) {
                    selectSection(index);
                  }
                }}
              >
                <SelectTrigger id="animation-section" size="sm" className="w-full">
                  <SelectValue>
                    {(index: number) => {
                      const selected = draft.sections[index];
                      return selected && getSectionName(selected, index);
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {draft.sections.map((current, index) => (
                    <SelectItem key={index} value={index}>
                      {getSectionName(current, index)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {draft.parameters?.map((parameter, index) => (
            <div key={parameter.name} className="flex flex-col gap-1.5">
              <Label
                htmlFor={`animation-parameter-${index}`}
                className="text-xs text-muted-foreground"
              >
                {parameter.name}
              </Label>
              <Select
                value={params[parameter.name]}
                onValueChange={(option) =>
                  option !== null &&
                  setSelectedParams({ ...selectedParams, [parameter.name]: option })
                }
              >
                <SelectTrigger id={`animation-parameter-${index}`} size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {parameter.options.map(({ name }) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="animation-length" className="text-xs text-muted-foreground">
              Length
            </Label>
            <div className="flex items-center gap-2">
              <Select
                value={mode.type}
                onValueChange={(type: ModeType | null) => {
                  if (type) {
                    updateSection({ mode: getMode(type, lengthUnit, getModeValue(mode)) });
                  }
                }}
              >
                <SelectTrigger size="sm" className="min-w-0 flex-1" aria-label="Repeat">
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
              <Select
                value={lengthUnit}
                onValueChange={(unit: LengthUnit | null) => {
                  if (unit) {
                    updateSection({ mode: getMode(mode.type, unit, getModeValue(mode)) });
                  }
                }}
              >
                <SelectTrigger size="sm" className="min-w-0 flex-1" aria-label="Length unit">
                  <SelectValue>{(unit: LengthUnit) => lengthUnitLabels[unit]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(lengthUnitLabels).map(([unit, label]) => (
                    <SelectItem key={unit} value={unit}>
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
                step={lengthUnit === "seconds" ? 0.1 : 1}
                aria-invalid={[...issues.keys()].some((path) =>
                  path.startsWith(`${sectionPath}.mode`),
                )}
                value={getModeValue(mode)}
                onChange={(event) =>
                  updateSection({
                    mode: getMode(mode.type, lengthUnit, Number(event.currentTarget.value)),
                  })
                }
              />
            </div>
          </div>
          <Separator />
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs text-muted-foreground">Layers</Label>
              <Select
                value={null}
                onValueChange={(id: string | null) => {
                  if (id) {
                    addLayer(id);
                  }
                }}
              >
                <SelectTrigger size="sm" className="h-6 text-xs" aria-label="Add layer">
                  <PlusIcon />
                  <SelectValue placeholder="Add layer" />
                </SelectTrigger>
                <SelectContent>
                  <EffectSelectItems />
                </SelectContent>
              </Select>
            </div>
            <LayerList
              layers={layers}
              selectedIndex={layerIndex}
              invalidIndexes={getInvalidLayerIndexes(issues, sectionIndex)}
              onSelect={setLayerIndex}
              onMove={moveLayer}
              onRemove={removeLayer}
            />
          </div>
          <Separator />
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
                    <EffectSelectItems />
                  </SelectContent>
                </Select>
              </div>
              {fields.map((field) => (
                <ParamControl
                  key={`${layerIndex}-${layer.effect}-${field.key}`}
                  field={field}
                  value={layer.params[field.key]}
                  parameterValues={parameterValues}
                  clips={clips}
                  error={issues.get(`${layerPath}.params.${field.key}`)}
                  onChange={(value) => updateParam(field.key, value)}
                />
              ))}
              {effect?.kind === "canvas" && (
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="layer-antialias" className="text-xs text-muted-foreground">
                    Antialias
                  </Label>
                  <Switch
                    id="layer-antialias"
                    size="sm"
                    checked={layer.antialias !== false}
                    onCheckedChange={(checked) =>
                      updateLayer({ antialias: checked ? undefined : false })
                    }
                  />
                </div>
              )}
              {(layers.length > 1 || effect?.kind === "filter") && (
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
                        {blendModes.map((blendMode) => (
                          <SelectItem key={blendMode} value={blendMode}>
                            {blendMode}
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
                run(async () =>
                  api.play("simulator", isDirty || !selectedId ? await save() : selectedId, params),
                )
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
          animation={previewWithParams}
          section={sectionIndex}
          bpm={bpm}
          fps={fps}
          showGrid={showGrid}
          onShowGridChange={onShowGridChange}
        />
      )}
    </>
  );
}
