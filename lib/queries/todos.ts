import { db } from "../db";
import { today } from "../dates";
import type { Todo } from "../types";

/**
 * Today's list: everything created today, plus anything still unfinished from
 * earlier days. Carrying the stragglers forward means a to-do never silently
 * disappears at midnight - it just shows up with its original date attached.
 */
export function todayTodos(): Todo[] {
  return db
    .prepare(
      `SELECT * FROM todos
       WHERE day = ? OR (day < ? AND done = 0)
       ORDER BY done, day, sort_order, id`,
    )
    .all(today(), today()) as Todo[];
}

export function todoCounts(): { done: number; total: number } {
  const rows = todayTodos();
  return { done: rows.filter((t) => t.done).length, total: rows.length };
}
