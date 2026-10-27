import { Navigation, type NavigationItem } from "@led-matrix/ui/components/navigation";
import { TooltipProvider } from "@led-matrix/ui/components/tooltip";
import { PencilRulerIcon, RadioTowerIcon } from "lucide-react";
import { useState } from "react";
import { Daemon } from "./Daemon.tsx";

type View = "daemon" | "editor";

const views: readonly NavigationItem<View>[] = [
  { id: "daemon", label: "Daemon", icon: RadioTowerIcon },
  { id: "editor", label: "Editor", icon: PencilRulerIcon },
];

export function App() {
  const [view, setView] = useState<View>("daemon");

  return (
    <TooltipProvider>
      <div className="flex h-screen overflow-hidden">
        <Navigation items={views} activeId={view} onSelect={setView} />
        <main className="min-w-0 flex-1 overflow-y-auto scrollbar-thin">
          <div className={view === "daemon" ? "contents" : "hidden"}>
            <Daemon />
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}
