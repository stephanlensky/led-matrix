import type { ClipInfo, StoredAnimation } from "@led-matrix/core";
import { FilmIcon, MonitorIcon, PencilRulerIcon, RadioTowerIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, browserClips } from "./api.ts";
import { Clips } from "./Clips.tsx";
import { Device } from "./Device.tsx";
import { Editor } from "./Editor.tsx";
import { Navigation, type NavigationItem } from "@led-matrix/ui/components/navigation";
import { Simulator } from "./Simulator.tsx";
import { navigate, usePathname } from "./usePathname.ts";
import { useStream } from "./useStream.ts";
import { TooltipProvider } from "@led-matrix/ui/components/tooltip";
import { ClipsContext } from "@led-matrix/ui/lib/clips";

type View = "simulator" | "device" | "editor" | "clips";

type Route =
  | { view: "simulator" }
  | { view: "device" }
  | { view: "editor"; animationId: string | undefined }
  | { view: "clips"; clipId: string | undefined };

function getRoute(pathname: string): Route {
  const [section, id] = pathname.split("/").filter(Boolean);
  const decodedId = id && decodeURIComponent(id);
  if (section === "device") {
    return { view: "device" };
  }
  if (section === "editor") {
    return { view: "editor", animationId: decodedId };
  }
  if (section === "clips") {
    return { view: "clips", clipId: decodedId };
  }
  return { view: "simulator" };
}

const views: readonly NavigationItem<View>[] = [
  { id: "simulator", label: "Simulator", icon: MonitorIcon },
  { id: "device", label: "Device", icon: RadioTowerIcon },
  { id: "editor", label: "Editor", icon: PencilRulerIcon },
  { id: "clips", label: "Clips", icon: FilmIcon },
];

const DEFAULT_BPM = 120;
const DEFAULT_FPS = 30;

export function App() {
  const stream = useStream("simulator");
  const deviceStream = useStream("device");
  const [animations, setAnimations] = useState<StoredAnimation[]>();
  const [clips, setClips] = useState<ClipInfo[]>();
  const [showGrid, setShowGrid] = useState(true);
  const pathname = usePathname();
  const route = getRoute(pathname);
  const [editorPathname, setEditorPathname] = useState("/editor");
  if (route.view === "editor" && pathname !== editorPathname) {
    setEditorPathname(pathname);
  }
  const [clipsPathname, setClipsPathname] = useState("/clips");
  if (route.view === "clips" && pathname !== clipsPathname) {
    setClipsPathname(pathname);
  }
  const viewPathnames: Readonly<Record<View, string>> = {
    simulator: "/simulator",
    device: "/device",
    editor: editorPathname,
    clips: clipsPathname,
  };
  const [error, setError] = useState<string>();

  const refreshAnimations = useCallback(
    () =>
      api
        .getAnimations()
        .then((result) => {
          setAnimations(result);
          setError(undefined);
        })
        .catch((cause: unknown) => setError(String(cause))),
    [],
  );

  const refreshClips = useCallback(() => {
    api
      .getClips()
      .then((result) => {
        setClips(result);
        setError(undefined);
      })
      .catch((cause: unknown) => setError(String(cause)));
  }, []);

  useEffect(() => {
    if (stream.isConnected) {
      void refreshAnimations();
      refreshClips();
    }
  }, [stream.isConnected, refreshAnimations, refreshClips]);

  return (
    <ClipsContext value={browserClips}>
      <TooltipProvider>
        <div className="flex h-svh overflow-hidden">
          <Navigation
            items={views}
            activeId={route.view}
            onSelect={(view) => navigate(viewPathnames[view])}
          />
          <main className="grid min-w-0 flex-1 grid-cols-1 gap-6 overflow-y-auto p-6 md:grid-cols-[auto_minmax(0,1fr)]">
            {error && <p className="text-sm text-destructive md:col-span-2">{error}</p>}
            <div className={route.view === "simulator" ? "contents" : "hidden"}>
              <Simulator
                stream={stream}
                animations={animations ?? []}
                showGrid={showGrid}
                onShowGridChange={setShowGrid}
              />
            </div>
            <div className={route.view === "device" ? "contents" : "hidden"}>
              <Device
                stream={deviceStream}
                animations={animations ?? []}
                showGrid={showGrid}
                onShowGridChange={setShowGrid}
              />
            </div>
            <div className={route.view === "editor" ? "contents" : "hidden"}>
              <Editor
                isVisible={route.view === "editor"}
                animationId={route.view === "editor" ? route.animationId : undefined}
                animations={animations}
                clips={clips ?? []}
                bpm={stream.state?.bpm ?? DEFAULT_BPM}
                fps={stream.state?.fps ?? DEFAULT_FPS}
                showGrid={showGrid}
                onShowGridChange={setShowGrid}
                onSaved={refreshAnimations}
              />
            </div>
            <div className={route.view === "clips" ? "contents" : "hidden"}>
              <Clips
                isVisible={route.view === "clips"}
                clipId={route.view === "clips" ? route.clipId : undefined}
                clips={clips}
                bpm={stream.state?.bpm ?? DEFAULT_BPM}
                fps={stream.state?.fps ?? DEFAULT_FPS}
                showGrid={showGrid}
                onShowGridChange={setShowGrid}
                onClipsChanged={refreshClips}
                onAnimationsChanged={refreshAnimations}
              />
            </div>
          </main>
        </div>
      </TooltipProvider>
    </ClipsContext>
  );
}
