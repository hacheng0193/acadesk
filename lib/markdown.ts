import katex from "katex";
import { marked, type TokenizerAndRendererExtension } from "marked";

marked.setOptions({ gfm: true, breaks: true });

/**
 * Math is rendered by KaTeX before Markdown ever sees it. It has to be a marked
 * extension rather than a pre-pass over the text: `\[`, `\]` and `\\` are all
 * Markdown escapes, so a formula that reaches the default tokenizer comes back
 * with its delimiters and line breaks eaten. Extensions are tried first, and
 * fenced/inline code still wins because marked tokenizes that as code.
 */
function renderMath(tex: string, displayMode: boolean): string {
  // throwOnError: false renders a malformed formula in red instead of blowing
  // up the whole note - a half-typed equation is normal while writing.
  return katex.renderToString(tex, { displayMode, throwOnError: false });
}

const blockMath: TokenizerAndRendererExtension = {
  name: "blockMath",
  level: "block",
  start: (src) => src.match(/\$\$|\\\[/)?.index,
  tokenizer(src) {
    const match = /^(?:\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\])[ \t]*(?:\n+|$)/.exec(src);
    if (!match) return undefined;
    return { type: "blockMath", raw: match[0], text: (match[1] ?? match[2]).trim() };
  },
  renderer: (token) => renderMath(token.text, true),
};

const inlineMath: TokenizerAndRendererExtension = {
  name: "inlineMath",
  level: "inline",
  start: (src) => src.match(/\$(?!\s)|\\\(/)?.index,
  tokenizer(src) {
    // `$` only opens a formula when it hugs its contents on both sides and the
    // closing one is not followed by a digit, so prices like "$5 to $10" and a
    // lone "$" stay plain text.
    const match = /^(?:\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)|\\\(([\s\S]+?)\\\))/.exec(src);
    if (!match) return undefined;
    return { type: "inlineMath", raw: match[0], text: (match[1] ?? match[2]).trim() };
  },
  renderer: (token) => renderMath(token.text, false),
};

marked.use({ extensions: [blockMath, inlineMath] });

/**
 * Minimal scrub of raw HTML. These notes are the user's own files, so this is a
 * seatbelt against pasted junk rather than a defence against a hostile author.
 */
function scrub(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;

/**
 * Point image sources at the vault. A note references a file on disk, which the
 * browser cannot load from an http page, so anything that is not already a web
 * URL is served through the API instead.
 *
 * A file we cannot find becomes the same dotted placeholder an unresolved
 * wikilink gets. Left as a relative src it would be a broken-image icon, and
 * the browser would resolve it against /notes/... - firing a full note render
 * per missing picture, for a file name the reader never gets to see.
 */
function rewriteImages(html: string, resolve?: (src: string) => string | null): string {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = /\ssrc\s*=\s*(["'])([^"']*)\1/i.exec(tag)?.[2];
    if (!src || /^(?:[a-z]+:|\/)/i.test(src)) return tag;
    let name = src;
    try {
      name = decodeURIComponent(src);
    } catch {
      // A stray % is not an escape; take the src as typed.
    }
    const rel = resolve?.(name);
    if (!rel) {
      // marked already escaped the alt text; a raw file name has not been.
      const alt = /\salt\s*=\s*(["'])([^"']*)\1/i.exec(tag)?.[2] || escapeHtml(name);
      return `<span class="text-dim underline decoration-dotted" title="找不到這個檔案">🖼 ${alt}</span>`;
    }
    return tag.replace(
      /\ssrc\s*=\s*(["'])[^"']*\1/i,
      ` src="/api/vault/image?path=${encodeURIComponent(rel)}"`,
    );
  });
}

/**
 * Turn Obsidian `[[wikilinks]]` into in-app note links before Markdown parsing.
 * `resolve` maps a note name to a vault-relative path, if we know one.
 */
function expandWikilinks(md: string, resolve?: (name: string) => string | null): string {
  return md.replace(/!?\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (whole, rawName, alias) => {
    const name = String(rawName).trim();
    if (whole.startsWith("!")) {
      // An image embed becomes ordinary Markdown, so the src rewrite below is
      // the only place that has to know how a vault file is served. Obsidian's
      // `|300` width hint is not alt text, so it is dropped rather than shown.
      if (!IMAGE_EXT.test(name)) return whole; // embedded notes: leave as-is
      const hint = String(alias ?? "").trim();
      const label = hint && !/^\d+(x\d+)?$/.test(hint) ? hint : name;
      return `![${label.replace(/[\[\]]/g, "")}](${encodeURI(name)})`;
    }
    const label = escapeHtml(String(alias ?? name).trim());
    const rel = resolve?.(name);
    if (!rel) return `<span class="text-dim underline decoration-dotted">${label}</span>`;
    return `<a href="/notes/${rel.split("/").map(encodeURIComponent).join("/")}">${label}</a>`;
  });
}

/** Strip YAML frontmatter for display; the raw text keeps it. */
export function splitFrontmatter(md: string): { frontmatter: string | null; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(md);
  return match
    ? { frontmatter: match[1], body: md.slice(match[0].length) }
    : { frontmatter: null, body: md };
}

export function renderMarkdown(
  md: string,
  opts: {
    resolveWikilink?: (name: string) => string | null;
    /** Maps an image's src or embed name to a vault-relative path. */
    resolveImage?: (src: string) => string | null;
    stripFrontmatter?: boolean;
  } = {},
): string {
  const source = opts.stripFrontmatter ? splitFrontmatter(md).body : md;
  const html = marked.parse(expandWikilinks(source, opts.resolveWikilink), { async: false });
  return rewriteImages(scrub(html), opts.resolveImage);
}
