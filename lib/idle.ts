import { db, getSetting } from "./db";
import { toLocalIso } from "./dates";

/**
 * Forgotten-timer protection.
 *
 * The client cannot do this on its own: when the Mac sleeps, the tab closes, or
 * the browser quits, no JavaScript runs at all. So the page sends a heartbeat
 * while it is visible, and the *server* decides a session was abandoned by
 * looking at how stale that heartbeat is - which still works after a three-hour
 * sleep, because the check runs on the next page load.
 */

export const HEARTBEAT_MINUTES = 10;
/** Below this the periodic heartbeat itself would look like absence. */
const MIN_IDLE_MINUTES = HEARTBEAT_MINUTES + 5;

export function idleMinutes(): number {
  const configured = Number(getSetting("timer_idle_minutes") ?? "15");
  const value = Number.isFinite(configured) && configured > 0 ? configured : 15;
  // Clamp rather than trust the setting: an idle window shorter than the
  // heartbeat period would stop sessions that are actively in use.
  return Math.max(value, MIN_IDLE_MINUTES);
}

export function maxSessionHours(): number {
  const configured = Number(getSetting("timer_max_hours") ?? "8");
  return Number.isFinite(configured) && configured > 0 ? configured : 8;
}

export function heartbeat(): void {
  db.prepare("UPDATE time_sessions SET last_seen_at = ? WHERE ended_at IS NULL").run(
    toLocalIso(new Date()),
  );
}

/**
 * Close any running session whose heartbeat has gone stale, backdating the end
 * to the last heartbeat - that is when the user was demonstrably still there,
 * and it is the honest end time. "Now" would silently invent hours of work.
 *
 * Cheap enough (one indexed row at most) to call on every page render.
 */
export function reapAbandonedSession(): void {
  const running = db
    .prepare("SELECT id, started_at, last_seen_at FROM time_sessions WHERE ended_at IS NULL")
    .get() as { id: number; started_at: string; last_seen_at: string | null } | undefined;
  if (!running) return;

  const lastSeen = running.last_seen_at ?? running.started_at;
  const staleMs = Date.now() - new Date(lastSeen).getTime();
  if (staleMs < idleMinutes() * 60_000) return;

  // Never write a zero- or negative-length session.
  const end = new Date(lastSeen) > new Date(running.started_at) ? lastSeen : running.started_at;
  db.prepare(
    "UPDATE time_sessions SET ended_at = ?, auto_stopped = 1, reviewed = 0 WHERE id = ?",
  ).run(end, running.id);
}

export type PendingReview = {
  id: number;
  started_at: string;
  ended_at: string;
  label: string;
};

/** Auto-stopped sessions the user has not yet confirmed or corrected. */
export function pendingReview(): PendingReview | undefined {
  return db
    .prepare(
      `SELECT s.id, s.started_at, s.ended_at,
              COALESCE(p.title, c.name, '未分類') AS label
       FROM time_sessions s
       LEFT JOIN projects p ON p.id = s.project_id
       LEFT JOIN courses  c ON c.id = s.course_id
       WHERE s.auto_stopped = 1 AND s.reviewed = 0 AND s.ended_at IS NOT NULL
       ORDER BY s.ended_at DESC LIMIT 1`,
    )
    .get() as PendingReview | undefined;
}
