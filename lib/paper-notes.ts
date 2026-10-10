import fs from "node:fs";
import path from "node:path";
import { db } from "./db";
import type { Paper } from "./types";
import { VaultError, createNote, noteIdFor, readNote, resolveInVault, safeFileName, vaultRoot } from "./vault";

/**
 * Each paper's notes are a Markdown file in the vault (`Papers/<title>.md`), so
 * they open in Obsidian and show up in search and backlinks like any other
 * note. The reader creates the file the first time a paper is opened.
 */

export const PAPER_NOTES_FOLDER = "Papers";

export type PaperNote =
  | { ok: true; rel: string; content: string; mtime: number }
  | { ok: false; error: string };

/** YAML scalars as JSON strings: always valid YAML, whatever the title holds. */
function frontmatter(paper: Paper): string {
  const lines = [
    `paper_id: ${paper.id}`,
    `title: ${JSON.stringify(paper.title)}`,
    paper.authors ? `authors: ${JSON.stringify(paper.authors)}` : "",
    paper.year ? `year: ${paper.year}` : "",
    paper.venue ? `venue: ${JSON.stringify(paper.venue)}` : "",
    paper.doi ? `doi: ${JSON.stringify(paper.doi)}` : "",
    paper.url ? `url: ${JSON.stringify(paper.url)}` : "",
    "tags: [paper]",
  ].filter(Boolean);
  return `---\n${lines.join("\n")}\n---\n`;
}

function initialContent(paper: Paper): string {
  const body = paper.notes_md.trim();
  return `${frontmatter(paper)}\n# ${paper.title}\n\n${body ? `${body}\n` : ""}`;
}

/** A free name in the notes folder; a clash with another paper's note gets the id appended. */
function freeName(paper: Paper): string {
  const base = safeFileName(paper.title).replace(/\.md$/, "");
  for (const name of [base, `${base} (${paper.id})`]) {
    const rel = path.posix.join(PAPER_NOTES_FOLDER, `${name}.md`);
    if (!fs.existsSync(resolveInVault(rel).abs)) return rel;
  }
  return path.posix.join(PAPER_NOTES_FOLDER, `${base} (${paper.id}-${Date.now()}).md`);
}

/** The paper's note, created (with any legacy inline notes moved in) when missing. */
export function ensurePaperNote(paper: Paper): PaperNote {
  if (!vaultRoot()) return { ok: false, error: "尚未設定 Obsidian vault 路徑，筆記需要存到 vault。" };
  try {
    if (paper.note_path) {
      try {
        return { ok: true, ...readNote(paper.note_path) };
      } catch {
        // Moved or deleted outside the app: make a fresh one below.
      }
    }
    const rel = createNote(freeName(paper), initialContent(paper));
    const noteId = noteIdFor(rel);
    db.transaction(() => {
      // The inline notes now live in the file; clear them so there is one copy.
      db.prepare("UPDATE papers SET note_path = ?, notes_md = '' WHERE id = ?").run(rel, paper.id);
      db.prepare(
        "INSERT OR IGNORE INTO note_links (note_id, entity_type, entity_id) VALUES (?, 'paper', ?)",
      ).run(noteId, paper.id);
    })();
    return { ok: true, ...readNote(rel) };
  } catch (e) {
    return { ok: false, error: e instanceof VaultError ? e.message : "無法建立論文筆記" };
  }
}

/** Read-only peek for list views: the note's body without frontmatter, or ''. */
export function paperNoteBody(notePath: string): string {
  if (!notePath) return "";
  try {
    return readNote(notePath).content.replace(/^---\n[\s\S]*?\n---\n/, "").trim().replace(/^# .*\n*/, "").trim();
  } catch {
    return "";
  }
}

/**
 * Fill `notes_md` from each paper's vault note, so the views that show or
 * search notes (paper list, review matrix) keep working after the move.
 */
export function withNoteBodies<T extends Paper>(papers: T[]): T[] {
  return papers.map((p) => (p.note_path ? { ...p, notes_md: paperNoteBody(p.note_path) || p.notes_md } : p));
}
