"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import {
  addReviewPaper,
  moveReviewPaper,
  removeReviewPaper,
  setCell,
  setColumns,
} from "@/app/actions/reviews";
import { shortCite } from "@/lib/review-export";
import { parseCells, type Paper, type ReviewColumn, type ReviewPaperRow } from "@/lib/types";
import { Markdown } from "./Markdown";
import { cx, inputClass } from "./ui";

type LibraryPaper = Pick<Paper, "id" | "title" | "authors" | "year">;

const ICON_BTN =
  "grid h-5 w-5 place-items-center rounded text-[11px] text-dim transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-30";

export function ReviewMatrix({
  reviewId,
  columns: initialColumns,
  rows,
  library,
}: {
  reviewId: number;
  columns: ReviewColumn[];
  rows: ReviewPaperRow[];
  library: LibraryPaper[];
}) {
  // Kept locally so renames and reorders show at once; the server copy follows.
  const [columns, setLocalColumns] = useState(initialColumns);
  useEffect(() => setLocalColumns(initialColumns), [initialColumns]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  const commitColumns = (next: ReviewColumn[]) => {
    setLocalColumns(next);
    startTransition(() => setColumns(reviewId, next));
  };

  const moveColumn = (i: number, dir: -1 | 1) => {
    const next = [...columns];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    commitColumns(next);
  };

  const addColumn = () =>
    commitColumns([...columns, { id: `c${Date.now().toString(36)}`, label: "新欄位" }]);

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2/60 text-left text-xs text-dim">
              <th className="sticky left-0 z-10 w-72 min-w-72 bg-surface-2 px-3 py-2 font-medium">論文</th>
              {columns.map((col, i) => (
                <th key={col.id} className="group min-w-56 border-l border-line px-2 py-1.5 font-medium">
                  <div className="flex items-center gap-1">
                    <input
                      defaultValue={col.label}
                      key={col.label}
                      aria-label="欄位名稱"
                      onBlur={(e) => {
                        const label = e.target.value.trim();
                        if (label && label !== col.label)
                          commitColumns(columns.map((c) => (c.id === col.id ? { ...c, label } : c)));
                        else e.target.value = col.label;
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                      className="min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 font-medium text-ink focus:bg-surface focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                    />
                    <span className="flex opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      <button type="button" className={ICON_BTN} disabled={i === 0} onClick={() => moveColumn(i, -1)} aria-label="左移">
                        ◀
                      </button>
                      <button
                        type="button"
                        className={ICON_BTN}
                        disabled={i === columns.length - 1}
                        onClick={() => moveColumn(i, 1)}
                        aria-label="右移"
                      >
                        ▶
                      </button>
                      <button
                        type="button"
                        className={cx(ICON_BTN, "hover:text-danger")}
                        aria-label={`刪除欄位 ${col.label}`}
                        onClick={() => {
                          if (confirm(`刪除欄位「${col.label}」和裡面的內容？`))
                            commitColumns(columns.filter((c) => c.id !== col.id));
                        }}
                      >
                        ×
                      </button>
                    </span>
                  </div>
                </th>
              ))}
              <th className="w-24 border-l border-line px-2 py-1.5">
                <button type="button" onClick={addColumn} className="whitespace-nowrap text-xs text-dim hover:text-ink">
                  ＋ 欄位
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((paper, r) => {
              const cells = parseCells(paper.cells_json);
              return (
                <tr key={paper.id} className="group/row border-b border-line align-top last:border-b-0">
                  <td className="sticky left-0 z-10 w-72 min-w-72 bg-surface px-3 py-2">
                    <div className="flex items-start gap-1">
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => setExpanded(expanded === paper.id ? null : paper.id)}
                          className="text-left text-sm font-medium leading-snug hover:underline"
                        >
                          {paper.title}
                        </button>
                        <p className="mt-0.5 text-xs text-dim">{shortCite(paper)}{paper.venue ? `　·　${paper.venue}` : ""}</p>
                      </div>
                      <span className="flex shrink-0 flex-col opacity-0 transition-opacity group-hover/row:opacity-100">
                        <button
                          type="button"
                          className={ICON_BTN}
                          disabled={r === 0}
                          onClick={() => startTransition(() => moveReviewPaper(reviewId, paper.id, -1))}
                          aria-label="上移"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          className={ICON_BTN}
                          disabled={r === rows.length - 1}
                          onClick={() => startTransition(() => moveReviewPaper(reviewId, paper.id, 1))}
                          aria-label="下移"
                        >
                          ▼
                        </button>
                        <button
                          type="button"
                          className={cx(ICON_BTN, "hover:text-danger")}
                          aria-label={`從回顧移除 ${paper.title}`}
                          onClick={() => {
                            if (confirm(`從這份回顧移除「${paper.title}」？（文獻庫裡的論文不會刪除）`))
                              startTransition(() => removeReviewPaper(reviewId, paper.id));
                          }}
                        >
                          ×
                        </button>
                      </span>
                    </div>
                    {expanded === paper.id ? (
                      <div className="mt-2 max-h-64 overflow-y-auto rounded-lg bg-surface-2 px-2.5 py-2">
                        {paper.notes_md.trim() ? (
                          <Markdown className="text-xs">{paper.notes_md}</Markdown>
                        ) : (
                          <p className="text-xs text-dim">這篇論文沒有筆記。</p>
                        )}
                        <Link href="/papers" className="mt-1.5 inline-block text-[11px] text-dim hover:text-ink">
                          到文獻頁編輯 →
                        </Link>
                      </div>
                    ) : null}
                  </td>
                  {columns.map((col) => (
                    <Cell
                      key={col.id}
                      value={cells[col.id] ?? ""}
                      onSave={(text) => startTransition(() => setCell(reviewId, paper.id, col.id, text))}
                    />
                  ))}
                  <td className="border-l border-line" />
                </tr>
              );
            })}
            {!rows.length ? (
              <tr>
                <td colSpan={columns.length + 2} className="px-4 py-8 text-sm text-dim">
                  {/* Sticky, so the hint stays in view however wide the matrix is. */}
                  <span className="sticky left-4">還沒有論文。從下方的文獻庫加入第一篇。</span>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <AddPaper
        library={library.filter((p) => !rows.some((r) => r.id === p.id))}
        onAdd={(id) => startTransition(() => addReviewPaper(reviewId, id))}
      />
    </div>
  );
}

/** A matrix cell: rendered Markdown, click to edit, saved on blur. */
function Cell({ value, onSave }: { value: string; onSave: (text: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  useEffect(() => {
    if (!editing) setText(value);
  }, [value, editing]);

  if (editing) {
    return (
      <td className="border-l border-line p-1">
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            setEditing(false);
            if (text !== value) onSave(text);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setText(value);
              setEditing(false);
            }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.blur();
          }}
          rows={Math.max(3, text.split("\n").length + 1)}
          className={cx(inputClass, "w-full min-w-56 px-2 py-1.5 text-xs leading-relaxed")}
        />
      </td>
    );
  }
  return (
    <td
      className="max-w-sm cursor-text border-l border-line px-3 py-2 transition-colors hover:bg-surface-2/60"
      onClick={() => setEditing(true)}
    >
      {text.trim() ? (
        <Markdown className="text-xs leading-relaxed">{text}</Markdown>
      ) : (
        <span className="text-xs text-dim/50">—</span>
      )}
    </td>
  );
}

function AddPaper({ library, onAdd }: { library: LibraryPaper[]; onAdd: (id: number) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const q = query.trim().toLowerCase();
  const matches = library
    .filter((p) => !q || p.title.toLowerCase().includes(q) || p.authors.toLowerCase().includes(q))
    .slice(0, 8);

  return (
    <div className="relative mt-3 max-w-md">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && matches[0]) {
            onAdd(matches[0].id);
            setQuery("");
          }
        }}
        placeholder={library.length ? "＋ 從文獻庫加入論文（搜尋標題、作者）" : "文獻庫裡的論文都已加入"}
        disabled={!library.length}
        className={cx(inputClass, "w-full text-xs")}
      />
      {open && matches.length ? (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface shadow-[var(--shadow)]">
          {matches.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onAdd(p.id);
                  setQuery("");
                }}
                className="block w-full px-3 py-2 text-left text-xs hover:bg-surface-2"
              >
                <span className="block truncate font-medium text-ink">{p.title}</span>
                <span className="text-dim">{shortCite(p)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
