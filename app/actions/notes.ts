"use server";

import path from "node:path";
import { revalidatePath } from "next/cache";
import { db, setSetting } from "@/lib/db";
import { today } from "@/lib/dates";
import {
  VaultError,
  createNote,
  noteIdFor,
  safeFileName,
  syncNoteIndex,
  vaultRoot,
  writeNote,
} from "@/lib/vault";
import { foldersFor } from "@/lib/queries/notes";
import { defaultLogFolder } from "@/lib/queries/logs";
import { getProject } from "@/lib/queries/research";
import { LOG_KINDS, type LogKind } from "@/lib/types";
import { int, oneOf, str } from "./shared";

export type SaveResult =
  | { ok: true; mtime: number }
  | { ok: false; conflict: true; current: string; mtime: number }
  | { ok: false; error: string };

export async function saveNote(
  relPath: string,
  content: string,
  expectedMtime: number | null,
): Promise<SaveResult> {
  try {
    const result = writeNote(relPath, content, expectedMtime);
    if ("conflict" in result) {
      return { ok: false, conflict: true, current: result.current, mtime: result.mtime };
    }
    db.prepare("UPDATE notes SET last_seen_mtime = ? WHERE rel_path = ?").run(result.mtime, relPath);
    revalidatePath(`/notes/${relPath}`);
    revalidatePath("/notes");
    return { ok: true, mtime: result.mtime };
  } catch (e) {
    return { ok: false, error: e instanceof VaultError ? e.message : "存檔失敗" };
  }
}

const TEMPLATES: Record<string, (title: string, date: string) => string> = {
  blank: (t) => `# ${t}\n\n`,
  experiment: (t, d) =>
    `---\ntype: experiment\ndate: ${d}\n---\n\n# ${t}\n\n## 目的\n\n## 方法\n\n## 觀察\n\n## 結論與下一步\n\n`,
  meeting: (t, d) =>
    `---\ntype: meeting\ndate: ${d}\n---\n\n# ${t}\n\n## 討論\n\n## 決議\n\n## 待辦\n- [ ] \n\n`,
  idea: (t, d) => `---\ntype: idea\ndate: ${d}\n---\n\n# ${t}\n\n`,
  paper: (t, d) =>
    `---\ntype: paper-note\ndate: ${d}\n---\n\n# ${t}\n\n## 問題\n\n## 方法\n\n## 結果\n\n## 對我的啟發\n\n`,
};

export async function newNote(fd: FormData): Promise<{ ok: true; rel: string } | { ok: false; error: string }> {
  try {
    if (!vaultRoot()) return { ok: false, error: "尚未設定 Obsidian vault 路徑" };
    const title = str(fd, "title") || "未命名";
    const folder = str(fd, "folder").replace(/^\/+|\/+$/g, "");
    const template = TEMPLATES[str(fd, "template")] ?? TEMPLATES.blank;
    const rel = path.posix.join(folder, safeFileName(title));
    const created = createNote(rel, template(title, today()));

    const noteId = noteIdFor(created);
    const linkTarget = str(fd, "link"); // "project:3"
    const [entityType, rawId] = linkTarget.split(":");
    if (["project", "course", "assignment", "paper"].includes(entityType) && Number(rawId)) {
      db.prepare(
        "INSERT OR IGNORE INTO note_links (note_id, entity_type, entity_id) VALUES (?, ?, ?)",
      ).run(noteId, entityType, Number(rawId));
    }
    revalidatePath("/notes");
    revalidatePath("/", "layout");
    return { ok: true, rel: created };
  } catch (e) {
    return { ok: false, error: e instanceof VaultError ? e.message : "建立筆記失敗" };
  }
}

export async function linkNote(relPath: string, entityType: string, entityId: number) {
  const noteId = noteIdFor(relPath);
  db.prepare("INSERT OR IGNORE INTO note_links (note_id, entity_type, entity_id) VALUES (?, ?, ?)").run(
    noteId,
    entityType,
    entityId,
  );
  revalidatePath("/", "layout");
}

export async function unlinkNote(relPath: string, entityType: string, entityId: number) {
  const row = db.prepare("SELECT id FROM notes WHERE rel_path = ?").get(relPath) as
    | { id: number }
    | undefined;
  if (!row) return;
  db.prepare(
    "DELETE FROM note_links WHERE note_id = ? AND entity_type = ? AND entity_id = ?",
  ).run(row.id, entityType, entityId);
  revalidatePath("/", "layout");
}

export async function setVaultPath(fd: FormData) {
  setSetting("vault_path", str(fd, "vault_path"));
  try {
    syncNoteIndex();
  } catch {
    // An invalid path just means an empty index; the settings page reports it.
  }
  revalidatePath("/", "layout");
}

/** Follow a whole folder. Notes under it (including subfolders) count as linked
 *  from now on, and keep counting as the folder grows. */
export async function linkFolder(folder: string, entityType: string, entityId: number) {
  const clean = folder.replace(/^\/+|\/+$/g, "");
  if (!clean) return;
  db.prepare(
    "INSERT OR IGNORE INTO note_folder_links (folder, entity_type, entity_id) VALUES (?, ?, ?)",
  ).run(clean, entityType, entityId);
  revalidatePath("/", "layout");
}

export async function unlinkFolder(folder: string, entityType: string, entityId: number) {
  db.prepare(
    "DELETE FROM note_folder_links WHERE folder = ? AND entity_type = ? AND entity_id = ?",
  ).run(folder, entityType, entityId);
  revalidatePath("/", "layout");
}

/**
 * A research log entry is a note: `<folder>/<date> <title>.md` with the kind and
 * date in frontmatter. It lands in the folder the topic follows (or starts
 * following one named after the topic), so the topic page finds it there - as
 * it does anything else dropped into that folder from Obsidian.
 */
export async function newLog(fd: FormData): Promise<{ ok: true; rel: string } | { ok: false; error: string }> {
  try {
    if (!vaultRoot()) return { ok: false, error: "尚未設定 Obsidian vault 路徑" };
    const project = getProject(int(fd, "project_id") ?? 0);
    if (!project) return { ok: false, error: "請選擇研究主題" };

    const kind = oneOf<LogKind>(fd, "kind", LOG_KINDS.map((k) => k.key), "experiment");
    const rawDate = str(fd, "date");
    const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : today();
    const title = str(fd, "title") || "未命名紀錄";
    const folder = str(fd, "folder").replace(/^\/+|\/+$/g, "") || defaultLogFolder(project);
    const body = str(fd, "body");

    const content = body
      ? `---\ntype: ${kind}\ndate: ${date}\n---\n\n# ${title}\n\n${body}\n`
      : TEMPLATES[kind](title, date);
    const created = createNote(path.posix.join(folder, safeFileName(`${date} ${title}`)), content);

    // Make sure the topic can see it: nothing to do if it already follows the
    // folder; follow the folder if it follows none yet; otherwise link the note.
    const followed = foldersFor("project", project.id);
    const covered = followed.some((f) => folder === f || folder.startsWith(`${f}/`));
    if (!covered && !followed.length) {
      db.prepare(
        "INSERT OR IGNORE INTO note_folder_links (folder, entity_type, entity_id) VALUES (?, 'project', ?)",
      ).run(folder, project.id);
    } else if (!covered) {
      db.prepare(
        "INSERT OR IGNORE INTO note_links (note_id, entity_type, entity_id) VALUES (?, 'project', ?)",
      ).run(noteIdFor(created), project.id);
    } else {
      noteIdFor(created);
    }

    revalidatePath(`/research/${project.id}`);
    revalidatePath("/notes");
    revalidatePath("/", "layout");
    return { ok: true, rel: created };
  } catch (e) {
    return { ok: false, error: e instanceof VaultError ? e.message : "建立紀錄失敗" };
  }
}
