import { type StoredAnimation, FOLDER_SEPARATOR, getFolderPath } from "./animation.ts";

export type AnimationFolder = {
  name: string;
  path: string;
  folders: AnimationFolder[];
  animations: StoredAnimation[];
};

function compareNames(first: { name: string }, second: { name: string }): number {
  return first.name.localeCompare(second.name, undefined, { numeric: true });
}

function sortFolder(folder: AnimationFolder): AnimationFolder {
  return {
    ...folder,
    folders: folder.folders.map(sortFolder).toSorted(compareNames),
    animations: folder.animations.toSorted(compareNames),
  };
}

export function getFolderTree(animations: readonly StoredAnimation[]): AnimationFolder {
  const root: AnimationFolder = { name: "", path: "", folders: [], animations: [] };
  for (const animation of animations) {
    let folder = root;
    for (const name of getFolderPath(animation.folder)) {
      const path = folder.path ? `${folder.path}${FOLDER_SEPARATOR}${name}` : name;
      let child = folder.folders.find((current) => current.path === path);
      if (!child) {
        child = { name, path, folders: [], animations: [] };
        folder.folders.push(child);
      }
      folder = child;
    }
    folder.animations.push(animation);
  }
  return sortFolder(root);
}

export function getFolderAncestors(folder: string | undefined): string[] {
  return getFolderPath(folder).map((_, index, path) =>
    path.slice(0, index + 1).join(FOLDER_SEPARATOR),
  );
}

export function getAnimationCount(folder: AnimationFolder): number {
  return folder.folders.reduce(
    (count, child) => count + getAnimationCount(child),
    folder.animations.length,
  );
}

export function getFolders(animations: readonly StoredAnimation[]): string[] {
  return [...new Set(animations.flatMap(({ folder }) => getFolderAncestors(folder)))].toSorted();
}
