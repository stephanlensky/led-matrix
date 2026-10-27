import type { StoredAnimation } from "@led-matrix/core";
import { Label } from "@led-matrix/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@led-matrix/ui/components/select";
import { AnimationList } from "@led-matrix/ui/components/animation-list";
import { ListEmpty } from "@led-matrix/ui/components/list-row";
import type { ApiClient } from "@led-matrix/ui/lib/api";
import { type ReactNode, useCallback, useRef } from "react";
import { setCueDrag } from "./cue-drag.ts";
import type { AnimationPreview } from "./Playback.tsx";
import { ResizeHandle, useStoredSize } from "./ResizeHandle.tsx";
import { type LoadState, useLoad } from "./useLibrary.ts";

const LIST_MIN_HEIGHT = 120;

export function useAnimations(api: ApiClient): LoadState<StoredAnimation[]> {
  const load = useCallback(() => api.getAnimations(), [api]);
  return useLoad(load);
}

export type CuePreset = {
  animation: StoredAnimation;
  preset: string | undefined;
  onChange: (preset: string) => void;
};

function CuePresetSelect({ animation, preset, onChange }: CuePreset) {
  const value = preset ?? animation.presets?.[0]?.name ?? null;
  return (
    <div className="flex items-center gap-3 border-t px-3 py-2">
      <Label htmlFor="cue-preset" className="shrink-0 text-xs text-muted-foreground">
        Cue preset
      </Label>
      <Select
        value={value}
        onValueChange={(next: string | null) => {
          if (next !== null) {
            onChange(next);
          }
        }}
      >
        <SelectTrigger id="cue-preset" size="sm" className="min-w-0 flex-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {animation.presets?.map(({ name }) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function AnimationPanel({
  animations,
  simulator,
  preview,
  cuePreset,
  onPreviewChange,
}: {
  animations: LoadState<StoredAnimation[]>;
  simulator: ReactNode;
  preview: AnimationPreview | undefined;
  cuePreset: CuePreset | undefined;
  onPreviewChange: (preview: AnimationPreview | undefined) => void;
}) {
  const asideRef = useRef<HTMLElement>(null);
  const width = useStoredSize("editor.panelWidth", 384, 280, 800);
  const simulatorHeight = useStoredSize("editor.simulatorHeight", 400, 160, 1600);

  function getList() {
    if (animations.status === "error") {
      return (
        <ListEmpty>
          <span className="text-destructive">{animations.error}</span>
          <br />
          Check the server URL in Settings.
        </ListEmpty>
      );
    }
    if (animations.status === "loading") {
      return <ListEmpty>Loading animations…</ListEmpty>;
    }
    return (
      <AnimationList
        animations={animations.value}
        activeId={preview?.animationId}
        activeSection={preview?.section}
        activePreset={preview?.preset}
        onPlay={(animationId) =>
          onPreviewChange({ animationId, section: undefined, preset: undefined })
        }
        onSelectSection={(section) => preview && onPreviewChange({ ...preview, section })}
        onSelectPreset={(preset) => preview && onPreviewChange({ ...preview, preset })}
        onDragStart={(event, { animationId, section, preset }) =>
          setCueDrag(event, {
            animationId,
            ...(section === undefined ? {} : { section }),
            ...(preset === undefined ? {} : { preset }),
          })
        }
      />
    );
  }

  return (
    <aside
      ref={asideRef}
      className="relative flex shrink-0 flex-col border-l"
      style={{ width: width.value }}
    >
      <ResizeHandle axis="x" direction={-1} size={width} className="left-0 -translate-x-1/2" />
      <div className="relative min-h-0 shrink p-4" style={{ height: simulatorHeight.value }}>
        {simulator}
        <ResizeHandle
          axis="y"
          direction={1}
          size={simulatorHeight}
          getMax={() => (asideRef.current?.clientHeight ?? 0) - LIST_MIN_HEIGHT}
          className="bottom-0 translate-y-1/2"
        />
      </div>
      {cuePreset && <CuePresetSelect {...cuePreset} />}
      <h3 className="border-y px-3 py-2 text-sm font-medium">Animations</h3>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">{getList()}</div>
    </aside>
  );
}
