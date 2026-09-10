"use client";

import { useState, useTransition } from "react";
import { setAssignmentStatus, toggleOccurrence } from "@/app/actions/assignments";
import { dueMeta } from "@/lib/dates";
import {
  KIND_COLOR,
  KIND_LABEL,
  colorOf,
  type AssignmentRow,
  type Course,
  type Status,
} from "@/lib/types";
import { AssignmentForm } from "./AssignmentForm";
import { Badge, Card, cx } from "./ui";

const COLUMNS: { key: Status; label: string }[] = [
  { key: "todo", label: "待辦" },
  { key: "doing", label: "進行中" },
  { key: "done", label: "完成" },
];

const DUE_CLASS = {
  overdue: "text-danger",
  soon: "text-[var(--warn)]",
  later: "text-dim",
  none: "text-dim",
} as const;

export type BoardCard = {
  row: AssignmentRow;
  /** Next date this item happens, already resolved for repeating series. */
  nextDay: string | null;
  /** For repeating items, whether that next occurrence is ticked off. */
  occurrenceDone: boolean;
};

export function AssignmentBoard({ cards, courses }: { cards: BoardCard[]; courses: Course[] }) {
  const [dragOver, setDragOver] = useState<Status | null>(null);
  const [, startTransition] = useTransition();

  const columnOf = (c: BoardCard): Status => {
    if (c.row.repeat_rule === "none") return c.row.status;
    if (c.occurrenceDone) return "done";
    return c.row.status === "done" ? "todo" : c.row.status;
  };

  /**
   * Dropping a repeating item ticks that week's occurrence rather than closing
   * the whole series - next week should come back as todo.
   */
  const move = (card: BoardCard, target: Status) => {
    const repeating = card.row.repeat_rule !== "none";
    startTransition(() => {
      if (repeating && (target === "done") !== card.occurrenceDone && card.nextDay) {
        void toggleOccurrence(card.row.id, card.nextDay);
      } else if (!repeating || target !== "done") {
        void setAssignmentStatus(card.row.id, target);
      }
    });
  };

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {COLUMNS.map((col) => {
        const items = cards.filter((c) => columnOf(c) === col.key);
        return (
          <div
            key={col.key}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(col.key);
            }}
            onDragLeave={() => setDragOver((d) => (d === col.key ? null : d))}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(null);
              const id = Number(e.dataTransfer.getData("text/plain"));
              const card = cards.find((c) => c.row.id === id);
              if (card) move(card, col.key);
            }}
            className={cx(
              "rounded-xl border border-dashed p-2 transition-colors",
              dragOver === col.key ? "border-[var(--accent)] bg-accent-soft/40" : "border-transparent",
            )}
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-semibold tracking-wide text-dim">{col.label}</span>
              <span className="text-xs tabular-nums text-dim">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.map((card) => {
                const { row } = card;
                const at = card.nextDay
                  ? row.due_at && row.due_at.length > 10
                    ? `${card.nextDay}${row.due_at.slice(10)}`
                    : card.nextDay
                  : null;
                const due = dueMeta(at, columnOf(card) === "done");
                return (
                  <AssignmentForm
                    key={row.id}
                    assignment={row}
                    courses={courses}
                    trigger={
                      <Card
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("text/plain", String(row.id))}
                        className={cx(
                          "w-full cursor-grab p-3 text-left transition-shadow active:cursor-grabbing hover:shadow-md",
                          columnOf(card) === "done" && "opacity-60",
                        )}
                      >
                        <div className="flex items-start gap-2">
                          {row.priority === "high" ? (
                            <span
                              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-danger"
                              title="高優先"
                            />
                          ) : null}
                          <span
                            className={cx(
                              "flex-1 text-sm leading-snug",
                              columnOf(card) === "done" && "line-through",
                            )}
                          >
                            {row.title}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Badge>
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{
                                background: colorOf(row.course_color ?? KIND_COLOR[row.kind]),
                              }}
                            />
                            {KIND_LABEL[row.kind]}
                          </Badge>
                          {row.course_name ? <Badge>{row.course_name}</Badge> : null}
                          {row.repeat_rule !== "none" ? (
                            <Badge tone="accent">
                              {row.repeat_rule === "weekly" ? "每週" : "每兩週"}
                            </Badge>
                          ) : null}
                          {row.location ? <Badge>{row.location}</Badge> : null}
                          {row.weight ? <Badge>{row.weight}%</Badge> : null}
                          <span className={cx("ml-auto text-[11px] tabular-nums", DUE_CLASS[due.tone])}>
                            {due.label}
                          </span>
                        </div>
                      </Card>
                    }
                  />
                );
              })}
              {items.length === 0 ? (
                <p className="px-1 py-6 text-center text-xs text-dim">拖曳卡片到這裡</p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
