"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { attachImage, deleteNote, saveNote } from "@/app/actions/notes";
import { Button, cx, inputClass } from "./ui";
import { VaultLinkPicker } from "./VaultLinkPicker";

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
  const [uploading, setUploading] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  // `[[` autocomplete: what has been typed after the brackets, and the matches.
  const [pick, setPick] = useState<{ query: string; start: number } | null>(null);
  const [matches, setMatches] = useState<{ rel: string; title: string }[]>([]);
  const [active, setActive] = useState(0);
  // Inline path box for local-file links (window.prompt is unavailable in some embedded browsers).
  const [browsing, setBrowsing] = useState(false);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
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

  /**
   * Drop text in where the cursor is, the way typing would, so an embed lands
   * mid-sentence instead of at the end of the note.
   */
  const insertAtCursor = (text: string) => {
    const area = areaRef.current;
    const at = area ? area.selectionStart : content.length;
    const end = area ? area.selectionEnd : content.length;
    const next = content.slice(0, at) + text + content.slice(end);
    setContent(next);
    setStatus("idle");
    // React rewrites the value, so the caret has to be put back afterwards.
    requestAnimationFrame(() => {
      if (!area) return;
      area.focus();
      area.selectionStart = area.selectionEnd = at + text.length;
    });
  };

  /**
   * Copy-paste an image straight into the note: the file is written into the
   * vault's attachment folder and the note gets an Obsidian-style embed, so
   * the same picture shows up on both sides.
   */
  const attach = async (file: File) => {
    setUploading(true);
    const fd = new FormData();
    fd.set("file", file);
    const result = await attachImage(fd);
    setUploading(false);
    if (!result.ok) {
      setStatus("error");
      setMessage(result.error);
      return;
    }
    setMessage("");
    insertAtCursor(`\n${result.embed}\n`);
  };

  /** Open or close the `[[` picker depending on what sits just before the caret. */
  const watchWikilink = (text: string, caret: number) => {
    const m = /\[\[([^\[\]\n|#]*)$/.exec(text.slice(0, caret));
    setPick(m ? { query: m[1], start: caret - m[1].length } : null);
    setActive(0);
  };

  useEffect(() => {
    if (!pick || !pick.query.trim()) {
      setMatches([]);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/notes/search?q=${encodeURIComponent(pick.query)}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => setMatches(d.results ?? []))
      .catch(() => {});
    return () => controller.abort();
  }, [pick]);

  const choose = (title: string) => {
    if (!pick) return;
    const area = areaRef.current;
    const caret = area ? area.selectionStart : pick.start + pick.query.length;
    // Swallow a `]]` that is already there (auto-paired or typed ahead).
    const tail = content.slice(caret).replace(/^\]\]/, "");
    const next = `${content.slice(0, pick.start)}${title}]]${tail}`;
    const at = pick.start + title.length + 2;
    setContent(next);
    setStatus("idle");
    setPick(null);
    requestAnimationFrame(() => {
      if (!area) return;
      area.focus();
      area.selectionStart = area.selectionEnd = at;
    });
  };

  /**
   * Link to a file anywhere on this machine. It is a plain `file://` link, so
   * the server never touches the file - the browser or Obsidian opens it.
   */
  const browse = async (kind: "file" | "folder") => {
    setBrowsing(true);
    try {
      const res = await fetch("/api/local/pick", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const data = await res.json();
      if (data.path) insertLocalFile(data.path);
      else if (data.error) {
        setStatus("error");
        setMessage(data.error);
      }
    } catch {
      setStatus("error");
      setMessage("無法開啟選擇視窗，請直接貼上路徑。");
    } finally {
      setBrowsing(false);
    }
  };

  const insertLocalFile = (input: string) => {
    const raw = input.trim().replace(/^["']|["']$/g, "");
    if (!raw) return;
    const win = /^[A-Za-z]:[\\/]/.test(raw);
    if (!win && !raw.startsWith("/") && !/^file:\/\//i.test(raw)) {
      setStatus("error");
      setMessage("請輸入絕對路徑（以 / 開頭，或 Windows 的 C:\\…）。");
      return;
    }
    const posix = raw.replace(/^file:\/\//i, "").replace(/\\/g, "/");
    const href = `file://${win ? "/" : ""}${encodeURI(posix)}`;
    const name = posix.split("/").filter(Boolean).pop() ?? posix;
    setMessage("");
    setFilePath(null);
    insertAtCursor(`[${name.replace(/[\[\]]/g, "")}](${href})`);
  };

  const imageFrom = (data: DataTransfer | null): File | null =>
    [...(data?.files ?? [])].find((f) => f.type.startsWith("image/")) ?? null;

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
          {uploading
            ? "上傳圖片中…"
            : status === "saving"
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
            onClick={() => {
              setFilePath(null);
              setLinking((v) => !v);
            }}
            title="搜尋 vault 裡的筆記或附件（檔名或內文），在游標處插入 Obsidian 連結；在「編輯」或「並排」模式下使用。"
            disabled={mode === "preview"}
          >
            插入筆記
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setLinking(false);
              setFilePath((v) => (v === null ? "" : null));
            }}
            title="在游標處插入本地檔案連結（file://）；在「編輯」或「並排」模式下使用。輸入 [[ 可連結其他筆記。"
            disabled={mode === "preview"}
          >
            插入檔案連結
          </Button>
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

      {linking && mode !== "preview" ? (
        <VaultLinkPicker
          onInsert={(link) => {
            setLinking(false);
            insertAtCursor(link);
          }}
          onClose={() => {
            setLinking(false);
            areaRef.current?.focus();
          }}
        />
      ) : null}

      {filePath !== null ? (
        <form
          className="mb-3 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            insertLocalFile(filePath);
          }}
        >
          <input
            autoFocus
            value={filePath}
            onChange={(e) => setFilePath(e.target.value)}
            placeholder="貼上完整路徑，或用右邊按鈕選擇"
            className={cx(inputClass, "flex-1 text-xs")}
          />
          <Button type="button" size="sm" variant="outline" disabled={browsing} onClick={() => void browse("file")}>
            {browsing ? "選擇中…" : "選擇檔案…"}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={browsing} onClick={() => void browse("folder")}>
            選擇資料夾…
          </Button>
          <Button type="submit" size="sm" variant="primary" disabled={!filePath.trim()}>
            插入
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setFilePath(null)}>
            取消
          </Button>
        </form>
      ) : null}

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
          <div className="relative min-h-0">
          <textarea
            ref={areaRef}
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setStatus("idle");
              watchWikilink(e.target.value, e.target.selectionStart);
            }}
            onBlur={() => setTimeout(() => setPick(null), 150)}
            onKeyDown={(e) => {
              if (!pick || !matches.length) return;
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const n = matches.length;
                setActive((a) => (e.key === "ArrowDown" ? (a + 1) % n : (a - 1 + n) % n));
              } else if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                choose(matches[active].title);
              } else if (e.key === "Escape") {
                setPick(null);
              }
            }}
            onPaste={(e) => {
              const file = imageFrom(e.clipboardData);
              if (!file) return; // plain text: let the browser paste it
              e.preventDefault();
              void attach(file);
            }}
            onDragOver={(e) => {
              if (imageFrom(e.dataTransfer)) e.preventDefault();
            }}
            onDrop={(e) => {
              const file = imageFrom(e.dataTransfer);
              if (!file) return;
              e.preventDefault();
              void attach(file);
            }}
            spellCheck={false}
            className="h-full w-full resize-none rounded-xl border border-line bg-surface p-4 font-mono text-[13px] leading-relaxed text-ink focus:border-[var(--accent)] focus:outline-none"
          />
          {pick && matches.length ? (
            <ul className="absolute left-4 top-4 z-10 max-h-56 w-72 overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-[var(--shadow)]">
              {matches.map((m, i) => (
                <li key={m.rel}>
                  <button
                    type="button"
                    // mousedown, not click: the textarea's blur would close the list first.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      choose(m.title);
                    }}
                    className={cx(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs",
                      i === active ? "bg-surface-2" : "hover:bg-surface-2",
                    )}
                  >
                    <span className="truncate">{m.title}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-dim">
                      {m.rel.split("/").slice(0, -1).join("/")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          </div>
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
