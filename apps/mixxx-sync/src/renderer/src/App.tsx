import { Navigation, type NavigationItem } from "@led-matrix/ui/components/navigation";
import { TooltipProvider } from "@led-matrix/ui/components/tooltip";
import { PencilRulerIcon, RadioTowerIcon, SettingsIcon } from "lucide-react";
import { useState } from "react";
import { Daemon } from "./Daemon.tsx";
import { Editor } from "./Editor.tsx";
import { Settings } from "./Settings.tsx";
import { useStoredState } from "./useStoredState.ts";

type View = "daemon" | "editor" | "settings";

const views: readonly NavigationItem<View>[] = [
  { id: "daemon", label: "Daemon", icon: RadioTowerIcon },
  { id: "editor", label: "Editor", icon: PencilRulerIcon },
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
          {hasOpenedEditor && (
            <div className={view === "editor" ? "contents" : "hidden"}>
              <Editor />
            </div>
          )}
          <div className={view === "settings" ? "contents" : "hidden"}>
            <Settings />
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}
