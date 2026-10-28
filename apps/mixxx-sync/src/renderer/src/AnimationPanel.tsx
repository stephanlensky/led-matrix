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

export type CueParams = {
  animation: StoredAnimation;
  values: Partial<Record<string, string>>;
  count: number;
  onChange: (name: string, option: string) => void;
};

function CueParamSelects({ animation, values, count, onChange }: CueParams) {
  const parameters = animation.parameters?.filter(({ options }) => options.length > 1) ?? [];
  return (
    <div className="flex flex-col gap-1.5 border-t px-3 py-2">
      {count > 1 && (
        <p className="text-xs text-muted-foreground">
          {count} {animation.name} clips
        </p>
      )}
      {parameters.map((parameter, index) => (
        <div key={parameter.name} className="flex items-center gap-3">
          <Label
            htmlFor={`cue-parameter-${index}`}
            className="w-20 shrink-0 truncate text-xs text-muted-foreground"
          >
            {parameter.name}
          </Label>
          <Select
            value={values[parameter.name] ?? null}
            onValueChange={(option: string | null) => {
              if (option !== null) {
                onChange(parameter.name, option);
              }
            }}
          >
            <SelectTrigger id={`cue-parameter-${index}`} size="sm" className="min-w-0 flex-1">
              <SelectValue placeholder="Mixed" />
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
    </div>
  );
}

export function AnimationPanel({
  animations,
  simulator,
  preview,
  cueParams,
  selectedIds,
  onPreviewChange,
}: {
  animations: LoadState<StoredAnimation[]>;
  simulator: ReactNode;
  preview: AnimationPreview | undefined;
  cueParams: CueParams | undefined;
  selectedIds: ReadonlySet<string>;
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
        activeParams={preview?.params}
        selectedIds={selectedIds}
        onPlay={(animationId) =>
          onPreviewChange({ animationId, section: undefined, params: undefined })
        }
        onSelectSection={(section) => preview && onPreviewChange({ ...preview, section })}
        onSelectParam={(name, option) =>
          preview && onPreviewChange({ ...preview, params: { ...preview.params, [name]: option } })
        }
        onDragStart={(event, { animationId, section, params }) =>
          setCueDrag(event, {
            animationId,
            ...(section === undefined ? {} : { section }),
            ...(params === undefined ? {} : { params }),
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
      {cueParams && <CueParamSelects {...cueParams} />}
      <h3 className="border-y px-3 py-2 text-sm font-medium">Animations</h3>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">{getList()}</div>
    </aside>
  );
}
