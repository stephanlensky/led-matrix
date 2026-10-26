import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type Animation, animationSchema } from "@led-matrix/core";
import { z } from "zod";

export const animationIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);

export type StoredAnimation = Animation & { id: string };

export type AnimationStore = {
  init(): Promise<boolean>;
  list(): Promise<StoredAnimation[]>;
  get(id: string): Promise<StoredAnimation | undefined>;
  has(id: string): Promise<boolean>;
  set(id: string, animation: Animation): Promise<StoredAnimation>;
  delete(id: string): Promise<boolean>;
};

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export function createAnimationStore(dir: string): AnimationStore {
  const getPath = (id: string) => join(dir, `${animationIdSchema.parse(id)}.json`);

  async function get(id: string): Promise<StoredAnimation | undefined> {
    try {
      const animation = animationSchema.parse(JSON.parse(await readFile(getPath(id), "utf8")));
      return { id, ...animation };
    } catch (error) {
      if (isMissingFile(error)) {
        return undefined;
      }
      throw error;
    }
  }

  return {
    async init() {
      try {
        await stat(dir);
        return false;
      } catch (error) {
        if (!isMissingFile(error)) {
          throw error;
        }
        await mkdir(dir, { recursive: true });
        return true;
      }
    },
    async list() {
      const files = await readdir(dir);
      const ids = files
        .filter((file) => file.endsWith(".json"))
        .map((file) => file.slice(0, -".json".length))
        .filter((id) => animationIdSchema.safeParse(id).success)
        .toSorted();
      const animations = await Promise.all(ids.map(async (id) => get(id).catch(() => undefined)));
      return animations.filter((animation) => animation !== undefined);
    },
    get,
    async has(id) {
      return (await get(id).catch(() => undefined)) !== undefined;
    },
    async set(id, animation) {
      const path = getPath(id);
      const temporaryPath = `${path}.tmp`;
      await writeFile(temporaryPath, `${JSON.stringify(animation, null, 2)}\n`);
      await rename(temporaryPath, path);
      return { id, ...animation };
    },
    async delete(id) {
      try {
        await rm(getPath(id));
        return true;
      } catch (error) {
        if (isMissingFile(error)) {
          return false;
        }
        throw error;
      }
    },
  };
}

export function getAnimationId(name: string, existingIds: ReadonlySet<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 56) || "animation";
  let id = base;
  for (let suffix = 2; existingIds.has(id); suffix++) {
    id = `${base}-${suffix}`;
  }
  return id;
}
