import type { DatabaseSync } from "node:sqlite";
import { type Animation, type StoredAnimation, animationSchema } from "@led-matrix/core";
import { z } from "zod";

const rowSchema = z.object({ id: z.string(), document: z.string() });

export type AnimationStore = ReturnType<typeof createAnimationStore>;

function getAnimation(row: unknown): StoredAnimation | undefined {
  const { id, document } = rowSchema.parse(row);
  const result = animationSchema.safeParse(JSON.parse(document));
  return result.success ? { id, ...result.data } : undefined;
}

export function createAnimationStore(connection: DatabaseSync) {
  const listStatement = connection.prepare("SELECT id, document FROM animations ORDER BY id");
  const getStatement = connection.prepare("SELECT id, document FROM animations WHERE id = ?");
  const setStatement = connection.prepare(
    `INSERT INTO animations (id, document) VALUES (?, ?)
     ON CONFLICT (id) DO UPDATE SET document = excluded.document, updated_at = CURRENT_TIMESTAMP`,
  );
  const deleteStatement = connection.prepare("DELETE FROM animations WHERE id = ?");

  return {
    list(): StoredAnimation[] {
      return listStatement
        .all()
        .map(getAnimation)
        .filter((animation) => animation !== undefined);
    },
    get(id: string): StoredAnimation | undefined {
      const row = getStatement.get(id);
      return row && getAnimation(row);
    },
    has(id: string): boolean {
      return getStatement.get(id) !== undefined;
    },
    set(id: string, animation: Animation): StoredAnimation {
      setStatement.run(id, JSON.stringify(animation));
      return { id, ...animation };
    },
    delete(id: string): boolean {
      return deleteStatement.run(id).changes > 0;
    },
  };
}
