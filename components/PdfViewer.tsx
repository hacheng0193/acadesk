"use client";

import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type Ref } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { HighlightRect, PaperHighlight } from "@/lib/types";
import { getOutline, type Outline } from "./pdf-outline";
import { Button, cx } from "./ui";

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
const MIN_ZOOM = ZOOMS[0];
const MAX_ZOOM = ZOOMS[ZOOMS.length - 1];
/** How long a page waits after the last size change before redrawing sharply. */
const REDRAW_DELAY = 150;
const OUTLINE_KEY = "pdf-outline-open";

/** Text picked in the PDF: the page it is on, where it sits, and where to put a toolbar. */
export type PdfSelection = {
  page: number;
  rects: HighlightRect[];
  text: string;
  /** Viewport coordinates just below the selection's last line. */
  anchor: { x: number; y: number };
};

export type PdfViewerHandle = {
  /** Scroll so that page `page` is in view, `y` (0-1) down the page if given. */
  goToPage: (page: number, y?: number) => void;
};

export const HIGHLIGHT_FILL: Record<string, string> = {
  yellow: "rgba(250, 204, 21, 0.38)",
  green: "rgba(74, 222, 128, 0.35)",
  blue: "rgba(96, 165, 250, 0.35)",
  pink: "rgba(244, 114, 182, 0.35)",
};

/**
 * PDF rendered with PDF.js instead of the browser's own viewer. The browser
 * pane in the Claude app has no PDF plugin and downloads any PDF it is pointed
 * at; drawing the pages onto canvases works the same everywhere.
 *
 * Pages are drawn only when they scroll near the viewport, so a 200-page deck
 * doesn't render all at once. Each page carries PDF.js's text layer, so text
 * can be selected; highlights are painted underneath it.
 */
export function PdfViewer({
  src,
  className,
  highlights,
  activeHighlight,
  onHighlightClick,
  onSelect,
  toolbarExtra,
  handle,
  onPageCount,
}: {
  src: string;
  /** Overrides the default height. */
  className?: string;
  highlights?: PaperHighlight[];
  activeHighlight?: number | null;
  onHighlightClick?: (id: number) => void;
  /** Called with the new selection, or null when it is cleared. */
  onSelect?: (selection: PdfSelection | null) => void;
  toolbarExtra?: React.ReactNode;
  handle?: Ref<PdfViewerHandle>;
  onPageCount?: (n: number) => void;
}) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const [current, setCurrent] = useState(1);
  const [dpr, setDpr] = useState(1);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [outline, setOutline] = useState<Outline | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const pageInput = useRef<HTMLInputElement>(null);
  // Where a pinch started, so the point under the fingers stays put.
  const anchor = useRef<{ x: number; y: number; px: number; py: number; zoom: number } | null>(null);

  // Pages are drawn for the screen's pixel density; ⌘+ / ⌘− changes it, and
  // without a redraw the page would just be stretched.
  useEffect(() => {
    let query: MediaQueryList | null = null;
    const update = () => {
      setDpr(window.devicePixelRatio || 1);
      query?.removeEventListener("change", update);
      query = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      query.addEventListener("change", update);
    };
    update();
    return () => query?.removeEventListener("change", update);
  }, []);

  // Trackpad pinch arrives as a wheel event with ctrlKey set. Left alone, the
  // browser magnifies the whole app and blurs the already-drawn pages; handled
  // here it becomes a zoom of the PDF, which is then redrawn at full sharpness.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      setZoom((z) => {
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * Math.exp(-e.deltaY * 0.01)));
        if (next === z) return z;
        anchor.current = { x: el.scrollLeft + px, y: el.scrollTop + py, px, py, zoom: z };
        return next;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // After a pinch re-lays the pages out, scroll so the pinched point is back under the fingers.
  useLayoutEffect(() => {
    const el = scroller.current;
    const a = anchor.current;
    if (!el || !a) return;
    anchor.current = null;
    const k = zoom / a.zoom;
    el.scrollLeft = a.x * k - a.px;
    el.scrollTop = a.y * k - a.py;
  }, [zoom]);

  useEffect(() => {
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        const res = await fetch(src);
        if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
        loaded = await pdfjs.getDocument({ data: new Uint8Array(await res.arrayBuffer()) }).promise;
        if (cancelled) loaded.destroy();
        else setDoc(loaded);
      } catch (e) {
        if (!cancelled) setError((e as Error).message || "無法載入 PDF");
      }
    })();
    return () => {
      cancelled = true;
      loaded?.destroy();
    };
  }, [src]);

  useEffect(() => {
    if (doc) onPageCount?.(doc.numPages);
  }, [doc, onPageCount]);

  // Fit-to-width is the 100% zoom level, so track the column's width.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth - 32);
    // Measure once now as well: ResizeObserver doesn't fire in a hidden tab.
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scrollToPage = useCallback((page: number, y = 0) => {
    const root = scroller.current;
    const el = root?.querySelector<HTMLElement>(`[data-page="${page}"]`);
    if (!root || !el) return;
    const top = Math.max(0, el.offsetTop - 16 + y * el.offsetHeight - 60);
    // Glide over short distances; jump straight there over long ones.
    const far = Math.abs(top - root.scrollTop) > root.clientHeight * 3;
    root.scrollTo({ top, behavior: far ? "instant" : "smooth" });
  }, []);

  useImperativeHandle(handle, () => ({ goToPage: scrollToPage }), [scrollToPage]);

  // The current page is the one under the middle of the view. Worked out from
  // the layout on scroll: an observer keyed on "half the page visible" never
  // fires once a zoomed page is taller than two screens.
  // Synchronous on purpose: a binary search over the pages is cheap, and
  // deferring to an animation frame lags when the window is in the background.
  const updateCurrent = useCallback(() => {
    const root = scroller.current;
    if (!root) return;
    const pages = root.querySelectorAll<HTMLElement>("[data-page]");
    if (!pages.length) return;
    const mid = root.scrollTop + root.clientHeight / 2;
    let lo = 0;
    let hi = pages.length - 1;
    while (lo < hi) {
      const m = Math.ceil((lo + hi) / 2);
      if (pages[m].offsetTop <= mid) lo = m;
      else hi = m - 1;
    }
    setCurrent(lo + 1);
  }, []);

  useEffect(() => {
    updateCurrent();
  }, [doc, width, zoom, updateCurrent]);

  useEffect(() => {
    try {
      if (localStorage.getItem(OUTLINE_KEY) === "1") setOutlineOpen(true);
    } catch {
      // Storage blocked: start closed.
    }
  }, []);

  const toggleOutline = () => {
    const next = !outlineOpen;
    setOutlineOpen(next);
    try {
      localStorage.setItem(OUTLINE_KEY, next ? "1" : "0");
    } catch {
      // Not remembered; fine.
    }
  };

  // Built only once the outline is first opened: detecting headings reads
  // every page's text.
  useEffect(() => {
    if (!doc || !outlineOpen || outline) return;
    let alive = true;
    getOutline(doc).then((o) => alive && setOutline(o));
    return () => {
      alive = false;
    };
  }, [doc, outlineOpen, outline]);

  // `g` jumps to the page box, unless typing somewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "g" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (!scroller.current?.offsetParent) return;
      e.preventDefault();
      pageInput.current?.focus();
      pageInput.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The buttons go to the next preset, from wherever a pinch left the zoom.
  const step = (dir: 1 | -1) => {
    const next = dir > 0 ? ZOOMS.find((z) => z > zoom + 0.001) : [...ZOOMS].reverse().find((z) => z < zoom - 0.001);
    if (next) setZoom(next);
  };

  // Report the selection when the mouse (or keyboard) lets go of it.
  const report = useCallback(() => {
    if (!onSelect) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return onSelect(null);
    const range = sel.getRangeAt(0);
    const start = range.startContainer;
    const pageEl = (start instanceof Element ? start : start.parentElement)?.closest<HTMLElement>("[data-page]");
    if (!pageEl || !scroller.current?.contains(pageEl)) return onSelect(null);
    const text = sel.toString().replace(/\s+/g, " ").trim();
    if (!text) return onSelect(null);

    // Only the part on the starting page; a highlight belongs to one page.
    const box = pageEl.getBoundingClientRect();
    const raw = textRects(range).filter(
      (r) => r.width > 1 && r.height > 1 && r.bottom > box.top && r.top < box.bottom,
    );
    const canvasEl = pageEl.querySelector("canvas");
    const rects = mergeRects(raw)
      .map((r) => ({
        x: (r.left - box.left) / box.width,
        y: (r.top - box.top) / box.height,
        w: r.width / box.width,
        h: r.height / box.height,
      }))
      .map((r) => (canvasEl ? trimToInk(canvasEl, r) : r));
    if (!rects.length) return onSelect(null);
    const last = raw[raw.length - 1];
    onSelect({
      page: Number(pageEl.dataset.page),
      rects,
      text,
      anchor: { x: last.right, y: last.bottom },
    });
  }, [onSelect]);

  // A click that selects nothing may land on a highlight.
  const click = (e: React.MouseEvent) => {
    if (!highlights?.length || !onHighlightClick) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    const pageEl = (e.target as HTMLElement).closest<HTMLElement>("[data-page]");
    if (!pageEl) return;
    const box = pageEl.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width;
    const y = (e.clientY - box.top) / box.height;
    const page = Number(pageEl.dataset.page);
    const hit = highlights.find(
      (h) => h.page === page && h.rects.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h),
    );
    if (hit) onHighlightClick(hit.id);
  };

  return (
    <div
      className={cx(
        "flex min-h-[400px] flex-col overflow-hidden rounded-xl border border-line bg-surface-2",
        className ?? "h-[calc(100vh-11rem)]",
      )}
    >
      <div className="flex items-center gap-2 border-b border-line bg-surface px-3 py-1.5 text-xs text-dim">
        {doc ? (
          <>
            <button
              type="button"
              onClick={toggleOutline}
              title="目錄"
              aria-pressed={outlineOpen}
              className={cx(
                "rounded px-1.5 py-0.5 hover:bg-surface-2 hover:text-ink",
                outlineOpen && "bg-surface-2 text-ink",
              )}
            >
              ☰ 目錄
            </button>
            <PageBox
              ref={pageInput}
              current={current}
              total={doc.numPages}
              onGo={(n) => scrollToPage(n)}
            />
          </>
        ) : (
          <span>{error ? "" : "載入中…"}</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {toolbarExtra}
          <Button size="sm" variant="ghost" onClick={() => step(-1)} disabled={zoom <= MIN_ZOOM + 0.001} aria-label="縮小">
            −
          </Button>
          <button type="button" className="w-12 text-center hover:text-ink" onClick={() => setZoom(1)} title="符合寬度">
            {Math.round(zoom * 100)}%
          </button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => step(1)}
            disabled={zoom >= MAX_ZOOM - 0.001}
            aria-label="放大"
          >
            ＋
          </Button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1">
      {outlineOpen && doc ? (
        <OutlinePanel outline={outline} current={current} onGo={scrollToPage} onClose={toggleOutline} />
      ) : null}
      <div
        ref={scroller}
        className="relative min-w-0 flex-1 overflow-auto p-4"
        onMouseUp={() => setTimeout(report, 0)}
        onKeyUp={(e) => e.shiftKey && report()}
        onScroll={() => {
          updateCurrent();
          if (onSelect && window.getSelection()?.isCollapsed === false) onSelect(null);
        }}
        onClick={click}
      >
        {error ? (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">無法顯示 PDF：{error}</p>
        ) : doc && width > 0 ? (
          <div className="mx-auto flex w-fit flex-col items-center gap-3">
            {Array.from({ length: doc.numPages }, (_, i) => (
              <Page
                key={i}
                doc={doc}
                number={i + 1}
                width={width * zoom}
                dpr={dpr}
                root={scroller.current}
                highlights={highlights?.filter((h) => h.page === i + 1)}
                activeHighlight={activeHighlight}
              />
            ))}
          </div>
        ) : null}
      </div>
      </div>
    </div>
  );
}

/** "第 [n] / N 頁" with the number editable: type a page and press Enter. */
function PageBox({
  current,
  total,
  onGo,
  ref,
}: {
  current: number;
  total: number;
  onGo: (page: number) => void;
  ref?: Ref<HTMLInputElement>;
}) {
  const [value, setValue] = useState(String(current));
  const [editing, setEditing] = useState(false);
  // Escape blurs too; the blur must not then jump.
  const cancelled = useRef(false);

  useEffect(() => {
    if (!editing) setValue(String(current));
  }, [current, editing]);

  const go = () => {
    if (cancelled.current) {
      cancelled.current = false;
      setValue(String(current));
      setEditing(false);
      return;
    }
    const n = Math.round(Number(value));
    if (Number.isFinite(n) && value.trim()) onGo(Math.min(total, Math.max(1, n)));
    setEditing(false);
  };

  return (
    <label className="flex items-center gap-1" title="輸入頁碼後按 Enter（快捷鍵 g）">
      第
      <input
        ref={ref}
        value={value}
        inputMode="numeric"
        onFocus={(e) => {
          setEditing(true);
          e.currentTarget.select();
        }}
        onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ""))}
        onBlur={go}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            cancelled.current = true;
            e.currentTarget.blur();
          }
        }}
        className="h-6 w-10 rounded border border-line bg-surface-2 text-center text-xs text-ink tabular-nums outline-none focus:border-[var(--accent)]"
      />
      / {total} 頁
    </label>
  );
}

/** The table of contents, beside the pages. */
function OutlinePanel({
  outline,
  current,
  onGo,
  onClose,
}: {
  outline: Outline | null;
  current: number;
  onGo: (page: number, y?: number) => void;
  onClose: () => void;
}) {
  // The section being read: the last one starting at or before this page.
  const active = outline ? outline.items.reduce((at, it, i) => (it.page <= current ? i : at), -1) : -1;
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <nav className="flex w-60 shrink-0 flex-col border-r border-line bg-surface text-xs">
      <div className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-[11px] text-dim">
        <span className="flex-1">
          目錄{outline?.source === "detected" && outline.items.length ? "（自動偵測）" : ""}
        </span>
        <button type="button" onClick={onClose} className="hover:text-ink" aria-label="關閉目錄">
          ×
        </button>
      </div>
      <div ref={list} className="min-h-0 flex-1 overflow-y-auto py-1">
        {!outline ? (
          <p className="px-3 py-4 text-dim">分析中…</p>
        ) : !outline.items.length ? (
          <p className="px-3 py-4 leading-relaxed text-dim">
            這份 PDF 沒有目錄，也偵測不到章節標題。可以用上方的頁碼直接跳頁。
          </p>
        ) : (
          outline.items.map((it, i) => (
            <button
              key={i}
              type="button"
              data-active={i === active}
              onClick={() => onGo(it.page, it.y ?? 0)}
              style={{ paddingLeft: `${0.75 + (it.level - 1) * 0.85}rem` }}
              className={cx(
                "flex w-full items-baseline gap-2 py-1 pr-3 text-left transition-colors hover:bg-surface-2",
                i === active ? "bg-accent-soft/60 text-[var(--accent)]" : it.level === 1 ? "text-ink" : "text-dim hover:text-ink",
                it.level === 1 && "font-medium",
              )}
            >
              <span className="min-w-0 flex-1 leading-snug">{it.title}</span>
              <span className="shrink-0 text-[10px] tabular-nums text-dim">{it.page}</span>
            </button>
          ))
        )}
      </div>
    </nav>
  );
}

/** Collapse the per-span rectangles of a selection into one box per line. */
function mergeRects(rects: DOMRect[]): DOMRect[] {
  const sorted = [...rects].sort((a, b) => a.top - b.top || a.left - b.left);
  const out: DOMRect[] = [];
  for (const r of sorted) {
    const prev = out[out.length - 1];
    // Word gaps join; a column gutter (wider than a line is tall) does not.
    const sameLine =
      prev && Math.abs(prev.top - r.top) < r.height * 0.5 && r.left - prev.right < r.height * 0.9;
    if (sameLine) {
      const left = Math.min(prev.left, r.left);
      const top = Math.min(prev.top, r.top);
      const right = Math.max(prev.right, r.right);
      const bottom = Math.max(prev.bottom, r.bottom);
      out[out.length - 1] = new DOMRect(left, top, right - left, bottom - top);
    } else {
      out.push(r);
    }
  }
  return out;
}

/**
 * The rectangles of the selected text itself. Range.getClientRects() also
 * returns the box of every element wholly inside the range (spans, <br>s),
 * which is not where the glyphs are; measuring text nodes avoids that.
 * Leading and trailing whitespace is left out, so a line's box ends at its
 * last character rather than at a trailing space.
 */
function textRects(range: Range): DOMRect[] {
  const root =
    range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentNode!
      : range.commonAncestorContainer;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const out: DOMRect[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!range.intersectsNode(n)) continue;
    const text = n.textContent ?? "";
    let start = n === range.startContainer ? range.startOffset : 0;
    let end = n === range.endContainer ? range.endOffset : text.length;
    while (start < end && /\s/.test(text[start])) start++;
    while (end > start && /\s/.test(text[end - 1])) end--;
    if (start >= end) continue;
    const sub = document.createRange();
    sub.setStart(n, start);
    sub.setEnd(n, end);
    out.push(...sub.getClientRects());
  }
  return out;
}

/**
 * Shrink a highlight rectangle (page fractions) horizontally to the ink drawn
 * on the canvas under it. pdf.js sizes each text span from the PDF's own
 * advance widths, which in some PDFs run well past the last glyph - so a
 * highlight built from the spans spills into the margin. Only ever shrinks,
 * and leaves the rectangle alone when no ink is found (images, blank canvas).
 */
function trimToInk(canvas: HTMLCanvasElement, r: HighlightRect): HighlightRect {
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || !W || !H) return r;
  const x0 = Math.max(0, Math.floor(r.x * W));
  const x1 = Math.min(W, Math.ceil((r.x + r.w) * W));
  // The middle of the line only, so neighbouring lines' ascenders and
  // descenders don't count as ink.
  const y0 = Math.max(0, Math.floor((r.y + r.h * 0.2) * H));
  const y1 = Math.min(H, Math.ceil((r.y + r.h * 0.8) * H));
  if (x1 - x0 < 2 || y1 - y0 < 1) return r;
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
  } catch {
    return r;
  }
  const w = x1 - x0;
  const rows = y1 - y0;
  const inkAt = (col: number) => {
    for (let row = 0; row < rows; row++) {
      const i = (row * w + col) * 4;
      // Dark enough against the (usually white) page to be a glyph stroke.
      if (Math.min(data[i], data[i + 1], data[i + 2]) < 170 && data[i + 3] > 0) return true;
    }
    return false;
  };
  let first = 0;
  while (first < w && !inkAt(first)) first++;
  if (first >= w) return r;
  let last = w - 1;
  while (last > first && !inkAt(last)) last--;
  // A little air on each side, about a fifth of the line height.
  const pad = Math.round(r.h * H * 0.2);
  const left = Math.max(x0, x0 + first - pad);
  const right = Math.min(x1, x0 + last + 1 + pad);
  return { x: left / W, y: r.y, w: (right - left) / W, h: r.h };
}

function Page({
  doc,
  number,
  width,
  dpr,
  root,
  highlights,
  activeHighlight,
}: {
  doc: PDFDocumentProxy;
  number: number;
  width: number;
  dpr: number;
  root: HTMLElement | null;
  highlights?: PaperHighlight[];
  activeHighlight?: number | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(1.414); // A4 portrait until the real page size is known
  const [scale, setScale] = useState(1);
  const [near, setNear] = useState(number <= 2);

  useEffect(() => {
    let alive = true;
    doc.getPage(number).then((page) => {
      const vp = page.getViewport({ scale: 1 });
      if (alive) {
        setRatio(vp.height / vp.width);
        setScale(width / vp.width);
      }
    });
    return () => {
      alive = false;
    };
  }, [doc, number, width]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const lazy = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), {
      root,
      rootMargin: "800px 0px",
    });
    lazy.observe(el);
    return () => lazy.disconnect();
  }, [root]);

  // Whether this page has been drawn once; later redraws wait for resizing to settle.
  const drawn = useRef(false);
  // Bumped after each draw, so highlights are re-fitted to the new pixels.
  const [drawCount, setDrawCount] = useState(0);
  // Saved highlights fitted to the ink, which also mends ones made before
  // trimming existed.
  const fitted = useMemo(() => {
    const c = canvas.current;
    if (!highlights?.length || !c || !drawCount) return highlights;
    return highlights.map((h) => ({ ...h, rects: h.rects.map((r) => trimToInk(c, r)) }));
  }, [highlights, drawCount]);

  useEffect(() => {
    if (!near || !canvas.current) return;
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    let layer: { cancel: () => void } | null = null;
    let alive = true;

    const draw = async () => {
      const page = await doc.getPage(number);
      if (!alive || !canvas.current) return;
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (width / base.width) * dpr });
      // Draw off screen and copy over when done, so the old (stretched) image
      // stays visible during the redraw instead of the page going blank.
      const off = document.createElement("canvas");
      off.width = Math.floor(viewport.width);
      off.height = Math.floor(viewport.height);
      task = page.render({ canvas: off, viewport });
      task.promise
        .then(() => {
          const c = canvas.current;
          if (!alive || !c) return;
          c.width = off.width;
          c.height = off.height;
          c.getContext("2d")?.drawImage(off, 0, 0);
          drawn.current = true;
          setDrawCount((n) => n + 1);
        })
        .catch(() => {
          // Cancelled by a zoom change or unmount; the next render replaces it.
        });

      const container = text.current;
      if (!container) return;
      const { TextLayer } = await import("pdfjs-dist");
      if (!alive) return;
      container.replaceChildren();
      const textLayer = new TextLayer({
        textContentSource: page.streamTextContent(),
        container,
        viewport: page.getViewport({ scale: width / base.width }),
      });
      layer = textLayer;
      textLayer.render().catch(() => {
        // Cancelled, as above.
      });
    };

    const timer = setTimeout(() => void draw(), drawn.current ? REDRAW_DELAY : 0);
    return () => {
      alive = false;
      clearTimeout(timer);
      task?.cancel();
      layer?.cancel();
    };
  }, [doc, number, width, dpr, near]);

  return (
    <div
      ref={box}
      data-page={number}
      className="relative bg-white shadow-[var(--shadow)]"
      style={
        {
          width,
          height: width * ratio,
          "--total-scale-factor": scale,
          "--scale-round-x": "1px",
          "--scale-round-y": "1px",
        } as React.CSSProperties
      }
    >
      {near ? (
        <>
          <canvas ref={canvas} style={{ width: "100%", height: "100%", display: "block" }} />
          {fitted?.length ? (
            <div className="pointer-events-none absolute inset-0" style={{ mixBlendMode: "multiply" }}>
              {fitted.flatMap((h) =>
                h.rects.map((r, i) => (
                  <div
                    key={`${h.id}-${i}`}
                    className="absolute rounded-[2px]"
                    style={{
                      left: `${r.x * 100}%`,
                      top: `${r.y * 100}%`,
                      width: `${r.w * 100}%`,
                      height: `${r.h * 100}%`,
                      background: HIGHLIGHT_FILL[h.color] ?? HIGHLIGHT_FILL.yellow,
                      // The selected one reads as a deeper shade rather than a border.
                      filter: activeHighlight === h.id ? "saturate(2.2) brightness(0.92)" : undefined,
                    }}
                  />
                )),
              )}
            </div>
          ) : null}
          <div ref={text} className="textLayer" />
        </>
      ) : null}
    </div>
  );
}
