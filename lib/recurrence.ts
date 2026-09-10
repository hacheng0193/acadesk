import { addDays } from "./dates";
import type { AssignmentRow, Occurrence } from "./types";

const STEP: Record<string, number> = { weekly: 7, biweekly: 14 };

/** Hard stop so a repeat with no end date can't generate forever. */
const MAX_OCCURRENCES = 400;

/**
 * Dates a repeating item lands on within [from, to]. Repeats step from the
 * item's own date, so a weekly meeting first set on a Tuesday stays on Tuesdays.
 */
export function occurrenceDays(
  row: Pick<AssignmentRow, "due_at" | "repeat_rule" | "repeat_until">,
  from: string,
  to: string,
): string[] {
  if (!row.due_at) return [];
  const first = row.due_at.slice(0, 10);
  const step = STEP[row.repeat_rule];
  if (!step) return first >= from && first <= to ? [first] : [];

  const last = row.repeat_until && row.repeat_until < to ? row.repeat_until : to;
  const days: string[] = [];

  // Jump straight to the first occurrence inside the window instead of walking
  // from the series start, which may be years back.
  let day = first;
  if (day < from) {
    const gap = Math.floor(
      (new Date(`${from}T12:00:00`).getTime() - new Date(`${day}T12:00:00`).getTime()) / 86_400_000,
    );
    day = addDays(day, Math.floor(gap / step) * step);
    while (day < from) day = addDays(day, step);
  }

  while (day <= last && days.length < MAX_OCCURRENCES) {
    days.push(day);
    day = addDays(day, step);
  }
  return days;
}

/** Next occurrence on or after `from`, or null once a series has run out. */
export function nextOccurrence(
  row: Pick<AssignmentRow, "due_at" | "repeat_rule" | "repeat_until">,
  from: string,
): string | null {
  if (!row.due_at) return null;
  if (row.repeat_rule === "none") return row.due_at.slice(0, 10);
  const horizon = row.repeat_until ?? addDays(from, 366);
  return occurrenceDays(row, from, horizon)[0] ?? null;
}

/**
 * Flatten rows into dated instances inside a window, newest-first ordering left
 * to the caller. `doneKeys` holds "id|YYYY-MM-DD" for completed occurrences.
 */
export function expandOccurrences(
  rows: AssignmentRow[],
  from: string,
  to: string,
  doneKeys: Set<string>,
): Occurrence[] {
  const out: Occurrence[] = [];
  for (const row of rows) {
    const time = row.due_at && row.due_at.length > 10 ? row.due_at.slice(10) : "";
    const duration =
      row.due_at && row.end_at
        ? new Date(row.end_at).getTime() - new Date(row.due_at).getTime()
        : null;

    for (const day of occurrenceDays(row, from, to)) {
      const at = time ? `${day}${time}` : null;
      const repeated = row.repeat_rule !== "none";
      out.push({
        row,
        day,
        at,
        endAt:
          at && duration !== null && duration > 0
            ? localIso(new Date(new Date(at).getTime() + duration))
            : null,
        // A repeating item's status lives per occurrence; a one-off uses its own.
        done: repeated ? doneKeys.has(`${row.id}|${day}`) : row.status === "done",
        repeated,
      });
    }
  }
  return out.sort((a, b) => (a.at ?? a.day).localeCompare(b.at ?? b.day));
}

function localIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}
