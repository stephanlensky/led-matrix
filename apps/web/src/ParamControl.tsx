import {
  type ClipInfo,
  type ParamField,
  getPresetReference,
  keyframeTrackSchema,
} from "@led-matrix/core";
import { Button } from "@led-matrix/ui/components/button";
import { Input } from "@led-matrix/ui/components/input";
import { Label } from "@led-matrix/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@led-matrix/ui/components/select";
import { Slider } from "@led-matrix/ui/components/slider";
import { Switch } from "@led-matrix/ui/components/switch";
import { Textarea } from "@led-matrix/ui/components/textarea";

type ParamControlProps = {
  field: ParamField;
  value: unknown;
  presetValues: Readonly<Record<string, unknown>>;
  clips: readonly ClipInfo[];
  error: string | undefined;
  onChange: (value: unknown) => void;
};

function roundToStep(value: number, step: number): number {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  return Number((Math.round(value / step) * step).toFixed(decimals));
}

function NumberControl({
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: Extract<ParamField, { type: "number" }>;
  value: number | undefined;
  onChange: (value: unknown) => void;
}) {
  const { min, max, step } = field;
  return (
    <div className="flex items-center gap-3">
      {min !== undefined && max !== undefined && value !== undefined && (
        <Slider
          aria-label={field.label}
          min={min}
          max={max}
          step={step}
          value={value}
          onValueChange={(next) =>
            onChange(roundToStep(Array.isArray(next) ? next[0] : next, step))
          }
        />
      )}
      <Input
        id={id}
        type="number"
        className="h-7 w-20 shrink-0 font-mono text-xs tabular-nums"
        min={min}
        max={max}
        step={step}
        placeholder={field.isOptional ? "Auto" : undefined}
        value={value ?? ""}
        onChange={(event) => {
          const text = event.currentTarget.value;
          onChange(text === "" ? undefined : Number(text));
        }}
      />
    </div>
  );
}

function ColorControl({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: unknown) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        aria-label={label}
        className="h-7 w-10 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      <Input
        id={id}
        className="h-7 font-mono text-xs"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </div>
  );
}

function ClipControl({
  id,
  value,
  clips,
  onChange,
}: {
  id: string;
  value: string;
  clips: readonly ClipInfo[];
  onChange: (value: unknown) => void;
}) {
  return (
    <Select value={value || null} onValueChange={onChange}>
      <SelectTrigger id={id} size="sm" className="w-full">
        <SelectValue placeholder="Select a clip">
          {(clipId: string | null) =>
            clips.find((clip) => clip.id === clipId)?.name ?? clipId ?? "Select a clip"
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {clips.map((clip) => (
          <SelectItem key={clip.id} value={clip.id}>
            {clip.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function getControl(
  id: string,
  field: ParamField,
  value: unknown,
  clips: readonly ClipInfo[],
  onChange: (value: unknown) => void,
) {
  switch (field.type) {
    case "number":
      return (
        <NumberControl
          id={id}
          field={field}
          value={typeof value === "number" ? value : field.defaultValue}
          onChange={onChange}
        />
      );
    case "color":
      return (
        <ColorControl
          id={id}
          label={field.label}
          value={typeof value === "string" ? value : (field.defaultValue ?? "#000000")}
          onChange={onChange}
        />
      );
    case "clip":
      return (
        <ClipControl
          id={id}
          value={typeof value === "string" ? value : (field.defaultValue ?? "")}
          clips={clips}
          onChange={onChange}
        />
      );
    case "boolean":
      return (
        <Switch
          id={id}
          checked={typeof value === "boolean" ? value : (field.defaultValue ?? false)}
          onCheckedChange={onChange}
        />
      );
    case "enum":
      return (
        <Select
          value={typeof value === "string" ? value : (field.defaultValue ?? null)}
          onValueChange={onChange}
        >
          <SelectTrigger id={id} size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
  }
  const text = typeof value === "string" ? value : (field.defaultValue ?? "");
  return field.isMultiline ? (
    <Textarea
      id={id}
      className="min-h-12 text-xs"
      maxLength={field.maxLength}
      value={text}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  ) : (
    <Input
      id={id}
      className="h-7 text-xs"
      maxLength={field.maxLength}
      value={text}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}

export function ParamControl({
  field,
  value,
  presetValues,
  clips,
  error,
  onChange,
}: ParamControlProps) {
  const id = `param-${field.key}`;
  const reference = getPresetReference(value);
  const resolved = reference === undefined ? value : presetValues[reference];
  const track = keyframeTrackSchema.safeParse(resolved);
  const isInline = field.type === "boolean" && !track.success && reference === undefined;

  return (
    <div className={isInline ? "flex items-center justify-between gap-4" : "flex flex-col gap-1.5"}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="text-xs text-muted-foreground">
          {field.label}
        </Label>
        {reference !== undefined && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            Preset · <span className="font-mono">{reference}</span>
          </span>
        )}
      </div>
      {track.success ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-dashed px-2.5 py-1.5 text-xs text-muted-foreground">
          <span>Animated · {track.data.keyframes.length} keyframes</span>
          <Button
            id={id}
            variant="ghost"
            size="xs"
            onClick={() => onChange(track.data.keyframes[0]?.value)}
          >
            Make static
          </Button>
        </div>
      ) : (
        getControl(id, field, resolved, clips, onChange)
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
