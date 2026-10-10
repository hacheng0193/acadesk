import { db } from "../db";
import { withNoteBodies } from "../paper-notes";
import type { Review, ReviewListRow, ReviewPaperRow } from "../types";

const LIST = `
  SELECT r.*,
    (SELECT COUNT(*) FROM review_papers rp WHERE rp.review_id = r.id) AS paper_count,
    pr.title AS project_title,
    pr.color AS project_color
  FROM reviews r
  LEFT JOIN projects pr ON pr.id = r.project_id
`;

export function listReviews(): ReviewListRow[] {
  return db.prepare(`${LIST} ORDER BY r.updated_at DESC`).all() as ReviewListRow[];
}

export function reviewsForProject(projectId: number): ReviewListRow[] {
  return db
    .prepare(`${LIST} WHERE r.project_id = ? ORDER BY r.updated_at DESC`)
    .all(projectId) as ReviewListRow[];
}

export function getReview(id: number): Review | undefined {
  return db.prepare("SELECT * FROM reviews WHERE id = ?").get(id) as Review | undefined;
}

export function reviewPapers(reviewId: number): ReviewPaperRow[] {
  const rows = db
    .prepare(
      `SELECT p.*, rp.sort_order, rp.cells_json
       FROM review_papers rp JOIN papers p ON p.id = rp.paper_id
       WHERE rp.review_id = ? ORDER BY rp.sort_order, p.year, p.title`,
    )
    .all(reviewId) as ReviewPaperRow[];
  return withNoteBodies(rows);
}
