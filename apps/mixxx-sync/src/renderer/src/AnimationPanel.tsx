import type { StoredAnimation } from "@led-matrix/core";
import { AnimationList } from "@led-matrix/ui/components/animation-list";
import { ListEmpty } from "@led-matrix/ui/components/list-row";
import type { ApiClient } from "@led-matrix/ui/lib/api";
import { type ReactNode, useCallback, useState } from "react";
import { setCueDrag } from "./cue-drag.ts";
import { type LoadState, useLoad } from "./useLibrary.ts";

export function useAnimations(api: ApiClient): LoadState<StoredAnimation[]> {
  const load = useCallback(() => api.getAnimations(), [api]);
  return useLoad(load);
}

export function AnimationPanel({
  animations,
  simulator,
}: {
  animations: LoadState<StoredAnimation[]>;
  simulator: ReactNode;
}) {
  const [activeId, setActiveId] = useState<string>();
  const [activeSection, setActiveSection] = useState<number>();

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
        activeId={activeId}
        activeSection={activeSection}
        onPlay={(id) => {
          setActiveId(id);
          setActiveSection(undefined);
        }}
        onSelectSection={setActiveSection}
        onDragStart={(event, animationId, section) =>
          setCueDrag(event, section === undefined ? { animationId } : { animationId, section })
        }
      />
    );
  }

  return (
    <aside className="flex w-96 shrink-0 flex-col border-l">
      {simulator}
      <h3 className="border-y px-3 py-2 text-sm font-medium">Animations</h3>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">{getList()}</div>
    </aside>
  );
}
