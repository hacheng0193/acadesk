"use server";

import { revalidatePath } from "next/cache";
import { db, setSetting } from "@/lib/db";
import { today, toLocalIso } from "@/lib/dates";
import { heartbeat } from "@/lib/idle";
import { int, nullable, num, str } from "./shared";

function refresh() {
  revalidatePath("/", "layout");
}

/** Start a stopwatch. Any session already running is stopped first, so the
 *  single-running-session index in the schema is never violated. */
export async function startTimer(input: { projectId?: number | null; courseId?: number | null; note?: string }) {
  const now = toLocalIso(new Date());
  db.transaction(() => {
    db.prepare("UPDATE time_sessions SET ended_at = ? WHERE ended_at IS NULL").run(now);
    db.prepare(
      `INSERT INTO time_sessions (project_id, course_id, started_at, note, source)
       VALUES (?, ?, ?, ?, 'timer')`,
    ).run(input.projectId ?? null, input.courseId ?? null, now, input.note ?? "");
  })();
  refresh();
}

export async function startTimerForm(fd: FormData) {
  const target = str(fd, "target"); // "p:3" | "c:2" | ""
  const [kind, rawId] = target.split(":");
  const id = Number(rawId) || null;
  await startTimer({
    projectId: kind === "p" ? id : null,
    courseId: kind === "c" ? id : null,
    note: str(fd, "note"),
  });
}

export async function stopTimer() {
  db.prepare("UPDATE time_sessions SET ended_at = ? WHERE ended_at IS NULL").run(
    toLocalIso(new Date()),
  );
  refresh();
}

/** Throw away the running session (mis-clicks shouldn't pollute the stats). */
export async function discardTimer() {
  db.prepare("DELETE FROM time_sessions WHERE ended_at IS NULL").run();
  refresh();
}

export async function saveSession(fd: FormData) {
  const id = int(fd, "id");
  const target = str(fd, "target");
  const [kind, rawId] = target.split(":");
  const targetId = Number(rawId) || null;
  const day = str(fd, "day") || today();
  const start = `${day}T${str(fd, "start_time") || "09:00"}:00`;
  let end = `${day}T${str(fd, "end_time") || "10:00"}:00`;
  if (end <= start) {
    // Treat an end time before the start as crossing midnight.
    const d = new Date(`${day}T12:00:00`);
    d.setDate(d.getDate() + 1);
    end = `${toLocalIso(d).slice(0, 10)}T${str(fd, "end_time")}:00`;
  }
  const f = {
    project_id: kind === "p" ? targetId : null,
    course_id: kind === "c" ? targetId : null,
    started_at: start,
    ended_at: end,
    note: str(fd, "note"),
  };
  if (id) {
    db.prepare(
      `UPDATE time_sessions SET project_id=@project_id, course_id=@course_id,
       started_at=@started_at, ended_at=@ended_at, note=@note WHERE id=@id`,
    ).run({ ...f, id });
  } else {
    db.prepare(
      `INSERT INTO time_sessions (project_id, course_id, started_at, ended_at, note, source)
       VALUES (@project_id, @course_id, @started_at, @ended_at, @note, 'manual')`,
    ).run(f);
  }
  refresh();
  revalidatePath("/stats");
}

export async function deleteSession(id: number) {
  db.prepare("DELETE FROM time_sessions WHERE id = ?").run(id);
  refresh();
  revalidatePath("/stats");
}

/* ---------- check-in / check-out ---------- */

export async function checkIn() {
  const now = toLocalIso(new Date());
  db.prepare(
    `INSERT INTO checkins (day, check_in_at) VALUES (?, ?)
     ON CONFLICT(day) DO UPDATE SET check_out_at = NULL`,
  ).run(today(), now);
  refresh();
}

export async function checkOut() {
  db.prepare("UPDATE checkins SET check_out_at = ? WHERE day = ?").run(
    toLocalIso(new Date()),
    today(),
  );
  refresh();
}

export async function saveCheckin(fd: FormData) {
  const day = str(fd, "day") || today();
  const inAt = `${day}T${str(fd, "in_time") || "09:00"}:00`;
  const outTime = nullable(fd, "out_time");
  db.prepare(
    `INSERT INTO checkins (day, check_in_at, check_out_at) VALUES (?, ?, ?)
     ON CONFLICT(day) DO UPDATE SET check_in_at = excluded.check_in_at,
                                    check_out_at = excluded.check_out_at`,
  ).run(day, inAt, outTime ? `${day}T${outTime}:00` : null);
  refresh();
  revalidatePath("/stats");
}

export async function deleteCheckin(day: string) {
  db.prepare("DELETE FROM checkins WHERE day = ?").run(day);
  refresh();
  revalidatePath("/stats");
}

export async function setWeeklyGoal(hours: number | null) {
  if (hours === null || hours <= 0) {
    db.prepare("DELETE FROM goals WHERE kind = 'weekly_hours'").run();
  } else {
    db.prepare(
      `INSERT INTO goals (kind, target_value) VALUES ('weekly_hours', ?)
       ON CONFLICT(kind) DO UPDATE SET target_value = excluded.target_value`,
    ).run(hours);
  }
  revalidatePath("/stats");
  revalidatePath("/settings");
}

/* ---------- forgotten-timer protection ---------- */

/** Called by the page while it is visible, and on unload via sendBeacon. */
export async function pingTimer() {
  heartbeat();
}

/** Stop the running session at a caller-supplied time (not necessarily "now"). */
export async function stopTimerAt(endedAt: string) {
  db.prepare("UPDATE time_sessions SET ended_at = ? WHERE ended_at IS NULL AND started_at < ?").run(
    endedAt,
    endedAt,
  );
  refresh();
}

export async function resolveAutoStop(
  id: number,
  choice: { action: "accept" } | { action: "discard" } | { action: "adjust"; endedAt: string },
) {
  if (choice.action === "discard") {
    db.prepare("DELETE FROM time_sessions WHERE id = ?").run(id);
  } else if (choice.action === "adjust") {
    db.prepare(
      `UPDATE time_sessions SET ended_at = ?, reviewed = 1
       WHERE id = ? AND started_at < ?`,
    ).run(choice.endedAt, id, choice.endedAt);
    // Guard against an end time before the start: mark reviewed either way so
    // the prompt cannot get stuck on screen.
    db.prepare("UPDATE time_sessions SET reviewed = 1 WHERE id = ?").run(id);
  } else {
    db.prepare("UPDATE time_sessions SET reviewed = 1 WHERE id = ?").run(id);
  }
  refresh();
  revalidatePath("/stats");
}

/** Move the start time of the session that is still running. */
export async function adjustRunningStart(startedAt: string) {
  const now = toLocalIso(new Date());
  if (startedAt > now) return;
  db.prepare("UPDATE time_sessions SET started_at = ? WHERE ended_at IS NULL").run(startedAt);
  refresh();
}

export async function setTimerSettings(fd: FormData) {
  const idle = num(fd, "timer_idle_minutes");
  const max = num(fd, "timer_max_hours");
  if (idle !== null && idle > 0) setSetting("timer_idle_minutes", String(idle));
  if (max !== null && max > 0) setSetting("timer_max_hours", String(max));
  revalidatePath("/", "layout");
}
