"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { deleteNote, saveNote } from "@/app/actions/notes";
import { Button, cx } from "./ui";

type Mode = "edit" | "split" | "preview";

export function NoteEditor({
  relPath,
  initialContent,
  initialMtime,
  previewHtml,
  obsidianUri,
  afterDelete,
}: {
  relPath: string;
  initialContent: string;
  initialMtime: number;
  previewHtml: string;
  obsidianUri: string;
  /** Where to go once the note is gone. */
  afterDelete: string;
}) {
  const [content, setContent] = useState(initialContent);
  const [saved, setSaved] = useState(initialContent);
  const [mtime, setMtime] = useState(initialMtime);
  // Opening a note is usually reading, not editing.
  const [mode, setMode] = useState<Mode>("preview");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [conflict, setConflict] = useState<{ current: string; mtime: number } | null>(null);
  const [copied, setCopied] = useState<"" | "ok" | "fail">("");
  const [message, setMessage] = useState("");
  const [deleting, setDeleting] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

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

  /**
   * Copies the Markdown source rather than the rendered text: it is what the
   * note actually is, and it survives pasting into anything that understands
   * Markdown. Takes the on-screen content, so unsaved edits come along too.
   */
  const copyAll = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(content);
      ok = true;
    } catch {
      // Clipboard API needs a focused, permitted document. Fall back to the
      // old selection-based copy, which works in a few places it doesn't.
      try {
        const scratch = document.createElement("textarea");
        scratch.value = content;
        scratch.style.position = "fixed";
        scratch.style.opacity = "0";
        document.body.appendChild(scratch);
        scratch.select();
        ok = document.execCommand("copy");
        scratch.remove();
      } catch {
        ok = false;
      }
    }
    setCopied(ok ? "ok" : "fail");
    setTimeout(() => setCopied(""), 2200);
  };

  const remove = async () => {
    const name = relPath.split("/").pop()?.replace(/\.md$/i, "");
    const warning = dirty ? "\n\n目前還有未儲存的修改，也會一起捨棄。" : "";
    if (!confirm(`刪除「${name}」？\n檔案會移到 vault 的 .trash 資料夾，並解除所有連結。${warning}`)) return;
    setDeleting(true);
    const result = await deleteNote(relPath);
    if (!result.ok) {
      setDeleting(false);
      setStatus("error");
      setMessage(result.error);
      return;
    }
    // Skip the unsaved-edits prompt: the user just chose to throw them away.
    setSaved(content);
    router.push(afterDelete);
  };

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
          <Button
            variant="outline"
            size="sm"
            onClick={copyAll}
            title={
              copied === "fail"
                ? "瀏覽器擋下了複製，改用「編輯」模式按 ⌘A 再 ⌘C"
                : "複製整份筆記的 Markdown 原始內容"
            }
          >
            {copied === "ok" ? "已複製" : copied === "fail" ? "複製失敗" : "複製全文"}
          </Button>
          <a href={obsidianUri} className="text-xs text-dim hover:text-ink" title="用 Obsidian 開啟">
            用 Obsidian 開啟 ↗
          </a>
          <Button
            variant="danger"
            size="sm"
            disabled={deleting}
            onClick={() => void remove()}
            title="移到 vault 的 .trash 資料夾"
          >
            {deleting ? "刪除中…" : "刪除"}
          </Button>
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
