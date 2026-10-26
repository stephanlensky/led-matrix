import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { deflateSync } from "node:zlib";
import { z } from "zod";

const IN_MEMORY_PATH = ":memory:";

const clipFramesRowSchema = z.object({ id: z.string(), frames: z.instanceof(Uint8Array) });

type Migration = string | ((connection: DatabaseSync) => void);

function compressClipFrames(connection: DatabaseSync) {
  const update = connection.prepare("UPDATE clips SET frames = ? WHERE id = ?");
  for (const row of connection.prepare("SELECT id, frames FROM clips").all()) {
    const { id, frames } = clipFramesRowSchema.parse(row);
    update.run(deflateSync(frames), id);
  }
}

const migrations: readonly Migration[] = [
  `
  CREATE TABLE animations (
    id TEXT PRIMARY KEY,
    document TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) STRICT;
  CREATE TABLE clips (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    source TEXT NOT NULL,
    durations TEXT NOT NULL,
    frames BLOB NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) STRICT;
  `,
  compressClipFrames,
];

export type Database = {
  connection: DatabaseSync;
  isCreated: boolean;
};

function getVersion(connection: DatabaseSync): number {
  const row = connection.prepare("PRAGMA user_version").get();
  return Number(row?.["user_version"] ?? 0);
}

export function openDatabase(path: string): Database {
  if (path !== IN_MEMORY_PATH) {
    mkdirSync(dirname(path), { recursive: true });
  }
  const connection = new DatabaseSync(path);
  connection.exec("PRAGMA journal_mode = WAL");
  const version = getVersion(connection);
  for (const [index, migration] of migrations.entries()) {
    if (index < version) {
      continue;
    }
    connection.exec("BEGIN");
    try {
      if (typeof migration === "string") {
        connection.exec(migration);
      } else {
        migration(connection);
      }
      connection.exec(`PRAGMA user_version = ${index + 1}`);
      connection.exec("COMMIT");
    } catch (error) {
      connection.exec("ROLLBACK");
      throw error;
    }
  }
  return { connection, isCreated: version === 0 };
}

export function getSlugId(
  name: string,
  existingIds: ReadonlySet<string>,
  fallback: string,
): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 56) || fallback;
  let id = base;
  for (let suffix = 2; existingIds.has(id); suffix++) {
    id = `${base}-${suffix}`;
  }
  return id;
}
