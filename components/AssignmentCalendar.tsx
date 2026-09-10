"use client";

import { useState } from "react";
import { addDays, startOfWeek, today } from "@/lib/dates";
import { KIND_COLOR, WEEKDAYS, colorOf, type Course, type Occurrence } from "@/lib/types";
import { AssignmentForm } from "./AssignmentForm";
import { Button, cx } from "./ui";

function monthGrid(month: string): string[] {
  const start = startOfWeek(`${month}-01`);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function AssignmentCalendar({
  occurrences,
  courses,
}: {
  occurrences: Occurrence[];
  courses: Course[];
}) {
  const [month, setMonth] = useState(today().slice(0, 7));
  const [expanded, setExpanded] = useState<string | null>(null);
  const days = monthGrid(month);
  const todayStr = today();

  const shift = (delta: number) => {
    const d = new Date(`${month}-01T12:00:00`);
    d.setMonth(d.getMonth() + delta);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label="上個月">
          ‹
        </Button>
        <span className="min-w-24 text-center text-sm font-medium tabular-nums">{month}</span>
        <Button variant="outline" size="icon" onClick={() => shift(1)} aria-label="下個月">
          ›
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setMonth(todayStr.slice(0, 7))}>
          今天
        </Button>
      </div>

      <div className="grid grid-cols-7 overflow-hidden rounded-xl border border-line">
        {WEEKDAYS.map((d) => (
          <div key={d} className="border-b border-line bg-surface-2 py-1.5 text-center text-xs text-dim">
            週{d}
          </div>
        ))}
        {days.map((day) => {
          const items = occurrences.filter((o) => o.day === day);
          const inMonth = day.slice(0, 7) === month;
          const shown = expanded === day ? items : items.slice(0, 3);
          return (
            <div
              key={day}
              className={cx(
                "min-h-24 border-b border-r border-line p-1.5 last:border-r-0",
                !inMonth && "bg-surface-2/50",
              )}
            >
              <div
                className={cx(
                  "mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] tabular-nums",
                  day === todayStr
                    ? "bg-[var(--accent)] font-semibold text-white"
                    : inMonth
                      ? "text-dim"
                      : "text-dim/50",
                )}
              >
                {Number(day.slice(8))}
              </div>
              <div className="space-y-1">
                {shown.map((o) => (
                  <AssignmentForm
                    key={`${o.row.id}-${o.day}`}
                    assignment={o.row}
                    courses={courses}
                    trigger={
                      <div
                        className={cx(
                          "flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-left text-[11px] text-white",
                          o.done && "opacity-50 line-through",
                        )}
                        style={{
                          background: colorOf(o.row.course_color ?? KIND_COLOR[o.row.kind]),
                        }}
                        title={`${o.at ? `${o.at.slice(11, 16)} ` : ""}${o.row.title}${
                          o.row.location ? ` @${o.row.location}` : ""
                        }`}
                      >
                        {o.at ? (
                          <span className="shrink-0 tabular-nums opacity-85">
                            {o.at.slice(11, 16)}
                          </span>
                        ) : null}
                        <span className="truncate">{o.row.title}</span>
                      </div>
                    }
                  />
                ))}
                {items.length > 3 && expanded !== day ? (
                  <button
                    type="button"
                    onClick={() => setExpanded(day)}
                    className="w-full px-1.5 text-left text-[10px] text-dim hover:text-ink"
                  >
                    +{items.length - 3} 更多
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
