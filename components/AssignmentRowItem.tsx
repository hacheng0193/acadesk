"use client";

import { useTransition } from "react";
import { setAssignmentStatus, toggleOccurrence } from "@/app/actions/assignments";
import { dueMeta } from "@/lib/dates";
import { KIND_COLOR, KIND_LABEL, colorOf, type Occurrence } from "@/lib/types";
import { Badge, cx } from "./ui";

const TONE_CLASS = {
  overdue: "text-danger",
  soon: "text-[var(--warn)]",
  later: "text-dim",
  none: "text-dim",
} as const;

/** One dated item with an inline done checkbox. Used on the dashboard. */
export function AssignmentRowItem({ occurrence }: { occurrence: Occurrence }) {
  const [pending, startTransition] = useTransition();
  const { row, done } = occurrence;
  const due = dueMeta(occurrence.at ?? occurrence.day, done);

  const toggle = () =>
    startTransition(() => {
      // Repeating items are ticked off one date at a time.
      if (occurrence.repeated) void toggleOccurrence(row.id, occurrence.day);
      else void setAssignmentStatus(row.id, done ? "todo" : "done");
    });

  return (
    <div className={cx("flex items-center gap-3 py-2", pending && "opacity-50")}>
      <button
        type="button"
        aria-label={done ? "標記為未完成" : "標記為完成"}
        onClick={toggle}
        className={cx(
          "grid h-4 w-4 shrink-0 place-items-center rounded border text-[10px] transition-colors",
          done ? "border-transparent bg-[var(--ok)] text-white" : "border-line hover:border-[var(--accent)]",
        )}
      >
        {done ? "✓" : ""}
      </button>
      <span className={cx("flex-1 truncate text-sm", done && "text-dim line-through")}>
        {row.title}
      </span>
      <Badge>
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: colorOf(row.course_color ?? KIND_COLOR[row.kind]) }}
        />
        {row.course_name ?? KIND_LABEL[row.kind]}
      </Badge>
      <span className={cx("shrink-0 text-xs tabular-nums", TONE_CLASS[due.tone])}>{due.label}</span>
    </div>
  );
}
