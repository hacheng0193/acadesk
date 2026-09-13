export type Status = "todo" | "doing" | "done";
export type Priority = "low" | "normal" | "high";

export type Course = {
  id: number;
  code: string;
  name: string;
  instructor: string;
  credits: number;
  semester: string;
  color: string;
  schedule_json: string;
  archived: number;
};

export type Slot = { day: number; start: string; end: string; room?: string };

export type ItemKind = "assignment" | "exam" | "talk" | "report" | "meeting" | "other";
export type RepeatRule = "none" | "weekly" | "biweekly";

export type Assignment = {
  id: number;
  course_id: number | null;
  title: string;
  notes_md: string;
  due_at: string | null;
  status: Status;
  priority: Priority;
  weight: number | null;
  est_hours: number | null;
  completed_at: string | null;
  sort_order: number;
  kind: ItemKind;
  location: string;
  end_at: string | null;
  repeat_rule: RepeatRule;
  repeat_until: string | null;
};

/** One dated instance of an item. Non-repeating items have exactly one. */
export type Occurrence = {
  row: AssignmentRow;
  /** YYYY-MM-DD of this instance. */
  day: string;
  /** Full local datetime of this instance, or null when the item has no time. */
  at: string | null;
  endAt: string | null;
  done: boolean;
  /** True when this is a generated repeat rather than the original date. */
  repeated: boolean;
};

export const ITEM_KINDS: {
  key: ItemKind;
  label: string;
  /** Deadlines are things you hand in; the rest are things you attend. */
  deadline: boolean;
}[] = [
  { key: "assignment", label: "作業", deadline: true },
  { key: "report", label: "週報", deadline: true },
  { key: "exam", label: "考試", deadline: false },
  { key: "meeting", label: "Meeting", deadline: false },
  { key: "talk", label: "演講", deadline: false },
  { key: "other", label: "其他", deadline: false },
];

export const KIND_LABEL: Record<ItemKind, string> = Object.fromEntries(
  ITEM_KINDS.map((k) => [k.key, k.label]),
) as Record<ItemKind, string>;

export function isDeadlineKind(kind: ItemKind): boolean {
  return ITEM_KINDS.find((k) => k.key === kind)?.deadline ?? true;
}

export type AssignmentRow = Assignment & {
  course_name: string | null;
  course_color: string | null;
};

export type Project = {
  id: number;
  title: string;
  description_md: string;
  status: "active" | "paused" | "done";
  advisor: string;
  started_on: string | null;
  color: string;
  backup_enabled: number;
};

export type Milestone = {
  id: number;
  project_id: number;
  title: string;
  target_date: string | null;
  status: Status;
  sort_order: number;
};

export type LogEntry = {
  id: number;
  project_id: number | null;
  kind: "experiment" | "meeting" | "idea";
  title: string;
  body_md: string;
  occurred_on: string;
  backup_enabled: number;
  created_at: string;
};

export type Paper = {
  id: number;
  title: string;
  authors: string;
  venue: string;
  year: number | null;
  doi: string;
  url: string;
  file_path: string;
  status: "to_read" | "reading" | "read";
  rating: number | null;
  notes_md: string;
  added_at: string;
};

export type TimeSession = {
  id: number;
  project_id: number | null;
  course_id: number | null;
  started_at: string;
  ended_at: string | null;
  note: string;
  source: "timer" | "manual";
  last_seen_at: string | null;
  auto_stopped: number;
  reviewed: number;
};

export type SessionRow = TimeSession & {
  project_title: string | null;
  project_color: string | null;
  course_name: string | null;
  course_color: string | null;
};

export type Checkin = {
  id: number;
  day: string;
  check_in_at: string;
  check_out_at: string | null;
};

export const COLORS = [
  "blue",
  "orange",
  "aqua",
  "yellow",
  "magenta",
  "green",
  "violet",
  "red",
] as const;

/** Legacy names from earlier rows, mapped onto the validated slots. */
const ALIASES: Record<string, string> = {
  indigo: "blue",
  emerald: "aqua",
  amber: "yellow",
  rose: "red",
  sky: "blue",
  teal: "aqua",
  slate: "none",
};

/**
 * Entity colours resolve to CSS variables rather than hex so light and dark
 * each get their own validated step from the same categorical palette.
 */
export function colorOf(name: string | null | undefined): string {
  const key = name ?? "none";
  const slot = (COLORS as readonly string[]).includes(key) ? key : (ALIASES[key] ?? "none");
  return `var(--c-${slot})`;
}

export const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

export type PaperRow = Paper & { tags: string; projects: string };

/** Split a `group_concat(..., '|')` column back into a list. */
export function splitList(v: string): string[] {
  return v ? v.split("|").filter(Boolean) : [];
}

export type LinkedNote = {
  rel_path: string;
  title: string;
  /** null when linked individually; otherwise the followed folder it came from. */
  via: string | null;
};

export type Todo = {
  id: number;
  day: string;
  title: string;
  done: number;
  sort_order: number;
  completed_at: string | null;
  created_at: string;
};

/** Palette slot per item kind, used when an item has no course colour. */
export const KIND_COLOR: Record<ItemKind, string> = {
  assignment: "blue",
  report: "violet",
  exam: "red",
  meeting: "aqua",
  talk: "yellow",
  other: "none",
};

export type SearchKind = "item" | "log" | "paper" | "project" | "note";

export type SearchHit = {
  kind: SearchKind;
  refId: number;
  refKey: string;
  title: string;
  snippet: string;
  href: string;
};

export const SEARCH_KIND_LABEL: Record<SearchKind, string> = {
  item: "行程",
  log: "研究日誌",
  paper: "文獻",
  project: "研究主題",
  note: "筆記",
};
