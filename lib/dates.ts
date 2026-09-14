/** Local-time helpers. SQLite stores ISO strings; everything here is the user's timezone. */

export function toLocalIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

export function today(): string {
  return toLocalIso(new Date()).slice(0, 10);
}

export function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return toLocalIso(d).slice(0, 10);
}

/** Monday of the week containing `day`. */
export function startOfWeek(day: string): string {
  const d = new Date(`${day}T12:00:00`);
  const shift = (d.getDay() + 6) % 7;
  return addDays(day, -shift);
}

export function startOfMonth(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

export function formatHours(hours: number): string {
  // Round to whole minutes first, or 59.7 minutes renders as "0 小時 60 分".
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} 分`;
  return m === 0 ? `${h} 小時` : `${h} 小時 ${m} 分`;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** Whole calendar days from one YYYY-MM-DD to another. */
export function daysApart(fromDay: string, toDay: string): number {
  const a = new Date(`${fromDay}T12:00:00`).getTime();
  const b = new Date(`${toDay}T12:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Human label for a deadline, plus urgency bucket for colouring. */
export function dueMeta(
  dueAt: string | null,
  done = false,
): { label: string; tone: "overdue" | "soon" | "later" | "none" } {
  if (!dueAt) return { label: "無期限", tone: "none" };
  // A finished task is never late, whatever its deadline said.
  if (done) return { label: dueAt.slice(5, 16).replace("T", " "), tone: "none" };
  const due = new Date(dueAt);
  const now = new Date();
  // Calendar days apart, not elapsed time: at 12:44 a deadline of 09-16 12:41
  // is 1.998 elapsed days away, and flooring that called it "tomorrow".
  const days = daysApart(today(), dueAt.slice(0, 10));
  const time = dueAt.length > 10 ? dueAt.slice(11, 16) : "";
  const stamp = `${dueAt.slice(5, 10)}${time ? ` ${time}` : ""}`;
  if (due < now) return { label: `已逾期 · ${stamp}`, tone: "overdue" };
  if (days === 0) return { label: `今天 ${time}`, tone: "soon" };
  if (days === 1) return { label: `明天 ${time}`, tone: "soon" };
  if (days <= 3) return { label: `${days} 天後 · ${stamp}`, tone: "soon" };
  return { label: stamp, tone: "later" };
}
