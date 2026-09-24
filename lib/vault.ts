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

/** Image formats a note can embed, and the content type each is served as. */
const IMAGE_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
};

/**
 * The same guard as resolveInVault, for images instead of notes. Kept separate
 * so the note paths cannot be talked into serving arbitrary files, and these
 * cannot be talked into overwriting a note.
 */
export function resolveImageInVault(relPath: string): { abs: string; rel: string; type: string } {
  const root = vaultRoot();
  if (!root) throw new VaultError("尚未設定 Obsidian vault 路徑");

  const rel = relPath.replace(/^\/+/, "");
  if (!rel || rel.includes("\0")) throw new VaultError("無效的檔案路徑");
  const type = IMAGE_TYPES[path.extname(rel).toLowerCase()];
  if (!type) throw new VaultError("只能存取圖片檔案");

  const abs = path.resolve(root, rel);
  if (!abs.startsWith(root + path.sep)) throw new VaultError("路徑超出 vault 範圍");
  return { abs, rel: path.relative(root, abs), type };
}

/**
 * Where pasted images are written. Obsidian resolves an embed by file name
 * wherever it sits in the vault, so this only decides where new ones land -
 * default matches the folder this vault already keeps its pasted images in.
 */
export function attachmentFolder(): string {
  return (getSetting("attachment_folder") || "png").replace(/^\/+|\/+$/g, "");
}

/** Every image in the vault, by file name and by path, both lowercased. */
export function imageIndex(): Map<string, string> {
  const root = vaultRoot();
  const index = new Map<string, string>();
  if (!root) return index;
  for (const rel of walkVault(root, (name) => !!IMAGE_TYPES[path.extname(name).toLowerCase()])) {
    index.set(rel.toLowerCase(), rel);
    // First one wins: same-named files elsewhere in the vault are rare, and
    // Obsidian resolves a bare name the same loose way.
    const base = path.basename(rel).toLowerCase();
    if (!index.has(base)) index.set(base, rel);
  }
  return index;
}

/** Look an embed's target up in the vault, by bare name or by path. */
export function resolveVaultImage(name: string, index = imageIndex()): string | null {
  const key = name.replace(/^\.?\//, "").toLowerCase();
  return index.get(key) ?? index.get(path.basename(key)) ?? null;
}

/**
 * Write a pasted image into the attachment folder, named the way Obsidian
 * names its own pastes so the vault stays consistent about it.
 */
export function saveImage(data: Buffer, ext: string, when = new Date()): string {
  const root = vaultRoot();
  if (!root) throw new VaultError("尚未設定 Obsidian vault 路徑");
  const suffix = ext.toLowerCase();
  if (!IMAGE_TYPES[suffix]) throw new VaultError("不支援的圖片格式");

  const folder = attachmentFolder();
  const dir = path.resolve(root, folder);
  if (dir !== root && !dir.startsWith(root + path.sep)) throw new VaultError("路徑超出 vault 範圍");

  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${when.getFullYear()}${pad(when.getMonth() + 1)}${pad(when.getDate())}` +
    `${pad(when.getHours())}${pad(when.getMinutes())}${pad(when.getSeconds())}`;
  const base = `Pasted image ${stamp}`;

  let name = `${base}${suffix}`;
  for (let n = 1; fs.existsSync(path.join(dir, name)); n++) name = `${base}-${n}${suffix}`;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), data);
  return path.relative(root, path.join(dir, name));
}

export type VaultFile = { rel: string; title: string; mtime: number; size: number };

/** Vault-relative paths of every file the filter keeps, hidden folders aside. */
function walkVault(root: string, keep: (name: string) => boolean): string[] {
  const out: string[] = [];
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
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile() && keep(entry.name)) out.push(path.relative(root, abs));
    }
  };
  walk(root);
  return out;
}

export function listNotes(): VaultFile[] {
  const root = vaultRoot();
  if (!root) return [];

  const out: VaultFile[] = [];
  for (const rel of walkVault(root, (name) => name.toLowerCase().endsWith(".md"))) {
    const stat = fs.statSync(path.join(root, rel));
    out.push({
      rel,
      title: path.basename(rel).replace(/\.md$/i, ""),
      mtime: Math.floor(stat.mtimeMs),
      size: stat.size,
    });
  }
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
