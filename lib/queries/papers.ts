import { db } from "../db";
import type { PaperRow } from "../types";

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
  return db
    .prepare(
      `${SELECT} ORDER BY CASE p.status WHEN 'reading' THEN 0 WHEN 'to_read' THEN 1 ELSE 2 END,
       p.added_at DESC`,
    )
    .all() as PaperRow[];
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
