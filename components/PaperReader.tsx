"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { addHighlight } from "@/app/actions/highlights";
import { setPaperStatus } from "@/app/actions/papers";
import type { PaperNote } from "@/lib/paper-notes";
import type { PaperChat } from "@/lib/queries/papers";
import { HIGHLIGHT_COLORS, type HighlightColor, type PaperHighlight, type PaperRow, type Project } from "@/lib/types";
import { AskPanel, type AskPanelHandle } from "./AskPanel";
import { HighlightsPanel, quoteFor } from "./HighlightsPanel";
import { PaperForm } from "./PaperForm";
import { PaperNotesPanel, type NotesHandle } from "./PaperNotesPanel";
import { PdfAttachment } from "./PdfAttachment";
import { HIGHLIGHT_FILL, PdfViewer, type PdfSelection, type PdfViewerHandle } from "./PdfViewer";
import { cx, inputClass } from "./ui";

type Tab = "notes" | "highlights" | "ai";

const MIN_PANEL = 320;
const PANEL_KEY = "paper-reader-panel-width";

/**
 * The paper reader: the PDF on the left, notes / highlights / an AI chat on the
 * right - laid out like alphaXiv. Takes over the whole content area (the page
 * is fixed beside the sidebar) so both columns get the full height.
 */
export function PaperReader({
  paper,
  projects,
  fileSize,
  note,
  highlights: initialHighlights,
  chats,
  models,
}: {
  paper: PaperRow;
  projects: Project[];
  fileSize: number | null;
  note: PaperNote;
  highlights: PaperHighlight[];
  chats: PaperChat[];
  models: { claude: string; codex: string };
}) {
  const [tab, setTab] = useState<Tab>("notes");
  const [highlights, setHighlights] = useState(initialHighlights);
  const [active, setActive] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [selection, setSelection] = useState<PdfSelection | null>(null);
  const [panelWidth, setPanelWidth] = useState(440);
  const viewer = useRef<PdfViewerHandle>(null);
  const notes = useRef<NotesHandle>(null);
  const ask = useRef<AskPanelHandle>(null);

  const hasPdf = !!paper.file_path && fileSize !== null;

  useEffect(() => setHighlights(initialHighlights), [initialHighlights]);

  useEffect(() => {
    try {
      const w = Number(localStorage.getItem(PANEL_KEY));
      if (w >= MIN_PANEL) setPanelWidth(w);
    } catch {
      // Storage blocked: keep the default.
    }
  }, []);

  const dragDivider = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = panelWidth;
    let w = startW;
    const move = (ev: PointerEvent) => {
      w = Math.min(Math.max(startW + (startX - ev.clientX), MIN_PANEL), window.innerWidth * 0.65);
      setPanelWidth(w);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      try {
        localStorage.setItem(PANEL_KEY, String(Math.round(w)));
      } catch {
        // Not remembered; fine.
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const clearSelection = () => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  };

  const highlight = async (color: HighlightColor, comment = false) => {
    if (!selection) return;
    const h = await addHighlight({ paperId: paper.id, ...selection, color });
    clearSelection();
    if (!h) return;
    setHighlights((all) => [...all, h].sort((a, b) => a.page - b.page || a.id - b.id));
    setActive(h.id);
    if (comment) {
      setEditing(h.id);
      setTab("highlights");
    }
  };

  const goTo = useCallback((page: number, y?: number) => viewer.current?.goToPage(page, y), []);

  const insertIntoNotes = (text: string) => {
    setTab("notes");
    // The panel may be mounting; give it a frame.
    requestAnimationFrame(() => notes.current?.insert(text));
  };

  const askAbout = (text: string, page?: number) => {
    setTab("ai");
    requestAnimationFrame(() => ask.current?.quote(text, page));
  };

  return (
    <div className="fixed inset-y-0 right-0 left-60 z-10 flex flex-col bg-[var(--bg)]">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2">
        <Link href="/papers" className="shrink-0 text-xs text-dim hover:text-ink">
          ← 文獻
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold" title={paper.title}>
            {paper.title}
          </h1>
          <p className="truncate text-[11px] text-dim">
            {[paper.authors, paper.venue, paper.year].filter(Boolean).join("　·　")}
          </p>
        </div>
        <select
          defaultValue={paper.status}
          onChange={(e) => void setPaperStatus(paper.id, e.target.value as PaperRow["status"])}
          className={cx(inputClass, "h-8 w-24 text-xs")}
          aria-label="閱讀狀態"
        >
          <option value="to_read">待讀</option>
          <option value="reading">閱讀中</option>
          <option value="read">已讀</option>
        </select>
        {paper.url ? (
          <a href={paper.url} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-dim hover:text-ink">
            原文 ↗
          </a>
        ) : null}
        <PaperForm
          paper={paper}
          projects={projects}
          fileSize={fileSize}
          trigger={<span className="cursor-pointer text-xs text-dim hover:text-ink">編輯資訊</span>}
        />
      </header>

      <div className="flex min-h-0 flex-1">
        <section className="min-w-0 flex-1 p-3 pr-0">
          {hasPdf ? (
            <PdfViewer
              src={`/api/papers/${paper.id}/file`}
              className="h-full"
              handle={viewer}
              highlights={highlights}
              activeHighlight={active}
              onHighlightClick={(id) => {
                setActive(id);
                setTab("highlights");
              }}
              onSelect={setSelection}
              toolbarExtra={
                <a
                  href={`/api/papers/${paper.id}/file`}
                  download
                  className="mr-2 rounded px-1.5 py-0.5 hover:bg-surface-2 hover:text-ink"
                  title="下載 PDF"
                >
                  下載
                </a>
              }
            />
          ) : (
            <div className="mx-auto mt-16 max-w-md space-y-3 text-center">
              <p className="text-sm text-dim">
                {paper.file_path ? "附檔不見了，重新放一次 PDF：" : "這篇論文還沒有 PDF。拖進來就能開始閱讀和畫重點。"}
              </p>
              <PdfAttachment paperId={paper.id} fileName="" sizeBytes={null} />
            </div>
          )}
        </section>

        <div
          role="separator"
          aria-orientation="vertical"
          onPointerDown={dragDivider}
          className="w-3 shrink-0 cursor-col-resize after:mx-auto after:block after:h-full after:w-px after:bg-transparent hover:after:bg-[var(--accent)]"
        />

        <aside
          style={{ width: panelWidth }}
          className="my-3 mr-3 flex shrink-0 flex-col overflow-hidden rounded-xl border border-line bg-surface"
        >
          <nav className="flex gap-1 border-b border-line px-2 pt-2">
            {(
              [
                ["notes", "筆記"],
                ["highlights", `Highlights${highlights.length ? ` ${highlights.length}` : ""}`],
                ["ai", "問 AI"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cx(
                  "-mb-px rounded-t-lg border-b-2 px-3 py-1.5 text-xs font-medium transition-colors",
                  tab === key ? "border-[var(--accent)] text-ink" : "border-transparent text-dim hover:text-ink",
                )}
              >
                {label}
              </button>
            ))}
          </nav>
          {/* All three stay mounted so a draft or a running answer survives a tab switch. */}
          <div className={cx("min-h-0 flex-1", tab !== "notes" && "hidden")}>
            <PaperNotesPanel ref={notes} note={note} />
          </div>
          <div className={cx("min-h-0 flex-1", tab !== "highlights" && "hidden")}>
            <HighlightsPanel
              highlights={highlights}
              setHighlights={setHighlights}
              active={active}
              setActive={setActive}
              editing={editing}
              setEditing={setEditing}
              goTo={goTo}
              insertIntoNotes={insertIntoNotes}
              askAbout={askAbout}
            />
          </div>
          <div className={cx("min-h-0 flex-1", tab !== "ai" && "hidden")}>
            <AskPanel
              ref={ask}
              paperId={paper.id}
              hasPdf={hasPdf}
              chats={chats}
              models={models}
              goTo={goTo}
              insertIntoNotes={insertIntoNotes}
            />
          </div>
        </aside>
      </div>

      {selection ? (
        <SelectionMenu
          selection={selection}
          onHighlight={(c) => void highlight(c)}
          onComment={() => void highlight("yellow", true)}
          onAsk={() => {
            askAbout(selection.text, selection.page);
            clearSelection();
          }}
          onInsert={() => {
            insertIntoNotes(quoteFor({ text: selection.text, page: selection.page, comment: "" }));
            clearSelection();
          }}
          onCopy={() => {
            void navigator.clipboard?.writeText(selection.text);
            clearSelection();
          }}
        />
      ) : null}
    </div>
  );
}

function SelectionMenu({
  selection,
  onHighlight,
  onComment,
  onAsk,
  onInsert,
  onCopy,
}: {
  selection: PdfSelection;
  onHighlight: (c: HighlightColor) => void;
  onComment: () => void;
  onAsk: () => void;
  onInsert: () => void;
  onCopy: () => void;
}) {
  // Keep it on screen: below the selection, clamped to the window.
  const left = Math.min(Math.max(selection.anchor.x - 160, 8), window.innerWidth - 340);
  const top = Math.min(selection.anchor.y + 8, window.innerHeight - 48);
  const item = "rounded-md px-2 py-1 text-xs text-ink hover:bg-surface-2";
  return (
    <div
      // mousedown, not click: a click would first collapse the selection.
      onMouseDown={(e) => e.preventDefault()}
      style={{ left, top }}
      className="fixed z-30 flex items-center gap-0.5 rounded-lg border border-line bg-surface p-1 shadow-[var(--shadow)]"
    >
      {HIGHLIGHT_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          title={`Highlight（${c}）`}
          onClick={() => onHighlight(c)}
          className="mx-0.5 h-5 w-5 rounded-full border border-black/10"
          style={{ background: HIGHLIGHT_FILL[c] }}
        />
      ))}
      <span className="mx-1 h-4 w-px bg-line" />
      <button type="button" className={item} onClick={onComment}>
        註解
      </button>
      <button type="button" className={item} onClick={onAsk}>
        問 AI
      </button>
      <button type="button" className={item} onClick={onInsert}>
        插入筆記
      </button>
      <button type="button" className={item} onClick={onCopy}>
        複製
      </button>
    </div>
  );
}
