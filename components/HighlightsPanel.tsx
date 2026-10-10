"use client";

import { useEffect, useRef, useState } from "react";
import { deleteHighlight, updateHighlight } from "@/app/actions/highlights";
import { HIGHLIGHT_COLORS, type PaperHighlight } from "@/lib/types";
import { HIGHLIGHT_FILL } from "./PdfViewer";
import { cx } from "./ui";

/** A highlight as a Markdown quote for the notes: `> text — p.N`, then the comment. */
export function quoteFor(h: { text: string; page: number; comment: string }): string {
  const quote = `> ${h.text.trim().replace(/\n+/g, " ")} — p.${h.page}`;
  return h.comment.trim() ? `${quote}\n\n${h.comment.trim()}` : quote;
}

export function HighlightsPanel({
  highlights,
  setHighlights,
  active,
  setActive,
  editing,
  setEditing,
  goTo,
  insertIntoNotes,
  askAbout,
}: {
  highlights: PaperHighlight[];
  setHighlights: React.Dispatch<React.SetStateAction<PaperHighlight[]>>;
  active: number | null;
  setActive: (id: number | null) => void;
  editing: number | null;
  setEditing: (id: number | null) => void;
  goTo: (page: number, y?: number) => void;
  insertIntoNotes: (text: string) => void;
  askAbout: (text: string, page?: number) => void;
}) {
  const list = useRef<HTMLDivElement>(null);

  // Bring the highlight picked in the PDF into view here.
  useEffect(() => {
    if (active == null) return;
    list.current?.querySelector(`[data-highlight="${active}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active]);

  const patch = (id: number, p: Partial<PaperHighlight>) =>
    setHighlights((all) => all.map((h) => (h.id === id ? { ...h, ...p } : h)));

  if (!highlights.length) {
    return (
      <p className="px-6 py-16 text-center text-sm text-dim">
        在左邊的論文裡反白文字，選一個顏色就會收集到這裡。
      </p>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center border-b border-line px-3 py-1.5 text-[11px] text-dim">
        <span className="flex-1">{highlights.length} 個 highlight</span>
        <button
          type="button"
          className="hover:text-ink"
          onClick={() => insertIntoNotes(`## Highlights\n\n${highlights.map(quoteFor).join("\n\n")}`)}
        >
          全部匯出到筆記
        </button>
      </div>
      <div ref={list} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {highlights.map((h) => (
          <article
            key={h.id}
            data-highlight={h.id}
            onClick={() => {
              setActive(h.id);
              goTo(h.page, h.rects[0]?.y);
            }}
            className={cx(
              "group cursor-pointer rounded-lg border bg-surface p-2.5 text-xs transition-colors",
              active === h.id ? "border-[var(--accent)]" : "border-line hover:border-dim",
            )}
          >
            <div className="flex gap-2">
              <span
                className="w-1 shrink-0 rounded-full"
                style={{ background: HIGHLIGHT_FILL[h.color]?.replace(/[\d.]+\)$/, "0.9)") }}
              />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-5 leading-relaxed text-ink">{h.text}</p>
                <div className="mt-1 text-[11px] text-dim">p.{h.page}</div>
              </div>
            </div>

            {editing === h.id ? (
              <CommentEditor
                initial={h.comment}
                onDone={(comment) => {
                  setEditing(null);
                  if (comment !== h.comment) {
                    patch(h.id, { comment });
                    void updateHighlight(h.id, { comment });
                  }
                }}
              />
            ) : h.comment ? (
              <p
                className="mt-2 whitespace-pre-wrap rounded-md bg-surface-2 px-2 py-1.5 text-ink"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(h.id);
                }}
              >
                {h.comment}
              </p>
            ) : null}

            <div
              className={cx(
                "mt-2 flex flex-wrap items-center gap-2 text-[11px] text-dim",
                active === h.id ? "flex" : "hidden group-hover:flex",
              )}
              onClick={(e) => e.stopPropagation()}
            >
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  onClick={() => {
                    patch(h.id, { color: c });
                    void updateHighlight(h.id, { color: c });
                  }}
                  className={cx("h-3.5 w-3.5 rounded-full border", h.color === c ? "border-ink" : "border-black/10")}
                  style={{ background: HIGHLIGHT_FILL[c] }}
                />
              ))}
              <span className="h-3 w-px bg-line" />
              <button type="button" className="hover:text-ink" onClick={() => setEditing(h.id)}>
                {h.comment ? "改註解" : "加註解"}
              </button>
              <button type="button" className="hover:text-ink" onClick={() => insertIntoNotes(quoteFor(h))}>
                插入筆記
              </button>
              <button type="button" className="hover:text-ink" onClick={() => askAbout(h.text, h.page)}>
                問 AI
              </button>
              <button
                type="button"
                className="ml-auto hover:text-danger"
                onClick={() => {
                  setHighlights((all) => all.filter((x) => x.id !== h.id));
                  if (active === h.id) setActive(null);
                  void deleteHighlight(h.id);
                }}
              >
                刪除
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function CommentEditor({ initial, onDone }: { initial: string; onDone: (comment: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <textarea
      autoFocus
      value={value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onDone(value.trim())}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onDone(value.trim());
        if (e.key === "Escape") onDone(initial);
      }}
      rows={3}
      placeholder="寫下你的想法…（⌘↵ 完成）"
      className="mt-2 w-full resize-y rounded-md border border-line bg-surface-2 px-2 py-1.5 text-xs text-ink outline-none focus:border-[var(--accent)]"
    />
  );
}
