import { db } from "../db";

import type { LinkedNote } from "../types";

export type { LinkedNote };

export function notesFor(entityType: string, entityId: number): LinkedNote[] {
  return db
    .prepare(
      `SELECT n.id, n.rel_path, n.title FROM notes n
       JOIN note_links l ON l.note_id = n.id
       WHERE l.entity_type = ? AND l.entity_id = ?
       ORDER BY n.title`,
    )
    .all(entityType, entityId) as LinkedNote[];
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
