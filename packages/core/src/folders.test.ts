import { describe, expect, it } from "vitest";
import { type StoredAnimation, animationSchema } from "./animation.ts";
import { getAnimationCount, getFolderTree, getFolders } from "./folders.ts";

function getAnimation(id: string, folder?: string): StoredAnimation {
  return {
    id,
    name: id,
    folder,
    sections: [{ mode: { type: "loop", beats: 1 }, layers: [] }],
  };
}

function getParsedFolder(folder: string): string | undefined {
  return animationSchema.parse({
    name: "Plasma",
    folder,
    sections: [{ mode: { type: "loop", beats: 4 }, layers: [{ effect: "plasma" }] }],
  }).folder;
}

describe("animationSchema folder", () => {
  it("normalizes folder paths", () => {
    expect(getParsedFolder(" Basics / Wipes/ ")).toBe("Basics/Wipes");
    expect(getParsedFolder(" / ")).toBeUndefined();
  });
});

describe("getFolderTree", () => {
  it("nests animations by folder path and sorts by name", () => {
    const tree = getFolderTree([
      getAnimation("b", "Basics/Wipes"),
      getAnimation("a", "Basics"),
      getAnimation("z"),
      getAnimation("c", "Basics/Wipes"),
      getAnimation("d", "Cats"),
    ]);
    expect(tree.animations.map(({ id }) => id)).toEqual(["z"]);
    expect(tree.folders.map(({ path }) => path)).toEqual(["Basics", "Cats"]);
    const [basics] = tree.folders;
    expect(basics?.animations.map(({ id }) => id)).toEqual(["a"]);
    expect(basics?.folders[0]?.path).toBe("Basics/Wipes");
    expect(basics?.folders[0]?.animations.map(({ id }) => id)).toEqual(["b", "c"]);
    expect(basics && getAnimationCount(basics)).toBe(3);
  });
});

describe("getFolders", () => {
  it("lists every folder including ancestors", () => {
    expect(getFolders([getAnimation("a", "Basics/Wipes"), getAnimation("b", "Cats")])).toEqual([
      "Basics",
      "Basics/Wipes",
      "Cats",
    ]);
  });
});
