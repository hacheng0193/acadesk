"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Button } from "./ui";

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

/**
 * PDF rendered with PDF.js instead of the browser's own viewer. The browser
 * pane in the Claude app has no PDF plugin and downloads any PDF it is pointed
 * at; drawing the pages onto canvases works the same everywhere.
 *
 * Pages are drawn only when they scroll near the viewport, so a 200-page deck
 * doesn't render all at once.
 */
export function PdfViewer({ src }: { src: string }) {
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

  const step = (dir: 1 | -1) => {
    const i = ZOOMS.indexOf(zoom) + dir;
    if (i >= 0 && i < ZOOMS.length) setZoom(ZOOMS[i]);
  };

  return (
    <div className="flex h-[calc(100vh-11rem)] min-h-[400px] flex-col overflow-hidden rounded-xl border border-line bg-surface-2">
      <div className="flex items-center gap-2 border-b border-line bg-surface px-3 py-1.5 text-xs text-dim">
        <span>{doc ? `第 ${current} / ${doc.numPages} 頁` : error ? "" : "載入中…"}</span>
        <div className="ml-auto flex items-center gap-1">
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
      <div ref={scroller} className="flex-1 overflow-auto p-4">
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
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Page({
  doc,
  number,
  width,
  root,
  onVisible,
}: {
  doc: PDFDocumentProxy;
  number: number;
  width: number;
  root: HTMLElement | null;
  onVisible: (n: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ratio, setRatio] = useState(1.414); // A4 portrait until the real page size is known
  const [near, setNear] = useState(number <= 2);

  useEffect(() => {
    let alive = true;
    doc.getPage(number).then((page) => {
      const vp = page.getViewport({ scale: 1 });
      if (alive) setRatio(vp.height / vp.width);
    });
    return () => {
      alive = false;
    };
  }, [doc, number]);

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
    let alive = true;
    doc.getPage(number).then((page) => {
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
    });
    return () => {
      alive = false;
      task?.cancel();
    };
  }, [doc, number, width, near]);

  return (
    <div
      ref={box}
      className="bg-white shadow-[var(--shadow)]"
      style={{ width, height: width * ratio }}
    >
      {near ? <canvas ref={canvas} style={{ width: "100%", height: "100%", display: "block" }} /> : null}
    </div>
  );
}
