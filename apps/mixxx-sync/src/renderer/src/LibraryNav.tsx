import { cn } from "@led-matrix/ui/lib/utils";
import { ChevronRightIcon, ListMusicIcon, ListVideoIcon, type LucideIcon } from "lucide-react";
import { useState } from "react";
import type { Playlist } from "../../shared/library.ts";
import type { LibrarySelection, LoadState } from "./useLibrary.ts";

const itemClassName =
  "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-muted-foreground outline-none hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:shrink-0";

function NavItem({
  icon: Icon,
  label,
  detail,
  isActive,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  detail?: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={isActive ? "page" : undefined}
      onClick={onClick}
      className={cn(itemClassName, isActive && "bg-muted text-foreground hover:bg-muted")}
    >
      <Icon />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {detail && <span className="font-mono text-xs tabular-nums">{detail}</span>}
    </button>
  );
}

export function LibraryNav({
  playlists,
  selection,
  onSelect,
}: {
  playlists: LoadState<Playlist[]>;
  selection: LibrarySelection;
  onSelect: (selection: LibrarySelection) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <nav className="flex w-56 shrink-0 flex-col gap-1 overflow-y-auto border-r p-2 scrollbar-thin">
      <NavItem
        icon={ListMusicIcon}
        label="Tracks"
        isActive={selection.type === "all"}
        onClick={() => onSelect({ type: "all" })}
      />
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded(!isExpanded)}
        className={itemClassName}
      >
        <ChevronRightIcon className={cn("transition-transform", isExpanded && "rotate-90")} />
        <span className="flex-1">Playlists</span>
      </button>
      {isExpanded && (
        <ul className="flex flex-col gap-1 pl-4">
          {playlists.status === "error" && (
            <li className="px-2 text-xs text-destructive">{playlists.error}</li>
          )}
          {playlists.status === "loaded" && playlists.value.length === 0 && (
            <li className="px-2 text-xs text-muted-foreground">No playlists</li>
          )}
          {playlists.status === "loaded" &&
            playlists.value.map((playlist) => (
              <li key={playlist.id}>
                <NavItem
                  icon={ListVideoIcon}
                  label={playlist.name}
                  detail={String(playlist.trackCount)}
                  isActive={selection.type === "playlist" && selection.playlistId === playlist.id}
                  onClick={() => onSelect({ type: "playlist", playlistId: playlist.id })}
                />
              </li>
            ))}
        </ul>
      )}
    </nav>
  );
}
