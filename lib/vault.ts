import fs from "node:fs";
import path from "node:path";
import { db, getSetting } from "./db";
import { reindexNotes } from "./search";

const IGNORED = new Set([".obsidian", ".trash", ".git", "node_modules", ".DS_Store"]);

export function vaultRoot(): string | null {
  const configured = process.env.OBSIDIAN_VAULT || getSetting("vault_path");
  if (!configured) return null;
  const root = path.resolve(configured.replace(/^~(?=$|\/)/, process.env.HOME ?? "~"));
  return fs.existsSync(root) && fs.statSync(root).isDirectory() ? root : null;
}

export class VaultError extends Error {}

/**
 * Resolve a vault-relative path to an absolute one, refusing anything that
 * escapes the vault or is not a Markdown file. Every read/write goes through
 * this - it is the only thing standing between a bad URL and the rest of the disk.
 */
export function resolveInVault(relPath: string): { root: string; abs: string; rel: string } {
  const root = vaultRoot();
  if (!root) throw new VaultError("尚未設定 Obsidian vault 路徑");

  const rel = relPath.replace(/^\/+/, "");
  if (!rel || rel.includes("\0")) throw new VaultError("無效的檔案路徑");
  if (!rel.toLowerCase().endsWith(".md")) throw new VaultError("只能存取 .md 檔案");

  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new VaultError("路徑超出 vault 範圍");
  }
  return { root, abs, rel: path.relative(root, abs) };
}

export type VaultFile = { rel: string; title: string; mtime: number; size: number };

export function listNotes(): VaultFile[] {
  const root = vaultRoot();
  if (!root) return [];

  const out: VaultFile[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (IGNORED.has(entry.name) || entry.name.startsWith(".")) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        const stat = fs.statSync(abs);
        out.push({
          rel: path.relative(root, abs),
          title: entry.name.replace(/\.md$/i, ""),
          mtime: Math.floor(stat.mtimeMs),
          size: stat.size,
        });
      }
    }
  };
  walk(root);
  out.sort((a, b) => b.mtime - a.mtime);
  return out;
}

export function readNote(relPath: string): { rel: string; content: string; mtime: number } {
  const { abs, rel } = resolveInVault(relPath);
  const stat = fs.statSync(abs);
  return { rel, content: fs.readFileSync(abs, "utf8"), mtime: Math.floor(stat.mtimeMs) };
}

/**
 * Write a note back to the vault. `expectedMtime` is what the browser last saw;
 * if the file changed underneath us (edited in Obsidian meanwhile) we refuse
 * rather than silently clobbering the other copy.
 */
export function writeNote(
  relPath: string,
  content: string,
  expectedMtime: number | null,
): { mtime: number } | { conflict: true; current: string; mtime: number } {
  const { abs } = resolveInVault(relPath);
  if (fs.existsSync(abs) && expectedMtime !== null) {
    const actual = Math.floor(fs.statSync(abs).mtimeMs);
    if (actual > expectedMtime) {
      return { conflict: true, current: fs.readFileSync(abs, "utf8"), mtime: actual };
    }
  }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
  return { mtime: Math.floor(fs.statSync(abs).mtimeMs) };
}

export function createNote(relPath: string, content: string): string {
  const { abs, rel } = resolveInVault(relPath);
  if (fs.existsSync(abs)) throw new VaultError("同名筆記已存在");
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
  return rel;
}

/**
 * Move a note into the vault's `.trash` folder - the same place Obsidian's
 * "move to Obsidian trash" uses - so a mistaken delete can be undone by hand.
 * Obsidian's trash is flat, so a name clash gets a timestamp suffix.
 */
export function trashNote(relPath: string): string {
  const { root, abs, rel } = resolveInVault(relPath);
  if (!fs.existsSync(abs)) throw new VaultError("找不到這份筆記");
  const trash = path.join(root, ".trash");
  fs.mkdirSync(trash, { recursive: true });
  const base = path.basename(rel).replace(/\.md$/i, "");
  let target = path.join(trash, `${base}.md`);
  if (fs.existsSync(target)) target = path.join(trash, `${base} ${Date.now()}.md`);
  fs.renameSync(abs, target);
  return rel;
}

/** Refresh the `notes` index from disk. Cheap enough to run on every /notes visit. */
export function syncNoteIndex(): number {
  const root = vaultRoot();
  const files = listNotes();
  const upsert = db.prepare(`
    INSERT INTO notes (rel_path, title, last_seen_mtime, last_indexed_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(rel_path) DO UPDATE SET
      title = excluded.title,
      last_seen_mtime = excluded.last_seen_mtime,
      last_indexed_at = excluded.last_indexed_at
  `);
  const run = db.transaction((rows: VaultFile[]) => {
    for (const f of rows) upsert.run(f.rel, f.title, f.mtime);
    const alive = new Set(rows.map((f) => f.rel));
    // Drop notes that vanished from disk, but keep ones we've linked to entities
    // so a temporarily-unmounted vault doesn't destroy the links.
    for (const row of db.prepare("SELECT id, rel_path FROM notes").all() as {
      id: number;
      rel_path: string;
    }[]) {
      if (alive.has(row.rel_path)) continue;
      const linked = db
        .prepare("SELECT 1 FROM note_links WHERE note_id = ?")
        .get(row.id);
      if (!linked) db.prepare("DELETE FROM notes WHERE id = ?").run(row.id);
    }
  });
  run(files);

  // Notes are files, so no trigger can watch them - fold the content into the
  // search index here, while we already have the list.
  reindexNotes(
    files.map((f) => {
      try {
        return { rel: f.rel, title: f.title, content: fs.readFileSync(path.join(root!, f.rel), "utf8") };
      } catch {
        return { rel: f.rel, title: f.title, content: "" };
      }
    }),
  );
  return files.length;
}

export function noteIdFor(relPath: string): number {
  const { rel } = resolveInVault(relPath);
  const existing = db.prepare("SELECT id FROM notes WHERE rel_path = ?").get(rel) as
    | { id: number }
    | undefined;
  if (existing) return existing.id;
  const title = path.basename(rel).replace(/\.md$/i, "");
  return Number(
    db.prepare("INSERT INTO notes (rel_path, title) VALUES (?, ?)").run(rel, title)
      .lastInsertRowid,
  );
}

export function obsidianUri(relPath: string): string {
  const root = vaultRoot();
  if (!root) return "#";
  return `obsidian://open?path=${encodeURIComponent(path.join(root, relPath))}`;
}

/** Slugify a title into a safe filename (no path separators, no leading dots). */
export function safeFileName(title: string): string {
  const cleaned = title.replace(/[\/\\:*?"<>|\0]/g, "-").replace(/^\.+/, "").trim();
  return (cleaned || "未命名") + ".md";
}

/**
 * Every folder in the vault with the number of notes at or below it. Counts are
 * descendant-inclusive so they match what the notes page's tree shows.
 */
export function listFolders(): { path: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const file of listNotes()) {
    const slash = file.rel.lastIndexOf("/");
    if (slash === -1) continue;
    const segments = file.rel.slice(0, slash).split("/");
    for (let i = 1; i <= segments.length; i++) {
      const dir = segments.slice(0, i).join("/");
      counts.set(dir, (counts.get(dir) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => a.path.localeCompare(b.path));
}
