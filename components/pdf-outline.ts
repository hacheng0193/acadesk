import type { PDFDocumentProxy } from "pdfjs-dist";

/** One entry of a PDF's table of contents. `y` is a fraction down the page, when known. */
export type OutlineItem = { title: string; level: number; page: number; y: number | null };

export type Outline = {
  items: OutlineItem[];
  /** "bookmarks" from the PDF itself, or "detected" from the text when it has none. */
  source: "bookmarks" | "detected";
};

const cache = new WeakMap<PDFDocumentProxy, Promise<Outline>>();

/**
 * The PDF's table of contents. Its own bookmarks when it has them; most
 * conference and journal PDFs (IEEE's included) have none, so then headings
 * are picked out of the text instead. Computed once per document.
 */
export function getOutline(doc: PDFDocumentProxy): Promise<Outline> {
  let outline = cache.get(doc);
  if (!outline) {
    outline = (async () => {
      const bookmarks = await fromBookmarks(doc).catch(() => []);
      if (bookmarks.length) return { items: bookmarks, source: "bookmarks" as const };
      return { items: await detectHeadings(doc).catch(() => []), source: "detected" as const };
    })();
    cache.set(doc, outline);
  }
  return outline;
}

/* ---------- bookmarks ---------- */

type RawOutlineNode = { title: string; dest: string | unknown[] | null; items: RawOutlineNode[] };

async function fromBookmarks(doc: PDFDocumentProxy): Promise<OutlineItem[]> {
  const tree = (await doc.getOutline()) as RawOutlineNode[] | null;
  if (!tree?.length) return [];
  const out: OutlineItem[] = [];
  const walk = async (nodes: RawOutlineNode[], level: number) => {
    for (const node of nodes) {
      const target = await resolveDest(doc, node.dest);
      if (target) out.push({ title: clean(node.title), level, ...target });
      if (node.items?.length) await walk(node.items, level + 1);
    }
  };
  await walk(tree, 1);
  return out;
}

async function resolveDest(
  doc: PDFDocumentProxy,
  dest: RawOutlineNode["dest"],
): Promise<{ page: number; y: number | null } | null> {
  const explicit = typeof dest === "string" ? await doc.getDestination(dest) : dest;
  if (!Array.isArray(explicit) || !explicit.length) return null;
  const ref = explicit[0];
  const index =
    typeof ref === "number" ? ref : await doc.getPageIndex(ref as Parameters<PDFDocumentProxy["getPageIndex"]>[0]);
  const page = index + 1;
  // [ref, {name: "XYZ"}, left, top, zoom] or [ref, {name: "FitH"}, top]
  const kind = (explicit[1] as { name?: string } | undefined)?.name;
  const top = kind === "XYZ" ? explicit[3] : kind === "FitH" || kind === "FitBH" ? explicit[2] : null;
  if (typeof top !== "number") return { page, y: null };
  const view = (await doc.getPage(page)).view; // [x0, y0, x1, y1] in PDF units, origin bottom-left
  const height = view[3] - view[1];
  return { page, y: clamp01((view[3] - top) / height) };
}

/* ---------- headings detected from the text ---------- */

type Line = { text: string; font: string; size: number; top: number; page: number };

const ROMAN = /^(?=[IVX])X{0,3}(?:IX|IV|V?I{0,3})\.\s+\S/; // "IV. RELATED WORK"
const LETTER = /^[A-H]\.\s+[A-Z]/; // "A. Background"
const PAREN = /^\d{1,2}\)\s+\S.{0,80}?:/; // "1) LLMs in AD and ITS: ..."
const NUMBERED = /^(\d{1,2}(?:\.\d{1,2}){0,2})\.?\s+[A-Z][A-Za-z]/; // "3.2 Training" / "1 Introduction"
const STOP = /^(references|bibliography|參考文獻)$/i;

async function detectHeadings(doc: PDFDocumentProxy): Promise<OutlineItem[]> {
  const lines: Line[] = [];
  const fontChars = new Map<string, number>();
  const sizeChars = new Map<number, number>();

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const [, y0, , y1] = page.view;
    const content = await page.getTextContent();
    let current: Line | null = null;
    let lastX = -Infinity;
    let lastY = NaN;
    const flush = () => {
      if (current && current.text.trim()) lines.push({ ...current, text: current.text.replace(/\s+/g, " ").trim() });
      current = null;
    };
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const [, , c, d, x, y] = item.transform as number[];
      const size = Math.round(Math.hypot(c, d) * 10) / 10;
      // A new line starts when the baseline moves or the text jumps back left.
      if (current && (Math.abs(y - lastY) > size * 0.5 || x < lastX - size)) flush();
      if (item.str.trim()) {
        fontChars.set(item.fontName, (fontChars.get(item.fontName) ?? 0) + item.str.length);
        sizeChars.set(size, (sizeChars.get(size) ?? 0) + item.str.length);
      }
      if (!current) {
        current = { text: "", font: item.fontName, size, top: clamp01((y1 - y - size) / (y1 - y0)), page: n };
      } else if (!current.text.trim() && item.str.trim()) {
        current.font = item.fontName;
        current.size = size;
      }
      current.text += item.str;
      lastX = x + (item.width ?? 0);
      lastY = y;
      if (item.hasEOL) flush();
    }
    flush();
    page.cleanup();
  }

  const bodyFont = mostCommon(fontChars);
  const bodySize = mostCommon(sizeChars) ?? 10;

  const out: OutlineItem[] = [];
  let sawSection = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let t = line.text;
    if (t.length < 3) continue;
    const distinct = line.font !== bodyFont || line.size > bodySize * 1.1;
    // IEEE sets section titles in the body font as small caps ("I. I" +
    // "NTRODUCTION" in a smaller size), so for the numbered-section shape an
    // all-caps title counts as distinct too.
    const allCapsSection = ROMAN.test(t) && !/[a-z]/.test(t.replace(/^[IVX]+\.\s*/, "")) && t.length <= 70;
    if (STOP.test(t) && distinct) {
      out.push({ title: t, level: 1, page: line.page, y: line.top });
      break;
    }
    if (!(distinct || allCapsSection) || t.length > 90) continue;
    // A title that wraps ("SEARCH-AND-" / "RESCUE") continues on the next line.
    const next = lines[i + 1];
    if (next?.page === line.page) {
      if (/-$/.test(t)) t = t + next.text;
      // An all-caps title that wraps without a hyphen: the next line is all caps too.
      else if (allCapsSection && /\b(AND|OF|FOR|IN|THE|WITH|TO|,)$/.test(t) && !/[a-z]/.test(next.text) && next.text.length < 60)
        t = `${t} ${next.text}`;
    }

    let level = 0;
    let title = t;
    if (ROMAN.test(t) && !/[.,;]$/.test(t)) {
      level = 1;
      sawSection = true;
    } else if (LETTER.test(t) && sawSection) {
      level = 2;
    } else if (PAREN.test(t) && sawSection) {
      level = 3;
      title = t.slice(0, t.indexOf(":"));
    } else {
      const m = t.match(NUMBERED);
      if (m && !/[.,;]$/.test(t) && !/\d{3,}/.test(t)) {
        level = m[1].split(".").length;
        sawSection = true;
      }
    }
    if (level) out.push({ title: clean(title), level, page: line.page, y: line.top });
  }
  return out;
}

function mostCommon<K>(counts: Map<K, number>): K | undefined {
  let best: K | undefined;
  let max = -1;
  for (const [k, v] of counts) if (v > max) [best, max] = [k, v];
  return best;
}

function clean(title: string): string {
  return title.replace(/﻿/g, "").replace(/\s+/g, " ").trim();
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
