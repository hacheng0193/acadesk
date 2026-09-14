import { db } from "./db";
import type { SearchHit, SearchKind } from "./types";

/** The trigram tokenizer cannot match anything shorter than three characters. */
const TRIGRAM_MIN = 3;

function hrefFor(kind: SearchKind, refKey: string): string {
  switch (kind) {
    case "item":
      return "/assignments";
    case "project":
      return `/research/${refKey}`;
    case "paper":
      return "/papers";
    case "note":
      return `/notes/${refKey.split("/").map(encodeURIComponent).join("/")}`;
  }
}

/** A short window of body text around the first match, for context in results. */
function makeSnippet(body: string, query: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  const at = flat.toLowerCase().indexOf(query.toLowerCase());
  if (at < 0) return flat.slice(0, 90);
  const from = Math.max(0, at - 30);
  return (from > 0 ? "…" : "") + flat.slice(from, from + 90) + (flat.length > from + 90 ? "…" : "");
}

/** Escape a user string into a single FTS5 phrase, so punctuation can't be
 *  read as query syntax. */
function asPhrase(query: string): string {
  return `"${query.replace(/"/g, '""')}"`;
}

export function search(rawQuery: string, limit = 30): SearchHit[] {
  const query = rawQuery.trim();
  if (!query) return [];

  type Row = { kind: SearchKind; ref_id: number; ref_key: string; title: string; body: string };

  const rows =
    query.length >= TRIGRAM_MIN
      ? (db
          .prepare(
            `SELECT kind, ref_id, ref_key, title, body FROM search_index
             WHERE search_index MATCH ? ORDER BY rank LIMIT ?`,
          )
          .all(asPhrase(query), limit) as Row[])
      : // Below the trigram floor - common for two-character Chinese words -
        // scan with LIKE instead. Cheap at personal-notebook scale.
        (db
          .prepare(
            `SELECT kind, ref_id, ref_key, title, body FROM search_index
             WHERE title LIKE '%' || ? || '%' OR body LIKE '%' || ? || '%' LIMIT ?`,
          )
          .all(query, query, limit) as Row[]);

  return rows.map((r) => ({
    kind: r.kind,
    refId: r.ref_id,
    refKey: String(r.ref_key),
    title: r.title || "(無標題)",
    snippet: makeSnippet(r.body ?? "", query),
    href: hrefFor(r.kind, String(r.ref_key)),
  }));
}

/* ---------- vault notes ---------- */

/**
 * Notes live on disk, so no trigger can see them change. The vault scan calls
 * this with what it just read; everything under 'note' is replaced wholesale.
 */
export function reindexNotes(notes: { rel: string; title: string; content: string }[]): void {
  const wipe = db.prepare("DELETE FROM search_index WHERE kind = 'note'");
  const insert = db.prepare(
    "INSERT INTO search_index (kind, ref_id, ref_key, title, body) VALUES ('note', 0, ?, ?, ?)",
  );
  db.transaction(() => {
    wipe.run();
    for (const n of notes) insert.run(n.rel, n.title, n.content);
  })();
}

/** Rebuild the database-backed part of the index (triggers keep it current
 *  afterwards; this is for databases that predate the index). */
export function rebuildIndex(): void {
  db.transaction(() => {
    db.prepare("DELETE FROM search_index WHERE kind != 'note'").run();
    db.prepare(
      `INSERT INTO search_index (kind, ref_id, ref_key, title, body)
       SELECT 'item', id, id, title, notes_md FROM assignments`,
    ).run();
    db.prepare(
      `INSERT INTO search_index (kind, ref_id, ref_key, title, body)
       SELECT 'paper', id, id, title, authors || ' ' || venue || ' ' || notes_md FROM papers`,
    ).run();
    db.prepare(
      `INSERT INTO search_index (kind, ref_id, ref_key, title, body)
       SELECT 'project', id, id, title, description_md FROM projects`,
    ).run();
  })();
}
