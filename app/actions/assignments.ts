"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { toLocalIso } from "@/lib/dates";
import type { ItemKind, RepeatRule, Status } from "@/lib/types";
import { int, nullable, num, oneOf, str } from "./shared";

const KINDS = ["assignment", "report", "exam", "meeting", "talk", "other"] as const;
const REPEATS = ["none", "weekly", "biweekly"] as const;

function refresh() {
  revalidatePath("/", "layout");
}

export async function saveAssignment(fd: FormData) {
  const id = int(fd, "id");
  const f = {
    course_id: int(fd, "course_id"),
    title: str(fd, "title") || "未命名事項",
    notes_md: str(fd, "notes_md"),
    due_at: nullable(fd, "due_at"),
    end_at: nullable(fd, "end_at"),
    status: oneOf<Status>(fd, "status", ["todo", "doing", "done"], "todo"),
    priority: oneOf(fd, "priority", ["low", "normal", "high"] as const, "normal"),
    weight: num(fd, "weight"),
    est_hours: num(fd, "est_hours"),
    kind: oneOf<ItemKind>(fd, "kind", KINDS, "assignment"),
    location: str(fd, "location"),
    repeat_rule: oneOf<RepeatRule>(fd, "repeat_rule", REPEATS, "none"),
    repeat_until: nullable(fd, "repeat_until"),
  };
  if (id) {
    db.prepare(
      `UPDATE assignments SET course_id=@course_id, title=@title, notes_md=@notes_md,
       due_at=@due_at, end_at=@end_at, status=@status, priority=@priority, weight=@weight,
       est_hours=@est_hours, kind=@kind, location=@location, repeat_rule=@repeat_rule,
       repeat_until=@repeat_until,
       completed_at = CASE WHEN @status = 'done' AND completed_at IS NULL THEN datetime('now')
                           WHEN @status != 'done' THEN NULL ELSE completed_at END
       WHERE id=@id`,
    ).run({ ...f, id });
  } else {
    db.prepare(
      `INSERT INTO assignments (course_id, title, notes_md, due_at, end_at, status, priority,
                                weight, est_hours, kind, location, repeat_rule, repeat_until)
       VALUES (@course_id, @title, @notes_md, @due_at, @end_at, @status, @priority,
               @weight, @est_hours, @kind, @location, @repeat_rule, @repeat_until)`,
    ).run(f);
  }
  refresh();
}

export async function setAssignmentStatus(id: number, status: Status) {
  db.prepare(
    `UPDATE assignments SET status = ?,
     completed_at = CASE WHEN ? = 'done' THEN COALESCE(completed_at, ?) ELSE NULL END
     WHERE id = ?`,
  ).run(status, status, toLocalIso(new Date()), id);
  refresh();
}

/**
 * Tick off one instance of a repeating item. The series row keeps its own
 * status untouched - next week starts unticked.
 */
export async function toggleOccurrence(id: number, day: string) {
  const existing = db
    .prepare("SELECT 1 FROM occurrence_done WHERE assignment_id = ? AND occurred_on = ?")
    .get(id, day);
  if (existing) {
    db.prepare("DELETE FROM occurrence_done WHERE assignment_id = ? AND occurred_on = ?").run(id, day);
  } else {
    db.prepare("INSERT INTO occurrence_done (assignment_id, occurred_on) VALUES (?, ?)").run(id, day);
  }
  refresh();
}

export async function deleteAssignment(id: number) {
  db.prepare("DELETE FROM assignments WHERE id = ?").run(id);
  refresh();
}
