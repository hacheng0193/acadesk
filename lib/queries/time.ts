import { db } from "../db";
import { addDays, dayOf, toLocalIso } from "../dates";
import { maxSessionHours } from "../idle";
import type { Checkin, SessionRow } from "../types";

const SELECT = `
  SELECT s.*, p.title AS project_title, p.color AS project_color,
         c.name AS course_name, c.color AS course_color
  FROM time_sessions s
  LEFT JOIN projects p ON p.id = s.project_id
  LEFT JOIN courses  c ON c.id = s.course_id
`;

export function runningSession(): SessionRow | undefined {
  return db.prepare(`${SELECT} WHERE s.ended_at IS NULL`).get() as SessionRow | undefined;
}

export function sessionsBetween(from: string, to: string): SessionRow[] {
  return db
    .prepare(`${SELECT} WHERE s.started_at < ? AND (s.ended_at IS NULL OR s.ended_at >= ?)
              ORDER BY s.started_at DESC`)
    .all(`${to}T23:59:59`, `${from}T00:00:00`) as SessionRow[];
}

export function recentSessions(limit = 60): SessionRow[] {
  return db.prepare(`${SELECT} ORDER BY s.started_at DESC LIMIT ?`).all(limit) as SessionRow[];
}

/**
 * A finished session is what the user confirmed, so it counts in full. A session
 * that is still running is capped: if it has been going for fifteen hours, the
 * likely truth is that someone forgot to stop it, and letting that number into
 * the totals corrupts the statistics silently.
 */
export function sessionSeconds(
  s: { started_at: string; ended_at: string | null },
  now = new Date(),
): number {
  const start = new Date(s.started_at).getTime();
  if (s.ended_at) return Math.max(0, (new Date(s.ended_at).getTime() - start) / 1000);
  return Math.min(Math.max(0, (now.getTime() - start) / 1000), maxSessionHours() * 3600);
}

/** True when a running session has already hit the cap. */
export function isRunaway(s: { started_at: string; ended_at: string | null }): boolean {
  if (s.ended_at) return false;
  return Date.now() - new Date(s.started_at).getTime() >= maxSessionHours() * 3_600_000;
}

/**
 * Effective end of a session for accounting purposes. Running sessions stop
 * contributing once they pass the cap, so the same limit applies everywhere
 * hours are summed - not just in sessionSeconds.
 */
function effectiveEnd(s: { started_at: string; ended_at: string | null }, now: Date): Date {
  if (s.ended_at) return new Date(s.ended_at);
  const capped = new Date(new Date(s.started_at).getTime() + maxSessionHours() * 3_600_000);
  return capped < now ? capped : now;
}

/**
 * Hours per calendar day. Sessions that cross midnight are split so a 23:00-01:00
 * stint counts two hours on the right two days rather than two on the start day.
 */
export function dailyHours(from: string, to: string): Map<string, number> {
  const out = new Map<string, number>();
  const now = new Date();
  for (const s of sessionsBetween(from, to)) {
    let cursor = new Date(s.started_at);
    const end = effectiveEnd(s, now);
    while (cursor < end) {
      const midnight = new Date(cursor);
      midnight.setHours(24, 0, 0, 0);
      const chunkEnd = midnight < end ? midnight : end;
      const day = toLocalIso(cursor).slice(0, 10);
      if (day >= from && day <= to) {
        const hours = (chunkEnd.getTime() - cursor.getTime()) / 3_600_000;
        out.set(day, (out.get(day) ?? 0) + hours);
      }
      cursor = chunkEnd;
    }
  }
  return out;
}

export function hoursByProject(
  from: string,
  to: string,
): { id: number | null; label: string; color: string; hours: number }[] {
  const now = new Date();
  const buckets = new Map<string, { id: number | null; label: string; color: string; hours: number }>();
  for (const s of sessionsBetween(from, to)) {
    const key = s.project_id ? `p${s.project_id}` : s.course_id ? `c${s.course_id}` : "none";
    const entry = buckets.get(key) ?? {
      id: s.project_id ?? s.course_id ?? null,
      label: s.project_title ?? s.course_name ?? "未分類",
      color: s.project_color ?? s.course_color ?? "none",
      hours: 0,
    };
    // Clip to the window so a long session doesn't inflate the range total.
    const start = new Date(Math.max(new Date(s.started_at).getTime(), new Date(`${from}T00:00:00`).getTime()));
    const end = new Date(
      Math.min(effectiveEnd(s, now).getTime(), new Date(`${to}T23:59:59`).getTime()),
    );
    entry.hours += Math.max(0, (end.getTime() - start.getTime()) / 3_600_000);
    buckets.set(key, entry);
  }
  return [...buckets.values()].filter((b) => b.hours > 0).sort((a, b) => b.hours - a.hours);
}

export function totalHours(from: string, to: string): number {
  let sum = 0;
  for (const h of dailyHours(from, to).values()) sum += h;
  return sum;
}

/* ---------- check-ins ---------- */

export function checkinFor(day: string): Checkin | undefined {
  return db.prepare("SELECT * FROM checkins WHERE day = ?").get(day) as Checkin | undefined;
}

export function checkinsBetween(from: string, to: string): Checkin[] {
  return db
    .prepare("SELECT * FROM checkins WHERE day BETWEEN ? AND ? ORDER BY day DESC")
    .all(from, to) as Checkin[];
}

export function checkinHours(c: Checkin, now = new Date()): number {
  const end = c.check_out_at ? new Date(c.check_out_at) : now;
  return Math.max(0, (end.getTime() - new Date(c.check_in_at).getTime()) / 3_600_000);
}

/** Consecutive days ending today (or yesterday) with any check-in. */
export function attendanceStreak(): number {
  const days = new Set(
    (db.prepare("SELECT day FROM checkins ORDER BY day DESC LIMIT 400").all() as { day: string }[]).map(
      (r) => r.day,
    ),
  );
  const todayStr = dayOf(toLocalIso(new Date()));
  let cursor = days.has(todayStr) ? todayStr : addDays(todayStr, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function weeklyGoal(): number | null {
  const row = db.prepare("SELECT target_value FROM goals WHERE kind = 'weekly_hours'").get() as
    | { target_value: number }
    | undefined;
  return row?.target_value ?? null;
}

/** Lifetime hours logged against one project (a running session counts up to now). */
export function projectHours(projectId: number): number {
  const rows = db
    .prepare("SELECT started_at, ended_at FROM time_sessions WHERE project_id = ?")
    .all(projectId) as { started_at: string; ended_at: string | null }[];
  const now = new Date();
  return rows.reduce((sum, r) => sum + sessionSeconds(r, now) / 3600, 0);
}
