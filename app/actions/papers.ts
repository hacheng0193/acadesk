"use server";

import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { removePdf, resolveInLibrary, storePdf } from "@/lib/papers-library";
import { int, oneOf, str } from "./shared";

const execFile = promisify(execFileCb);

function refresh() {
  revalidatePath("/papers");
  revalidatePath("/research", "layout");
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
    file_path: str(fd, "file_path"),
    status: oneOf(fd, "status", ["to_read", "reading", "read"] as const, "to_read"),
    rating: int(fd, "rating"),
    notes_md: str(fd, "notes_md"),
  };
  const projectIds = fd.getAll("project_ids").map(Number).filter(Boolean);

  db.transaction(() => {
    let paperId = id;
    if (paperId) {
      db.prepare(
        `UPDATE papers SET title=@title, authors=@authors, venue=@venue, year=@year, doi=@doi,
         url=@url, file_path=@file_path, status=@status, rating=@rating, notes_md=@notes_md
         WHERE id=@id`,
      ).run({ ...f, id: paperId });
    } else {
      paperId = Number(
        db
          .prepare(
            `INSERT INTO papers (title, authors, venue, year, doi, url, file_path, status, rating, notes_md)
             VALUES (@title, @authors, @venue, @year, @doi, @url, @file_path, @status, @rating, @notes_md)`,
          )
          .run(f).lastInsertRowid,
      );
    }
    syncTags(paperId, str(fd, "tags"));
    syncProjects(paperId, projectIds);
  })();
  refresh();
}

export async function setPaperStatus(id: number, status: "to_read" | "reading" | "read") {
  db.prepare("UPDATE papers SET status = ? WHERE id = ?").run(status, id);
  refresh();
}

export async function deletePaper(id: number) {
  db.prepare("DELETE FROM papers WHERE id = ?").run(id);
  refresh();
}

/* ---------- local PDF attachments ---------- */

/** Copy an uploaded PDF into the library and point the paper at it. */
export async function attachPdf(
  paperId: number,
  form: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "沒有選擇檔案" };
  if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return { ok: false, error: "只接受 PDF 檔案" };
  }
  if (file.size > 100 * 1024 * 1024) return { ok: false, error: "檔案超過 100 MB" };

  const row = db.prepare("SELECT title, file_path FROM papers WHERE id = ?").get(paperId) as
    | { title: string; file_path: string }
    | undefined;
  if (!row) return { ok: false, error: "找不到這篇論文" };

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const stored = storePdf(paperId, row.title, bytes, row.file_path);
    db.prepare("UPDATE papers SET file_path = ? WHERE id = ?").run(stored, paperId);
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "存檔失敗" };
  }
}

export async function detachPdf(paperId: number) {
  const row = db.prepare("SELECT file_path FROM papers WHERE id = ?").get(paperId) as
    | { file_path: string }
    | undefined;
  if (row?.file_path) removePdf(row.file_path);
  db.prepare("UPDATE papers SET file_path = '' WHERE id = ?").run(paperId);
  refresh();
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
