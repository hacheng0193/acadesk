"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveNote } from "@/app/actions/notes";
import { Button, cx } from "./ui";

type Mode = "edit" | "split" | "preview";

export function NoteEditor({
  relPath,
  initialContent,
  initialMtime,
  previewHtml,
  obsidianUri,
}: {
  relPath: string;
  initialContent: string;
  initialMtime: number;
  previewHtml: string;
  obsidianUri: string;
}) {
  const [content, setContent] = useState(initialContent);
  const [saved, setSaved] = useState(initialContent);
  const [mtime, setMtime] = useState(initialMtime);
  const [mode, setMode] = useState<Mode>("split");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [conflict, setConflict] = useState<{ current: string; mtime: number } | null>(null);
  const [message, setMessage] = useState("");
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const dirty = content !== saved;

  const persist = useCallback(
    async (text: string, expected: number | null) => {
      setStatus("saving");
      const result = await saveNote(relPath, text, expected);
      if (result.ok) {
        setSaved(text);
        setMtime(result.mtime);
        setStatus("saved");
        setMessage("");
        setConflict(null);
        return;
      }
      if ("conflict" in result) {
        setStatus("error");
        setConflict({ current: result.current, mtime: result.mtime });
        setMessage("這個檔案在 Obsidian 那邊已被修改。");
        return;
      }
      setStatus("error");
      setMessage(result.error);
    },
    [relPath],
  );

  // ⌘S saves; the browser's own save dialog is never what you want here.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (content !== saved) void persist(content, mtime);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [content, saved, mtime, persist]);

  // Warn before losing unsaved edits.
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  return (
    <div className="flex h-[calc(100dvh-9rem)] flex-col">
      <div className="mb-3 flex items-center gap-2">
        <div className="inline-flex gap-1 rounded-lg bg-surface-2 p-1">
          {(["edit", "split", "preview"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cx(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                mode === m ? "bg-surface text-ink shadow-[var(--shadow)]" : "text-dim hover:text-ink",
              )}
            >
              {m === "edit" ? "編輯" : m === "split" ? "並排" : "預覽"}
            </button>
          ))}
        </div>

        <span className="ml-2 text-xs text-dim">
          {status === "saving"
            ? "儲存中…"
            : dirty
              ? "未儲存"
              : status === "saved"
                ? "已儲存"
                : ""}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <a href={obsidianUri} className="text-xs text-dim hover:text-ink" title="用 Obsidian 開啟">
            用 Obsidian 開啟 ↗
          </a>
          <Button
            variant="primary"
            size="sm"
            disabled={!dirty || status === "saving"}
            onClick={() => void persist(content, mtime)}
          >
            儲存 ⌘S
          </Button>
        </div>
      </div>

      {conflict ? (
        <div className="mb-3 rounded-lg border border-[var(--warn)] bg-warn-soft p-3 text-xs">
          <p className="font-medium text-[var(--warn)]">{message}</p>
          <p className="mt-1 text-dim">
            為避免蓋掉那邊的修改，這次沒有寫入。選擇要保留哪一份：
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setContent(conflict.current);
                setSaved(conflict.current);
                setMtime(conflict.mtime);
                setConflict(null);
                setStatus("idle");
              }}
            >
              載入磁碟上的版本（放棄我的編輯）
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => void persist(content, conflict.mtime)}
            >
              用我的版本覆蓋
            </Button>
          </div>
        </div>
      ) : null}

      {status === "error" && !conflict ? (
        <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{message}</p>
      ) : null}

      <div
        className={cx(
          "min-h-0 flex-1 gap-3",
          mode === "split" ? "grid grid-cols-2" : "grid grid-cols-1",
        )}
      >
        {mode !== "preview" ? (
          <textarea
            ref={areaRef}
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setStatus("idle");
            }}
            spellCheck={false}
            className="h-full w-full resize-none rounded-xl border border-line bg-surface p-4 font-mono text-[13px] leading-relaxed text-ink focus:border-[var(--accent)] focus:outline-none"
          />
        ) : null}
        {mode !== "edit" ? (
          <div className="h-full overflow-y-auto rounded-xl border border-line bg-surface p-4">
            {dirty ? (
              <LivePreview markdown={content} />
            ) : (
              <div className="prose-note text-sm" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * While editing, the server-rendered HTML is stale, so show a plain-text
 * rendering of the draft rather than pretending it is formatted.
 */
function LivePreview({ markdown }: { markdown: string }) {
  const [html, setHtml] = useState("");
  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(() => {
      fetch("/api/notes/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ markdown }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (!cancelled) setHtml(d.html ?? "");
        })
        .catch(() => {});
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [markdown]);
  return <div className="prose-note text-sm" dangerouslySetInnerHTML={{ __html: html }} />;
}
