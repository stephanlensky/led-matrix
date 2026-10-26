import type { StoredAnimation } from "@led-matrix/core";
import { MonitorIcon, PencilRulerIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getAnimations } from "./api.ts";
import { Editor } from "./Editor.tsx";
import { Navigation, type NavigationItem } from "./Navigation.tsx";
import { Simulator } from "./Simulator.tsx";
import { useStream } from "./useStream.ts";
import { TooltipProvider } from "@/components/ui/tooltip";

type View = "simulator" | "editor";

const views: readonly NavigationItem<View>[] = [
  { id: "simulator", label: "Simulator", icon: MonitorIcon },
  { id: "editor", label: "Editor", icon: PencilRulerIcon },
];

const DEFAULT_BPM = 120;
const DEFAULT_FPS = 30;

export function App() {
  const stream = useStream();
  const [animations, setAnimations] = useState<StoredAnimation[]>([]);
  const [showGrid, setShowGrid] = useState(true);
  const [view, setView] = useState<View>("simulator");
  const [error, setError] = useState<string>();

  const refreshAnimations = useCallback(() => {
    getAnimations()
      .then((result) => {
        setAnimations(result);
        setError(undefined);
      })
      .catch((cause: unknown) => setError(String(cause)));
  }, []);

  useEffect(() => {
    if (stream.isConnected) {
      refreshAnimations();
    }
  }, [stream.isConnected, refreshAnimations]);

  return (
    <TooltipProvider>
      <div className="flex h-svh overflow-hidden">
        <Navigation items={views} activeId={view} onSelect={setView} />
        <main className="grid min-w-0 flex-1 grid-cols-1 gap-6 overflow-y-auto p-6 md:grid-cols-[auto_minmax(0,1fr)]">
          {error && <p className="text-sm text-destructive md:col-span-2">{error}</p>}
          <div className={view === "simulator" ? "contents" : "hidden"}>
            <Simulator
              stream={stream}
              animations={animations}
              showGrid={showGrid}
              onShowGridChange={setShowGrid}
            />
          </div>
          <div className={view === "editor" ? "contents" : "hidden"}>
            <Editor
              isVisible={view === "editor"}
              animations={animations}
              bpm={stream.state?.bpm ?? DEFAULT_BPM}
              fps={stream.state?.fps ?? DEFAULT_FPS}
              showGrid={showGrid}
              onShowGridChange={setShowGrid}
              onSaved={refreshAnimations}
            />
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}
