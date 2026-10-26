import { type ParamField, keyframeTrackSchema } from "@led-matrix/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type ParamControlProps = {
  field: ParamField;
  value: unknown;
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

function getControl(
  id: string,
  field: ParamField,
  value: unknown,
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

export function ParamControl({ field, value, error, onChange }: ParamControlProps) {
  const id = `param-${field.key}`;
  const track = keyframeTrackSchema.safeParse(value);
  const isInline = field.type === "boolean" && !track.success;

  return (
    <div className={isInline ? "flex items-center justify-between gap-4" : "flex flex-col gap-1.5"}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {field.label}
      </Label>
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
        getControl(id, field, value, onChange)
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
