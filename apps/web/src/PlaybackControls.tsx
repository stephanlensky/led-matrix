import type { Output, PlaybackState, StoredAnimation } from "@led-matrix/core";
import { SearchIcon, SquareIcon } from "lucide-react";
import { useState } from "react";
import { AnimationList } from "./AnimationList.tsx";
import { play, setBpm, stop } from "./api.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

type PlaybackControlsProps = {
  output: Output;
  state: PlaybackState | undefined;
  animations: readonly StoredAnimation[];
  showGrid: boolean;
  onShowGridChange: (showGrid: boolean) => void;
};

function getMatches(items: readonly StoredAnimation[], query: string): StoredAnimation[] {
  const normalizedQuery = query.trim().toLowerCase();
  return items.filter((item) => item.name.toLowerCase().includes(normalizedQuery));
}

export function PlaybackControls({
  output,
  state,
  animations,
  showGrid,
  onShowGridChange,
}: PlaybackControlsProps) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string>();

  function run(action: () => Promise<unknown>) {
    action()
      .then(() => setError(undefined))
      .catch((cause: unknown) => setError(String(cause)));
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={`${output}-bpm`}>BPM</Label>
        <Input
          id={`${output}-bpm`}
          key={state?.bpm}
          className="w-24"
          type="number"
          min={20}
          max={300}
          defaultValue={state?.bpm ?? 120}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
          onBlur={(event) => {
            const bpm = Number(event.currentTarget.value);
            if (bpm !== state?.bpm) {
              run(() => setBpm(output, bpm));
            }
          }}
        />
      </div>
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={`${output}-pixel-grid`}>Pixel grid</Label>
        <Switch id={`${output}-pixel-grid`} checked={showGrid} onCheckedChange={onShowGridChange} />
      </div>
      <Separator />
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">Animations</h3>
        <div className="relative">
          <SearchIcon className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-7 pl-8 text-xs"
            placeholder="Search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="-mx-(--card-spacing)">
          <AnimationList
            animations={getMatches(animations, query)}
            activeId={state?.animationId}
            onPlay={(id) => run(() => play(output, id))}
          />
        </div>
      </div>
      <Button
        variant="outline"
        onClick={() => run(() => stop(output))}
        disabled={!state?.animationId}
      >
        <SquareIcon />
        Stop
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </>
  );
}
