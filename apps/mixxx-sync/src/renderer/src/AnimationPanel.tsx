import type { StoredAnimation } from "@led-matrix/core";
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

export function AnimationPanel({
  animations,
  simulator,
  preview,
  onPreviewChange,
}: {
  animations: LoadState<StoredAnimation[]>;
  simulator: ReactNode;
  preview: AnimationPreview | undefined;
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
        onPlay={(animationId) => onPreviewChange({ animationId, section: undefined })}
        onSelectSection={(section) =>
          preview && onPreviewChange({ animationId: preview.animationId, section })
        }
        onDragStart={(event, animationId, section) =>
          setCueDrag(event, section === undefined ? { animationId } : { animationId, section })
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
      <h3 className="border-y px-3 py-2 text-sm font-medium">Animations</h3>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">{getList()}</div>
    </aside>
  );
}
