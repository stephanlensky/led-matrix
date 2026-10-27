import type { Output, PlaybackState, StoredAnimation } from "@led-matrix/core";
import { SearchIcon } from "lucide-react";
import { memo, useMemo, useRef, useState } from "react";
import { AnimationList } from "@led-matrix/ui/components/animation-list";
import { api } from "./api.ts";
import { Input } from "@led-matrix/ui/components/input";
import { Label } from "@led-matrix/ui/components/label";
import { Separator } from "@led-matrix/ui/components/separator";
import { Switch } from "@led-matrix/ui/components/switch";

const BPM_DEBOUNCE_MS = 300;

function getValidBpm(value: string): number | undefined {
  const bpm = Number(value);
  return value.trim() !== "" && Number.isFinite(bpm) && bpm > 0 ? bpm : undefined;
}

type PlaybackControlsProps = {
  output: Output;
  state: PlaybackState | undefined;
  animations: readonly StoredAnimation[];
  showGrid: boolean;
  onShowGridChange: (showGrid: boolean) => void;
};

function getMatches(items: readonly StoredAnimation[], query: string): StoredAnimation[] {
  const normalizedQuery = query.trim().toLowerCase();
  return items.filter((item) =>
    [item.name, item.folder ?? ""].some((text) => text.toLowerCase().includes(normalizedQuery)),
  );
}

export const PlaybackControls = memo(function PlaybackControls({
  output,
  state,
  animations,
  showGrid,
  onShowGridChange,
}: PlaybackControlsProps) {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => getMatches(animations, query), [animations, query]);
  const [error, setError] = useState<string>();
  const [bpmDraft, setBpmDraft] = useState<string>();
  const bpmTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  function run(action: () => Promise<unknown>) {
    action()
      .then(() => setError(undefined))
      .catch((cause: unknown) => setError(String(cause)));
  }

  function commitBpm(value: string) {
    const bpm = getValidBpm(value);
    if (bpm !== undefined && bpm !== state?.bpm) {
      run(() => api.setBpm(output, bpm));
    }
  }

  function scheduleBpm(value: string) {
    clearTimeout(bpmTimeout.current);
    bpmTimeout.current = setTimeout(() => commitBpm(value), BPM_DEBOUNCE_MS);
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={`${output}-bpm`}>BPM</Label>
        <Input
          id={`${output}-bpm`}
          className="w-24"
          type="number"
          min={0}
          value={bpmDraft ?? String(state?.bpm ?? 120)}
          onChange={(event) => {
            setBpmDraft(event.target.value);
            scheduleBpm(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
          onBlur={(event) => {
            clearTimeout(bpmTimeout.current);
            commitBpm(event.currentTarget.value);
            setBpmDraft(undefined);
          }}
        />
      </div>
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={`${output}-pixel-grid`}>Pixel grid</Label>
        <Switch id={`${output}-pixel-grid`} checked={showGrid} onCheckedChange={onShowGridChange} />
      </div>
      <Separator />
      <div className="flex min-h-0 flex-col gap-3">
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
        <div className="-mx-(--card-spacing) min-h-24 overflow-y-auto overscroll-contain scrollbar-thin">
          <AnimationList
            animations={matches}
            isExpanded={query.trim() !== ""}
            activeId={state?.animationId}
            activeSection={state?.section?.index}
            onPlay={(id) => run(() => api.play(output, id))}
            onSelectSection={(index) => run(() => api.seek(output, index, 0))}
          />
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </>
  );
});
