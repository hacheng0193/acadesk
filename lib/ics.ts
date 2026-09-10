import { KIND_LABEL, isDeadlineKind, type AssignmentRow } from "./types";

/** Escape a value for an iCalendar TEXT property (RFC 5545 §3.3.11). */
function esc(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Content lines must be folded at 75 octets, continued with a leading space. */
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;

  const parts: string[] = [];
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(start + (parts.length === 0 ? 75 : 74), bytes.length);
    // Don't split inside a multi-byte character.
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1;
    parts.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
  }
  return parts.join("\r\n ");
}

/** Local "floating" timestamp: no Z, no TZID, so Calendar reads it in the
 *  viewer's own timezone - which matches how the app stores times. */
function stamp(iso: string): string {
  return `${iso.slice(0, 10).replace(/-/g, "")}T${(iso.slice(11, 19) || "00:00:00").replace(/:/g, "")}`;
}

function dateStamp(day: string): string {
  return day.replace(/-/g, "");
}

function utcNow(): string {
  return `${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
}

const RRULE_FREQ: Record<string, string> = {
  weekly: "FREQ=WEEKLY;INTERVAL=1",
  biweekly: "FREQ=WEEKLY;INTERVAL=2",
};

function eventLines(row: AssignmentRow, now: string): string[] {
  if (!row.due_at) return [];

  const deadline = isDeadlineKind(row.kind);
  const timed = row.due_at.length > 10;
  const lines: string[] = ["BEGIN:VEVENT", `UID:acadesk-item-${row.id}@acadesk.local`, `DTSTAMP:${now}`];

  if (!timed) {
    // No time of day: an all-day entry, whose DTEND is exclusive.
    const next = new Date(`${row.due_at}T12:00:00`);
    next.setDate(next.getDate() + 1);
    lines.push(`DTSTART;VALUE=DATE:${dateStamp(row.due_at)}`);
    lines.push(`DTEND;VALUE=DATE:${dateStamp(next.toISOString().slice(0, 10))}`);
  } else if (deadline) {
    // Show a deadline as the half hour leading up to it, so the block ends
    // exactly when the thing is due.
    const end = new Date(row.due_at);
    const start = new Date(end.getTime() - 30 * 60_000);
    lines.push(`DTSTART:${stamp(localIso(start))}`);
    lines.push(`DTEND:${stamp(localIso(end))}`);
  } else {
    const start = new Date(row.due_at);
    const end = row.end_at ? new Date(row.end_at) : new Date(start.getTime() + 60 * 60_000);
    lines.push(`DTSTART:${stamp(localIso(start))}`);
    lines.push(`DTEND:${stamp(localIso(end > start ? end : new Date(start.getTime() + 60 * 60_000)))}`);
  }

  const freq = RRULE_FREQ[row.repeat_rule];
  if (freq) {
    const until = row.repeat_until ? `;UNTIL=${dateStamp(row.repeat_until)}T235959` : "";
    lines.push(`RRULE:${freq}${until}`);
  }

  const label = KIND_LABEL[row.kind] ?? "事項";
  lines.push(`SUMMARY:${esc(`[${label}] ${row.title}`)}`);
  if (row.location) lines.push(`LOCATION:${esc(row.location)}`);

  const description = [
    row.course_name ? `課程：${row.course_name}` : "",
    row.weight ? `佔比：${row.weight}%` : "",
    row.notes_md,
  ]
    .filter(Boolean)
    .join("\n");
  if (description) lines.push(`DESCRIPTION:${esc(description)}`);

  lines.push(
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `TRIGGER:${deadline ? "-P1D" : "-PT30M"}`,
    `DESCRIPTION:${esc(row.title)}`,
    "END:VALARM",
    "END:VEVENT",
  );
  return lines;
}

function localIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/**
 * Build the subscribable calendar. Repeats become RRULEs rather than expanded
 * events, so Calendar.app keeps them as a single editable series.
 */
export function buildCalendar(rows: AssignmentRow[], name = "Acadesk"): string {
  const now = utcNow();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Acadesk//TW//ZH",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(name)}`,
    "X-PUBLISHED-TTL:PT15M",
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
    ...rows.flatMap((row) => eventLines(row, now)),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
