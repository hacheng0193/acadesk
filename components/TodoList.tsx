"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { addTodo, clearDoneTodos, deleteTodo, toggleTodo } from "@/app/actions/todos";
import { today } from "@/lib/dates";
import type { Todo } from "@/lib/types";
import { cx } from "./ui";

/**
 * Compact daily list for the sidebar. Toggles are optimistic so a checkbox
 * responds instantly rather than waiting on the server round trip.
 */
export function TodoList({ todos }: { todos: Todo[] }) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const [optimistic, applyOptimistic] = useOptimistic(
    todos,
    (state, action: { type: "toggle"; id: number } | { type: "add"; title: string }) => {
      if (action.type === "toggle") {
        return state.map((t) => (t.id === action.id ? { ...t, done: t.done ? 0 : 1 } : t));
      }
      return [
        ...state,
        {
          id: -Date.now(),
          day: today(),
          title: action.title,
          done: 0,
          sort_order: 9e9,
          completed_at: null,
          created_at: "",
        },
      ];
    },
  );

  const visible = [...optimistic].sort(
    (a, b) => a.done - b.done || a.day.localeCompare(b.day) || a.sort_order - b.sort_order,
  );
  const doneCount = visible.filter((t) => t.done).length;
  const todayStr = today();

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    const fd = new FormData();
    fd.set("title", title);
    startTransition(async () => {
      applyOptimistic({ type: "add", title });
      await addTodo(fd);
    });
    inputRef.current?.focus();
  };

  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-medium text-dim">今日待辦</span>
        {visible.length ? (
          <span className="text-[11px] tabular-nums text-dim">
            {doneCount}/{visible.length}
          </span>
        ) : null}
        {doneCount > 0 ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => void clearDoneTodos())}
            className="ml-auto text-[11px] text-dim transition-colors hover:text-ink"
            title="清掉已完成的項目"
          >
            清除已完成
          </button>
        ) : null}
      </div>

      {visible.length ? (
        <ul className="mb-2 max-h-52 space-y-0.5 overflow-y-auto">
          {visible.map((t) => (
            <li key={t.id} className="group flex items-start gap-2">
              <button
                type="button"
                aria-label={t.done ? "標記為未完成" : "標記為完成"}
                disabled={t.id < 0}
                onClick={() =>
                  startTransition(async () => {
                    applyOptimistic({ type: "toggle", id: t.id });
                    await toggleTodo(t.id);
                  })
                }
                className={cx(
                  "mt-[3px] grid h-3.5 w-3.5 shrink-0 place-items-center rounded border text-[9px] leading-none transition-colors",
                  t.done
                    ? "border-transparent bg-[var(--ok)] text-white"
                    : "border-line hover:border-[var(--accent)]",
                )}
              >
                {t.done ? "✓" : ""}
              </button>
              <span
                className={cx(
                  "min-w-0 flex-1 break-words text-xs leading-snug",
                  !!t.done && "text-dim line-through",
                )}
              >
                {t.title}
                {!t.done && t.day < todayStr ? (
                  <span
                    className="ml-1 whitespace-nowrap text-[10px] text-[var(--warn)]"
                    title={`從 ${t.day} 延續下來`}
                  >
                    {t.day.slice(5)}
                  </span>
                ) : null}
              </span>
              <button
                type="button"
                aria-label="刪除"
                disabled={t.id < 0}
                onClick={() => startTransition(() => void deleteTodo(t.id))}
                className="shrink-0 text-xs leading-none text-dim opacity-0 transition-opacity hover:text-danger focus:opacity-100 group-hover:opacity-100"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <form onSubmit={submit}>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="＋ 今天要做…"
          className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink placeholder:text-dim/70 focus:border-[var(--accent)] focus:outline-none"
        />
      </form>
    </div>
  );
}
