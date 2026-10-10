"use server";

import { execFile as execFileCb } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { revalidatePath } from "next/cache";
import { db, setSetting } from "@/lib/db";
import { aiWorkDir } from "@/lib/paper-ai";
import { removePdf, resolveInLibrary } from "@/lib/papers-library";
import { int, oneOf, str } from "./shared";

const execFile = promisify(execFileCb);

function refresh() {
  revalidatePath("/papers");
  revalidatePath("/research", "layout");
  revalidatePath("/reviews", "layout");
}

function syncTags(paperId: number, raw: string) {
  const names = [...new Set(raw.split(/[,、]/).map((t) => t.trim()).filter(Boolean))];
  db.prepare("DELETE FROM paper_tags WHERE paper_id = ?").run(paperId);
  const findTag = db.prepare("SELECT id FROM tags WHERE name = ?");
  const addTag = db.prepare("INSERT INTO tags (name) VALUES (?)");
  const link = db.prepare("INSERT OR IGNORE INTO paper_tags (paper_id, tag_id) VALUES (?, ?)");
  for (const name of names) {
    const existing = findTag.get(name) as { id: number } | undefined;
    const tagId = existing?.id ?? Number(addTag.run(name).lastInsertRowid);
    link.run(paperId, tagId);
  }
}

function syncProjects(paperId: number, ids: number[]) {
  db.prepare("DELETE FROM paper_projects WHERE paper_id = ?").run(paperId);
  const link = db.prepare("INSERT OR IGNORE INTO paper_projects (paper_id, project_id) VALUES (?, ?)");
  for (const id of ids) link.run(paperId, id);
}

export async function savePaper(fd: FormData) {
  const id = int(fd, "id");
  const f = {
    title: str(fd, "title") || "未命名論文",
    authors: str(fd, "authors"),
    venue: str(fd, "venue"),
    year: int(fd, "year"),
    doi: str(fd, "doi"),
    url: str(fd, "url"),
    status: oneOf(fd, "status", ["to_read", "reading", "read"] as const, "to_read"),
    rating: int(fd, "rating"),
  };
  // file_path is owned by /api/papers/[id]/file and notes by the vault note;
  // the form carries neither, so writing them here would wipe them on save.
  const projectIds = fd.getAll("project_ids").map(Number).filter(Boolean);

  db.transaction(() => {
    let paperId = id;
    if (paperId) {
      db.prepare(
        `UPDATE papers SET title=@title, authors=@authors, venue=@venue, year=@year, doi=@doi,
         url=@url, status=@status, rating=@rating
         WHERE id=@id`,
      ).run({ ...f, id: paperId });
    } else {
      paperId = Number(
        db
          .prepare(
            `INSERT INTO papers (title, authors, venue, year, doi, url, status, rating)
             VALUES (@title, @authors, @venue, @year, @doi, @url, @status, @rating)`,
          )
          .run(f).lastInsertRowid,
      );
    }
    syncTags(paperId, str(fd, "tags"));
    syncProjects(paperId, projectIds);
  })();
  refresh();
}

/** A bare paper for a dropped PDF, titled after the file; metadata comes later. */
export async function createPaperFromFile(fileName: string): Promise<number> {
  const title = fileName.replace(/\.pdf$/i, "").replace(/[_]+/g, " ").trim() || "未命名論文";
  const id = Number(
    db.prepare("INSERT INTO papers (title, status) VALUES (?, 'reading')").run(title).lastInsertRowid,
  );
  refresh();
  return id;
}

export async function setPaperStatus(id: number, status: "to_read" | "reading" | "read") {
  db.prepare("UPDATE papers SET status = ? WHERE id = ?").run(status, id);
  refresh();
}

export async function deletePaper(id: number) {
  // The library copy and extracted text go with it; the vault note is the
  // user's writing and stays.
  const row = db.prepare("SELECT file_path FROM papers WHERE id = ?").get(id) as
    | { file_path: string }
    | undefined;
  if (row?.file_path) removePdf(row.file_path);
  fs.rmSync(path.join(aiWorkDir(), `paper-${id}.txt`), { force: true });
  db.prepare("DELETE FROM papers WHERE id = ?").run(id);
  refresh();
}

/* ---------- local PDF attachments ---------- */
// Attaching and removing go through /api/papers/[id]/file: uploads are too
// big for a server action.

/** Open the PDF in the Mac's default app (Preview, usually) on the machine the server runs on. */
export async function openPdfInApp(paperId: number): Promise<{ ok: boolean; error?: string }> {
  const row = db.prepare("SELECT file_path FROM papers WHERE id = ?").get(paperId) as
    | { file_path: string }
    | undefined;
  if (!row?.file_path) return { ok: false, error: "沒有附加檔案" };
  try {
    await execFile("open", [resolveInLibrary(row.file_path)]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "無法開啟檔案" };
  }
}

/** Reveal the PDF in Finder - handy when you want the original file itself. */
export async function revealPdf(paperId: number): Promise<{ ok: boolean; error?: string }> {
  const row = db.prepare("SELECT file_path FROM papers WHERE id = ?").get(paperId) as
    | { file_path: string }
    | undefined;
  if (!row?.file_path) return { ok: false, error: "沒有附加檔案" };
  try {
    const abs = resolveInLibrary(row.file_path);
    await execFile("open", ["-R", abs]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "無法開啟 Finder" };
  }
}

/** Model override for "ask about this paper"; '' means the CLI's default. */
export async function setAgentModel(provider: "claude" | "codex", model: string) {
  setSetting(`paper_ai_${provider}_model`, model.trim());
}
