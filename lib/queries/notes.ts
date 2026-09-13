import { db } from "../db";
import type { LinkedNote } from "../types";
import { listNotes } from "../vault";

export type { LinkedNote };

function folderOf(rel: string): string {
  const i = rel.lastIndexOf("/");
  return i === -1 ? "" : rel.slice(0, i);
}

/** Folders this entity follows. Notes under them count as linked. */
export function foldersFor(entityType: string, entityId: number): string[] {
  return (
    db
      .prepare(
        "SELECT folder FROM note_folder_links WHERE entity_type = ? AND entity_id = ? ORDER BY folder",
      )
      .all(entityType, entityId) as { folder: string }[]
  ).map((r) => r.folder);
}

/**
 * Notes attached to an entity: the ones linked individually, plus everything
 * under any folder it follows. Folder membership is resolved against the vault
 * as it is right now, so a note dropped into the folder today appears today.
 */
export function notesFor(entityType: string, entityId: number): LinkedNote[] {
  const explicit = db
    .prepare(
      `SELECT n.rel_path, n.title FROM notes n
       JOIN note_links l ON l.note_id = n.id
       WHERE l.entity_type = ? AND l.entity_id = ?`,
    )
    .all(entityType, entityId) as { rel_path: string; title: string }[];

  const byPath = new Map<string, LinkedNote>();
  for (const n of explicit) byPath.set(n.rel_path, { ...n, via: null });

  const folders = foldersFor(entityType, entityId);
  if (folders.length) {
    for (const file of listNotes()) {
      // An explicit link wins: it stays individually removable.
      if (byPath.has(file.rel)) continue;
      const dir = folderOf(file.rel);
      const via = folders.find((f) => dir === f || dir.startsWith(`${f}/`));
      if (via) byPath.set(file.rel, { rel_path: file.rel, title: file.title, via });
    }
  }

  return [...byPath.values()].sort((a, b) => a.title.localeCompare(b.title));
}

export function linksOf(noteId: number): { entity_type: string; entity_id: number }[] {
  return db
    .prepare("SELECT entity_type, entity_id FROM note_links WHERE note_id = ?")
    .all(noteId) as { entity_type: string; entity_id: number }[];
}

export function recentNotes(limit = 6): { rel_path: string; title: string; last_seen_mtime: number }[] {
  return db
    .prepare("SELECT rel_path, title, last_seen_mtime FROM notes ORDER BY last_seen_mtime DESC LIMIT ?")
    .all(limit) as { rel_path: string; title: string; last_seen_mtime: number }[];
}
