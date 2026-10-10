"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { HighlightRect, PaperHighlight } from "@/lib/types";
import { Button, cx } from "./ui";

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

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
  const scroller = useRef<HTMLDivElement>(null);

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

  useImperativeHandle(
    handle,
    () => ({
      goToPage(page, y = 0) {
        const root = scroller.current;
        const el = root?.querySelector<HTMLElement>(`[data-page="${page}"]`);
        if (!root || !el) return;
        root.scrollTo({ top: el.offsetTop - 16 + y * el.offsetHeight - 60, behavior: "smooth" });
      },
    }),
    [],
  );

  const step = (dir: 1 | -1) => {
    const i = ZOOMS.indexOf(zoom) + dir;
    if (i >= 0 && i < ZOOMS.length) setZoom(ZOOMS[i]);
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
    const raw = [...range.getClientRects()].filter(
      (r) => r.width > 1 && r.height > 1 && r.bottom > box.top && r.top < box.bottom,
    );
    const rects = mergeRects(raw).map((r) => ({
      x: (r.left - box.left) / box.width,
      y: (r.top - box.top) / box.height,
      w: r.width / box.width,
      h: r.height / box.height,
    }));
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
        <span>{doc ? `第 ${current} / ${doc.numPages} 頁` : error ? "" : "載入中…"}</span>
        <div className="ml-auto flex items-center gap-1">
          {toolbarExtra}
          <Button size="sm" variant="ghost" onClick={() => step(-1)} disabled={zoom === ZOOMS[0]} aria-label="縮小">
            −
          </Button>
          <button type="button" className="w-12 text-center hover:text-ink" onClick={() => setZoom(1)} title="符合寬度">
            {Math.round(zoom * 100)}%
          </button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => step(1)}
            disabled={zoom === ZOOMS[ZOOMS.length - 1]}
            aria-label="放大"
          >
            ＋
          </Button>
        </div>
      </div>
      <div
        ref={scroller}
        className="relative flex-1 overflow-auto p-4"
        onMouseUp={() => setTimeout(report, 0)}
        onKeyUp={(e) => e.shiftKey && report()}
        onScroll={() => onSelect && window.getSelection()?.isCollapsed === false && onSelect(null)}
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
                root={scroller.current}
                onVisible={setCurrent}
                highlights={highlights?.filter((h) => h.page === i + 1)}
                activeHighlight={activeHighlight}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Collapse the per-span rectangles of a selection into one box per line. */
function mergeRects(rects: DOMRect[]): DOMRect[] {
  const sorted = [...rects].sort((a, b) => a.top - b.top || a.left - b.left);
  const out: DOMRect[] = [];
  for (const r of sorted) {
    const prev = out[out.length - 1];
    const sameLine = prev && Math.abs(prev.top - r.top) < r.height * 0.5 && r.left - prev.right < 12;
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

function Page({
  doc,
  number,
  width,
  root,
  onVisible,
  highlights,
  activeHighlight,
}: {
  doc: PDFDocumentProxy;
  number: number;
  width: number;
  root: HTMLElement | null;
  onVisible: (n: number) => void;
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
    // The page whose top half is on screen is the "current" one.
    const position = new IntersectionObserver(([e]) => e.isIntersecting && onVisible(number), {
      root,
      threshold: 0.5,
    });
    lazy.observe(el);
    position.observe(el);
    return () => {
      lazy.disconnect();
      position.disconnect();
    };
  }, [root, number, onVisible]);

  useEffect(() => {
    if (!near || !canvas.current) return;
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    let layer: { cancel: () => void } | null = null;
    let alive = true;
    doc.getPage(number).then(async (page) => {
      if (!alive || !canvas.current) return;
      const base = page.getViewport({ scale: 1 });
      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: (width / base.width) * dpr });
      const c = canvas.current;
      c.width = Math.floor(viewport.width);
      c.height = Math.floor(viewport.height);
      task = page.render({ canvas: c, viewport });
      task.promise.catch(() => {
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
    });
    return () => {
      alive = false;
      task?.cancel();
      layer?.cancel();
    };
  }, [doc, number, width, near]);

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
          {highlights?.length ? (
            <div className="pointer-events-none absolute inset-0" style={{ mixBlendMode: "multiply" }}>
              {highlights.flatMap((h) =>
                h.rects.map((r, i) => (
                  <div
                    key={`${h.id}-${i}`}
                    className={cx("absolute rounded-[2px]", activeHighlight === h.id && "outline outline-2 outline-[var(--accent)]")}
                    style={{
                      left: `${r.x * 100}%`,
                      top: `${r.y * 100}%`,
                      width: `${r.w * 100}%`,
                      height: `${r.h * 100}%`,
                      background: HIGHLIGHT_FILL[h.color] ?? HIGHLIGHT_FILL.yellow,
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
