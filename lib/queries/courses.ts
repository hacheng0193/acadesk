import { db } from "../db";
import type { Course, Slot } from "../types";

export function listCourses(includeArchived = false): Course[] {
  return db
    .prepare(
      `SELECT * FROM courses ${includeArchived ? "" : "WHERE archived = 0"}
       ORDER BY archived, semester DESC, code, name`,
    )
    .all() as Course[];
}

export function getCourse(id: number): Course | undefined {
  return db.prepare("SELECT * FROM courses WHERE id = ?").get(id) as Course | undefined;
}

export function parseSlots(json: string): Slot[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as Slot[]) : [];
  } catch {
    return [];
  }
}

/** Courses meeting on a given weekday (0 = Monday), with the slot that matches. */
export function coursesOnDay(weekday: number): { course: Course; slot: Slot }[] {
  const out: { course: Course; slot: Slot }[] = [];
  for (const course of listCourses()) {
    for (const slot of parseSlots(course.schedule_json)) {
      if (slot.day === weekday) out.push({ course, slot });
    }
  }
  return out.sort((a, b) => a.slot.start.localeCompare(b.slot.start));
}
