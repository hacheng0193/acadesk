"use client";

import { useRef, useState, useTransition } from "react";
import { saveSynthesis } from "@/app/actions/reviews";
import { shortCite } from "@/lib/review-export";
import type { ReviewPaperRow } from "@/lib/types";
import { Markdown } from "./Markdown";
import { Button, cx, inputClass } from "./ui";

export function SynthesisEditor({
  reviewId,
  initial,
  papers,
}: {
  reviewId: number;
  initial: string;
  papers: ReviewPaperRow[];
}) {
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [editing, setEditing] = useState(!initial.trim());
  const [pending, startTransition] = useTransition();
  const area = useRef<HTMLTextAreaElement>(null);
  const dirty = text !== saved;

  const save = () =>
    startTransition(async () => {
      await saveSynthesis(reviewId, text);
      setSaved(text);
    });

  /** Drop a "[Chen et al. 2023]" at the cursor. */
  const cite = (paper: ReviewPaperRow) => {
    const el = area.current;
    const tag = `[${shortCite(paper)}]`;
    const at = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? at;
    setText(text.slice(0, at) + tag + text.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + tag.length, at + tag.length);
    });
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-surface-2 p-0.5 text-xs">
          {[
            [true, "編輯"],
            [false, "預覽"],
          ].map(([mode, label]) => (
            <button
              key={String(label)}
              type="button"
              onClick={() => setEditing(mode as boolean)}
              className={cx(
                "rounded-md px-2.5 py-1 transition-colors",
                editing === mode ? "bg-surface font-medium text-ink shadow-sm" : "text-dim hover:text-ink",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {editing && papers.length ? (
          <select
            value=""
            onChange={(e) => {
              const p = papers.find((x) => x.id === Number(e.target.value));
              if (p) cite(p);
            }}
            className={cx(inputClass, "h-7 w-44 py-0 text-xs")}
          >
            <option value="">插入引用…</option>
            {papers.map((p) => (
              <option key={p.id} value={p.id}>
                {shortCite(p)} — {p.title}
              </option>
            ))}
          </select>
        ) : null}
        <span className="ml-auto text-xs text-dim">{pending ? "儲存中…" : dirty ? "尚未儲存" : ""}</span>
        <Button size="sm" variant="primary" disabled={!dirty || pending} onClick={save}>
          儲存
        </Button>
      </div>
      {editing ? (
        <textarea
          ref={area}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "s") {
              e.preventDefault();
              if (dirty) save();
            }
          }}
          rows={14}
          placeholder={"整理各篇論文的共通點、分歧與研究缺口…\n支援 Markdown 與 $LaTeX$，⌘S 儲存。"}
          className={cx(inputClass, "w-full font-mono text-xs leading-relaxed")}
        />
      ) : text.trim() ? (
        <div className="rounded-lg border border-line px-4 py-3">
          <Markdown>{text}</Markdown>
        </div>
      ) : (
        <p className="text-xs text-dim">還沒有內容。</p>
      )}
    </div>
  );
}
