"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { parseCells, parseColumns, type ReviewColumn } from "@/lib/types";
import { int, str } from "./shared";

function refresh(reviewId?: number | null) {
  revalidatePath("/reviews");
  if (reviewId) revalidatePath(`/reviews/${reviewId}`);
  revalidatePath("/research", "layout");
}

function touch(reviewId: number) {
  db.prepare("UPDATE reviews SET updated_at = datetime('now') WHERE id = ?").run(reviewId);
}

export async function saveReview(fd: FormData) {
  const id = int(fd, "id");
  const f = {
    title: str(fd, "title") || "未命名文獻回顧",
    question_md: str(fd, "question_md"),
    project_id: int(fd, "project_id"),
  };
  if (id) {
    db.prepare(
      `UPDATE reviews SET title=@title, question_md=@question_md, project_id=@project_id,
       updated_at=datetime('now') WHERE id=@id`,
    ).run({ ...f, id });
    refresh(id);
    return;
  }
  const newId = Number(
    db
      .prepare("INSERT INTO reviews (title, question_md, project_id) VALUES (@title, @question_md, @project_id)")
      .run(f).lastInsertRowid,
  );
  refresh(newId);
  redirect(`/reviews/${newId}`);
}

export async function deleteReview(id: number) {
  db.prepare("DELETE FROM reviews WHERE id = ?").run(id);
  refresh();
  redirect("/reviews");
}

export async function saveSynthesis(reviewId: number, text: string) {
  db.prepare("UPDATE reviews SET synthesis_md = ?, updated_at = datetime('now') WHERE id = ?").run(
    text,
    reviewId,
  );
  refresh(reviewId);
}

/* ---------- matrix rows ---------- */

export async function addReviewPaper(reviewId: number, paperId: number) {
  const { next } = db
    .prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM review_papers WHERE review_id = ?")
    .get(reviewId) as { next: number };
  db.prepare(
    "INSERT OR IGNORE INTO review_papers (review_id, paper_id, sort_order) VALUES (?, ?, ?)",
  ).run(reviewId, paperId, next);
  touch(reviewId);
  refresh(reviewId);
}

export async function removeReviewPaper(reviewId: number, paperId: number) {
  db.prepare("DELETE FROM review_papers WHERE review_id = ? AND paper_id = ?").run(reviewId, paperId);
  touch(reviewId);
  refresh(reviewId);
}

/** Swap a row with its neighbour. Orders are renumbered first, so rows added
 *  with equal sort_order still move predictably. */
export async function moveReviewPaper(reviewId: number, paperId: number, dir: -1 | 1) {
  const ids = (
    db
      .prepare(
        `SELECT rp.paper_id FROM review_papers rp JOIN papers p ON p.id = rp.paper_id
         WHERE rp.review_id = ? ORDER BY rp.sort_order, p.year, p.title`,
      )
      .all(reviewId) as { paper_id: number }[]
  ).map((r) => r.paper_id);
  const at = ids.indexOf(paperId);
  const to = at + dir;
  if (at < 0 || to < 0 || to >= ids.length) return;
  [ids[at], ids[to]] = [ids[to], ids[at]];
  const set = db.prepare("UPDATE review_papers SET sort_order = ? WHERE review_id = ? AND paper_id = ?");
  db.transaction(() => ids.forEach((id, i) => set.run(i + 1, reviewId, id)))();
  touch(reviewId);
  refresh(reviewId);
}

export async function setCell(reviewId: number, paperId: number, columnId: string, text: string) {
  db.transaction(() => {
    const row = db
      .prepare("SELECT cells_json FROM review_papers WHERE review_id = ? AND paper_id = ?")
      .get(reviewId, paperId) as { cells_json: string } | undefined;
    if (!row) return;
    const cells = parseCells(row.cells_json);
    if (text.trim()) cells[columnId] = text;
    else delete cells[columnId];
    db.prepare("UPDATE review_papers SET cells_json = ? WHERE review_id = ? AND paper_id = ?").run(
      JSON.stringify(cells),
      reviewId,
      paperId,
    );
  })();
  touch(reviewId);
  refresh(reviewId);
}

/* ---------- matrix columns ---------- */

/**
 * Replace the column list (add, rename, remove, reorder all go through here).
 * Cells of a removed column are dropped so they cannot reappear later under a
 * new column that happens to reuse the id.
 */
export async function setColumns(reviewId: number, columns: ReviewColumn[]) {
  const clean = parseColumns(JSON.stringify(columns)).map((c) => ({
    id: c.id,
    label: c.label.trim() || "未命名欄位",
  }));
  const keep = new Set(clean.map((c) => c.id));
  db.transaction(() => {
    const old = parseColumns(
      (db.prepare("SELECT columns_json FROM reviews WHERE id = ?").get(reviewId) as
        | { columns_json: string }
        | undefined)?.columns_json,
    );
    db.prepare("UPDATE reviews SET columns_json = ?, updated_at = datetime('now') WHERE id = ?").run(
      JSON.stringify(clean),
      reviewId,
    );
    if (old.every((c) => keep.has(c.id))) return;
    const rows = db
      .prepare("SELECT paper_id, cells_json FROM review_papers WHERE review_id = ?")
      .all(reviewId) as { paper_id: number; cells_json: string }[];
    const set = db.prepare("UPDATE review_papers SET cells_json = ? WHERE review_id = ? AND paper_id = ?");
    for (const r of rows) {
      const cells = Object.fromEntries(Object.entries(parseCells(r.cells_json)).filter(([k]) => keep.has(k)));
      set.run(JSON.stringify(cells), reviewId, r.paper_id);
    }
  })();
  refresh(reviewId);
}
