"use client";

import type { ReactNode } from "react";
import { cx } from "./ui";

/** A row of tag chips; picking several narrows to notes that carry all of them. */
export function TagFilter({
  tags,
  selected,
  onToggle,
  onClear,
}: {
  tags: { tag: string; count: number }[];
  selected: string[];
  onToggle: (tag: string) => void;
  onClear: () => void;
}): ReactNode {
  if (!tags.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map(({ tag, count }) => {
        const on = selected.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            onClick={() => onToggle(tag)}
            aria-pressed={on}
            className={cx(
              "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
              on
                ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                : "border-line bg-surface-2 text-dim hover:text-ink",
            )}
          >
            #{tag} <span className="opacity-60">{count}</span>
          </button>
        );
      })}
      {selected.length ? (
        <button type="button" onClick={onClear} className="ml-1 text-[11px] text-dim hover:text-ink">
          清除篩選
        </button>
      ) : null}
    </div>
  );
}
