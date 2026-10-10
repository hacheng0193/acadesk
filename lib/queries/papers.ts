import { db } from "../db";
import { withNoteBodies } from "../paper-notes";
import type { ChatMessage, ChatProvider, HighlightRect, PaperHighlight, PaperRow } from "../types";

const SELECT = `
  SELECT p.*,
    COALESCE((SELECT group_concat(t.name, '|') FROM paper_tags pt
              JOIN tags t ON t.id = pt.tag_id WHERE pt.paper_id = p.id), '') AS tags,
    COALESCE((SELECT group_concat(pr.title, '|') FROM paper_projects pp
              JOIN projects pr ON pr.id = pp.project_id WHERE pp.paper_id = p.id), '') AS projects,
    COALESCE((SELECT group_concat(pp.project_id, '|') FROM paper_projects pp
              WHERE pp.paper_id = p.id), '') AS project_ids
  FROM papers p
`;

export function listPapers(): PaperRow[] {
  return withNoteBodies(
    db
      .prepare(
        `${SELECT} ORDER BY CASE p.status WHEN 'reading' THEN 0 WHEN 'to_read' THEN 1 ELSE 2 END,
         p.added_at DESC`,
      )
      .all() as PaperRow[],
  );
}

export function getPaper(id: number): PaperRow | undefined {
  return db.prepare(`${SELECT} WHERE p.id = ?`).get(id) as PaperRow | undefined;
}

export function papersForProject(projectId: number): PaperRow[] {
  return db
    .prepare(
      `${SELECT} JOIN paper_projects pp ON pp.paper_id = p.id
       WHERE pp.project_id = ? ORDER BY p.year DESC, p.title`,
    )
    .all(projectId) as PaperRow[];
}

export function listTags(): { id: number; name: string; color: string }[] {
  return db.prepare("SELECT * FROM tags ORDER BY name").all() as {
    id: number;
    name: string;
    color: string;
  }[];
}

export function listHighlights(paperId: number): PaperHighlight[] {
  const rows = db
    .prepare("SELECT * FROM paper_highlights WHERE paper_id = ? ORDER BY page, id")
    .all(paperId) as (Omit<PaperHighlight, "rects"> & { rects_json: string })[];
  return rows.map(({ rects_json, ...h }) => ({ ...h, rects: parseRects(rects_json) }));
}

function parseRects(json: string): HighlightRect[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export type PaperChat = {
  id: number;
  provider: ChatProvider;
  messages: ChatMessage[];
  updated_at: string;
};

export function listChats(paperId: number): PaperChat[] {
  const rows = db
    .prepare("SELECT id, provider, messages_json, updated_at FROM paper_chats WHERE paper_id = ? ORDER BY updated_at DESC")
    .all(paperId) as { id: number; provider: ChatProvider; messages_json: string; updated_at: string }[];
  return rows.map(({ messages_json, ...c }) => {
    let messages: ChatMessage[] = [];
    try {
      messages = JSON.parse(messages_json);
    } catch {
      // Leave it empty.
    }
    return { ...c, messages };
  });
}
