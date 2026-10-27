import { useState } from "react";
import type { Settings } from "../../shared/api.ts";
import { AnimationPanel, useAnimations } from "./AnimationPanel.tsx";
import { LibraryNav } from "./LibraryNav.tsx";
import { TrackList } from "./TrackList.tsx";
import {
  type LibrarySelection,
  createTrackDataCache,
  usePlaylists,
  useTracks,
} from "./useLibrary.ts";
import { useMapping } from "./useMapping.ts";
import { useSettings } from "./useSettings.ts";

function getSelectionTitle(
  selection: LibrarySelection,
  playlists: ReturnType<typeof usePlaylists>,
): string {
  if (selection.type === "all") {
    return "Tracks";
  }
  const playlist =
    playlists.status === "loaded"
      ? playlists.value.find(({ id }) => id === selection.playlistId)
      : undefined;
  return playlist?.name ?? "Playlist";
}

function EditorContent({ settings }: { settings: Settings }) {
  const [selection, setSelection] = useState<LibrarySelection>({ type: "all" });
  const playlists = usePlaylists();
  const tracks = useTracks(selection);
  const animations = useAnimations(settings.serverUrl);
  const mapping = useMapping();
  const [cache] = useState(createTrackDataCache);

  return (
    <div className="flex h-full">
      <LibraryNav playlists={playlists} selection={selection} onSelect={setSelection} />
      <TrackList
        title={getSelectionTitle(selection, playlists)}
        tracks={tracks}
        mapping={mapping.mapping}
        mappingError={mapping.error}
        cache={cache}
      />
      <AnimationPanel animations={animations} />
    </div>
  );
}

export function Editor() {
  const settings = useSettings();
  return settings ? <EditorContent key={settings.mixxxDatabasePath} settings={settings} /> : null;
}
