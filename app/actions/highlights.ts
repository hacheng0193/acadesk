"use server";

import { db } from "@/lib/db";
import { listHighlights } from "@/lib/queries/papers";
import { HIGHLIGHT_COLORS, type HighlightColor, type HighlightRect, type PaperHighlight } from "@/lib/types";

// No revalidatePath here: the reader keeps highlights in client state and
// re-rendering the whole page on every stroke would reset the PDF scroll.

function color(c: string): HighlightColor {
  return (HIGHLIGHT_COLORS as string[]).includes(c) ? (c as HighlightColor) : "yellow";
}

function clampRects(rects: HighlightRect[]): HighlightRect[] {
  const c = (n: number) => Math.min(1, Math.max(0, Number(n) || 0));
  return rects.slice(0, 200).map((r) => ({ x: c(r.x), y: c(r.y), w: c(r.w), h: c(r.h) }));
}

export async function addHighlight(input: {
  paperId: number;
  page: number;
  rects: HighlightRect[];
  text: string;
  color: string;
  comment?: string;
}): Promise<PaperHighlight | null> {
  if (!input.rects.length) return null;
  const id = Number(
    db
      .prepare(
        `INSERT INTO paper_highlights (paper_id, page, rects_json, text, comment, color)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.paperId,
        Math.max(1, Math.floor(input.page)),
        JSON.stringify(clampRects(input.rects)),
        input.text.slice(0, 10000),
        (input.comment ?? "").slice(0, 10000),
        color(input.color),
      ).lastInsertRowid,
  );
  return listHighlights(input.paperId).find((h) => h.id === id) ?? null;
}

export async function updateHighlight(id: number, patch: { comment?: string; color?: string }) {
  if (patch.comment !== undefined) {
    db.prepare("UPDATE paper_highlights SET comment = ? WHERE id = ?").run(patch.comment.slice(0, 10000), id);
  }
  if (patch.color !== undefined) {
    db.prepare("UPDATE paper_highlights SET color = ? WHERE id = ?").run(color(patch.color), id);
  }
}

export async function deleteHighlight(id: number) {
  db.prepare("DELETE FROM paper_highlights WHERE id = ?").run(id);
}
