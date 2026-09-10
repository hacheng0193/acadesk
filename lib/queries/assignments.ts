import { db } from "../db";
import { addDays, today } from "../dates";
import { expandOccurrences, nextOccurrence } from "../recurrence";
import type { AssignmentRow, ItemKind, Occurrence, Status } from "../types";

const SELECT = `
  SELECT a.*, c.name AS course_name, c.color AS course_color
  FROM assignments a
  LEFT JOIN courses c ON c.id = a.course_id
`;

export function listAssignments(filter: { courseId?: number; kind?: ItemKind } = {}): AssignmentRow[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter.courseId) {
    clauses.push("a.course_id = ?");
    params.push(filter.courseId);
  }
  if (filter.kind) {
    clauses.push("a.kind = ?");
    params.push(filter.kind);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return db
    .prepare(
      `${SELECT} ${where}
       ORDER BY a.status = 'done', a.due_at IS NULL, a.due_at, a.sort_order, a.id`,
    )
    .all(...params) as AssignmentRow[];
}

export function getAssignment(id: number): AssignmentRow | undefined {
  return db.prepare(`${SELECT} WHERE a.id = ?`).get(id) as AssignmentRow | undefined;
}

/** "id|YYYY-MM-DD" for every completed occurrence of a repeating item. */
export function doneOccurrenceKeys(): Set<string> {
  const rows = db.prepare("SELECT assignment_id, occurred_on FROM occurrence_done").all() as {
    assignment_id: number;
    occurred_on: string;
  }[];
  return new Set(rows.map((r) => `${r.assignment_id}|${r.occurred_on}`));
}

/** Dated instances inside a window, repeats expanded. */
export function occurrencesBetween(from: string, to: string): Occurrence[] {
  return expandOccurrences(listAssignments(), from, to, doneOccurrenceKeys());
}

export function byStatus(rows: AssignmentRow[]): Record<Status, AssignmentRow[]> {
  return {
    todo: rows.filter((r) => r.status === "todo"),
    doing: rows.filter((r) => r.status === "doing"),
    done: rows.filter((r) => r.status === "done"),
  };
}

/** Unfinished work happening between today and `until`, soonest first. */
export function upcomingOccurrences(until: string, limit = 8): Occurrence[] {
  return occurrencesBetween(today(), until)
    .filter((o) => !o.done)
    .slice(0, limit);
}

/**
 * Overdue counts only one-off deadlines. A repeating item that was skipped last
 * week is not a red badge you can ever clear, so it would nag forever.
 */
export function overdueCount(): number {
  const now = new Date().toISOString().slice(0, 19);
  return (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM assignments
         WHERE status != 'done' AND repeat_rule = 'none'
           AND due_at IS NOT NULL AND due_at < ?`,
      )
      .get(now) as { n: number }
  ).n;
}

/** For the board: the date a series is next due, so cards sort sensibly. */
export function nextDateFor(row: AssignmentRow): string | null {
  return nextOccurrence(row, addDays(today(), -1));
}
