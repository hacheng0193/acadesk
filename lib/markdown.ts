import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: true });

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

/**
 * Turn Obsidian `[[wikilinks]]` into in-app note links before Markdown parsing.
 * `resolve` maps a note name to a vault-relative path, if we know one.
 */
function expandWikilinks(md: string, resolve?: (name: string) => string | null): string {
  return md.replace(/!?\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (whole, rawName, alias) => {
    if (whole.startsWith("!")) return whole; // embeds: leave as-is
    const name = String(rawName).trim();
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
  opts: { resolveWikilink?: (name: string) => string | null; stripFrontmatter?: boolean } = {},
): string {
  const source = opts.stripFrontmatter ? splitFrontmatter(md).body : md;
  const html = marked.parse(expandWikilinks(source, opts.resolveWikilink), { async: false });
  return scrub(html);
}
