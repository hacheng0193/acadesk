"use client";

import Link from "next/link";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { saveNote } from "@/app/actions/notes";
import type { PaperNote } from "@/lib/paper-notes";
import { Markdown } from "./Markdown";
import { cx } from "./ui";

export type NotesHandle = {
  /** Insert a block at the cursor (or at the end) and save. */
  insert: (text: string) => void;
};

const SAVE_DELAY = 800;

/** Frontmatter is the app's bookkeeping (paper id, title...): kept, but not shown. */
function split(file: string): [string, string] {
  const m = file.match(/^---\n[\s\S]*?\n---\n+/);
  return m ? [m[0].replace(/\n+$/, "\n\n"), file.slice(m[0].length)] : ["", file];
}

/**
 * The paper's vault note, edited beside the PDF. Saves on its own a moment
 * after typing stops, through the same conflict-checked path as the notes page,
 * so an edit made in Obsidian meanwhile is not overwritten.
 */
export function PaperNotesPanel({ note, ref }: { note: PaperNote; ref?: Ref<NotesHandle> }) {
  const [initialFm, initialBody] = split(note.ok ? note.content : "");
  const frontmatter = useRef(initialFm);
  const [content, setContent] = useState(initialBody);
  const [mtime, setMtime] = useState(note.ok ? note.mtime : 0);
  const [status, setStatus] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState<{ current: string; mtime: number } | null>(null);
  const [preview, setPreview] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The latest values, for the debounced save and the unload guard.
  const latest = useRef({ content, mtime, status });
  latest.current = { content, mtime, status };

  const rel = note.ok ? note.rel : "";

  const save = async (force = false) => {
    if (!rel) return;
    const { content: body, mtime: seen } = latest.current;
    setStatus("saving");
    const result = await saveNote(rel, frontmatter.current + body, force ? null : seen);
    if (result.ok) {
      setMtime(result.mtime);
      latest.current.mtime = result.mtime;
      // Typing during the save leaves it dirty; the pending timer saves again.
      setStatus(latest.current.content === body ? "saved" : "dirty");
      setConflict(null);
    } else if ("conflict" in result) {
      setConflict({ current: result.current, mtime: result.mtime });
      setStatus("error");
    } else {
      setMessage(result.error);
      setStatus("error");
    }
  };

  const schedule = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), SAVE_DELAY);
  };

  const change = (next: string) => {
    setContent(next);
    latest.current.content = next;
    setStatus("dirty");
    schedule();
  };

  useImperativeHandle(ref, () => ({
    insert(text) {
      setPreview(false);
      const el = area.current;
      const body = latest.current.content;
      // At the cursor if the textarea has had focus, else at the end.
      const at = el && el.dataset.touched ? el.selectionStart : body.length;
      const before = body.slice(0, at);
      const after = body.slice(at);
      const lead = before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
      const block = `${lead}${text.trimEnd()}\n\n`;
      change(before + block + after.replace(/^\n+/, ""));
      requestAnimationFrame(() => {
        if (!area.current) return;
        const pos = (before + block).length;
        area.current.focus();
        area.current.setSelectionRange(pos, pos);
        area.current.dataset.touched = "1";
      });
    },
  }));

  // Save before leaving, and flush a pending save on unmount.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (latest.current.status === "dirty" || latest.current.status === "saving") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      if (timer.current) {
        clearTimeout(timer.current);
        if (latest.current.status === "dirty") void save();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!note.ok) {
    return (
      <div className="space-y-2 p-4 text-sm">
        <p className="text-danger">{note.error}</p>
        <Link href="/settings" className="text-xs text-[var(--accent)] hover:underline">
          前往設定 vault 路徑 →
        </Link>
      </div>
    );
  }

  const label = { saved: "已儲存", dirty: "編輯中…", saving: "儲存中…", error: "未儲存" }[status];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-[11px] text-dim">
        <span className="min-w-0 flex-1 truncate" title={rel}>
          {rel}
        </span>
        <button type="button" onClick={() => setPreview(!preview)} className="hover:text-ink">
          {preview ? "編輯" : "預覽"}
        </button>
        <Link
          href={`/notes/${rel.split("/").map(encodeURIComponent).join("/")}`}
          className="hover:text-ink"
          title="在筆記頁開啟（完整編輯器）"
        >
          開啟 ↗
        </Link>
        <span className={cx("w-12 text-right", status === "error" && "text-danger")}>{label}</span>
      </div>

      {conflict ? (
        <div className="space-y-1.5 border-b border-line bg-warn-soft px-3 py-2 text-xs">
          <p>這份筆記在別處（例如 Obsidian）被改過了。</p>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded border border-line bg-surface px-2 py-0.5 hover:bg-surface-2"
              onClick={() => {
                const [fm, body] = split(conflict.current);
                frontmatter.current = fm;
                setContent(body);
                latest.current.content = body;
                setMtime(conflict.mtime);
                setConflict(null);
                setStatus("saved");
              }}
            >
              載入外部版本
            </button>
            <button
              type="button"
              className="rounded border border-line bg-surface px-2 py-0.5 hover:bg-surface-2"
              onClick={() => void save(true)}
            >
              用我的版本覆蓋
            </button>
          </div>
        </div>
      ) : null}
      {message && status === "error" && !conflict ? (
        <p className="border-b border-line bg-danger-soft px-3 py-1.5 text-xs text-danger">{message}</p>
      ) : null}

      {preview ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <Markdown>{content}</Markdown>
        </div>
      ) : (
        <textarea
          ref={area}
          value={content}
          onChange={(e) => change(e.target.value)}
          onFocus={(e) => (e.currentTarget.dataset.touched = "1")}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "s") {
              e.preventDefault();
              if (timer.current) clearTimeout(timer.current);
              void save();
            }
          }}
          spellCheck={false}
          placeholder="寫下關於這篇論文的筆記…（Markdown）"
          className="min-h-0 flex-1 resize-none bg-transparent px-4 py-3 font-mono text-xs leading-relaxed text-ink outline-none"
        />
      )}
    </div>
  );
}
