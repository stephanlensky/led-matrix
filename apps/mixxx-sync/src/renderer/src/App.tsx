import { Navigation, type NavigationItem } from "@led-matrix/ui/components/navigation";
import { TooltipProvider } from "@led-matrix/ui/components/tooltip";
import { CpuIcon, FilmIcon, PencilRulerIcon, RadioTowerIcon, SettingsIcon } from "lucide-react";
import { useState } from "react";
import { Daemon } from "./Daemon.tsx";
import { Device } from "./Device.tsx";
import { Editor } from "./Editor.tsx";
import { Recordings } from "./Recordings.tsx";
import { Settings } from "./Settings.tsx";
import { useStoredState } from "./useStoredState.ts";

type View = "daemon" | "device" | "editor" | "recordings" | "settings";

const views: readonly NavigationItem<View>[] = [
  { id: "daemon", label: "Daemon", icon: RadioTowerIcon },
  { id: "device", label: "Device", icon: CpuIcon },
  { id: "editor", label: "Editor", icon: PencilRulerIcon },
  { id: "recordings", label: "Recordings", icon: FilmIcon },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

function getView(value: unknown): View | undefined {
  return views.find(({ id }) => id === value)?.id;
}

export function App() {
  const [view, setView] = useStoredState<View>("app.view", "daemon", getView);
  const [hasOpenedEditor, setHasOpenedEditor] = useState(false);
  if (view === "editor" && !hasOpenedEditor) {
    setHasOpenedEditor(true);
  }

  return (
    <TooltipProvider>
      <div className="flex h-screen overflow-hidden">
        <Navigation items={views} activeId={view} onSelect={setView} />
        <main className="min-w-0 flex-1 overflow-y-auto scrollbar-thin">
          <div className={view === "daemon" ? "contents" : "hidden"}>
            <Daemon />
          </div>
          {view === "device" && <Device />}
          {hasOpenedEditor && (
            <div className={view === "editor" ? "contents" : "hidden"}>
              <Editor />
            </div>
          )}
          {view === "recordings" && <Recordings />}
          <div className={view === "settings" ? "contents" : "hidden"}>
            <Settings />
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}
