/**
 * Tags live in the Markdown files themselves, the way Obsidian reads them:
 * `tags:` in the frontmatter and `#tag` in the body. Nothing is stored in the
 * database, so a tag added in Obsidian shows up here and the other way round.
 */

/** Characters a tag may contain. `/` makes nested tags like `研究/方法`. */
export const TAG_BODY = "[\\p{L}\\p{N}_\\-/]+";

const INLINE_TAG = new RegExp(`(?:^|[\\s(])#(${TAG_BODY})`, "gu");

/** Obsidian rejects all-digit tags, so `#1` and `#2024` stay plain text. */
export function isTag(tag: string): boolean {
  return /\D/.test(tag);
}

function clean(raw: string): string {
  return raw.trim().replace(/^#+/, "").replace(/^\/+|\/+$/g, "");
}

/** Pull the `tags:` entry out of a frontmatter block; handles flow, comma and block lists. */
function frontmatterTags(frontmatter: string): string[] {
  const lines = frontmatter.split(/\r?\n/);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const key = /^tags?\s*:\s*(.*)$/i.exec(lines[i]);
    if (!key) continue;
    const inline = key[1].trim();
    if (inline) {
      out.push(...inline.replace(/^\[|\]$/g, "").split(/[,\s]+/));
    } else {
      for (let j = i + 1; j < lines.length; j++) {
        const item = /^\s*-\s*(.+)$/.exec(lines[j]);
        if (!item) break;
        out.push(item[1]);
      }
    }
    break;
  }
  return out.map((t) => clean(t.replace(/^["']|["']$/g, ""))).filter(Boolean);
}

/** All tags in a note, deduplicated and sorted. Code is skipped: `#include` is not a tag. */
export function extractTags(md: string): string[] {
  const found = new Set<string>();

  const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(md);
  let body = md;
  if (fm) {
    for (const t of frontmatterTags(fm[1])) if (isTag(t)) found.add(t);
    body = md.slice(fm[0].length);
  }

  body = body
    .replace(/^(```|~~~)[\s\S]*?^\1[^\n]*$/gm, "")
    .replace(/`[^`\n]*`/g, "");

  for (const match of body.matchAll(INLINE_TAG)) {
    const tag = clean(match[1]);
    if (tag && isTag(tag)) found.add(tag);
  }
  return [...found].sort((a, b) => a.localeCompare(b));
}

/** Count how often each tag appears across a set of tag lists. */
export function countTags(lists: string[][]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const list of lists) for (const t of list) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** A note matches when it carries every selected tag (a parent tag covers its children). */
export function hasAllTags(noteTags: string[], selected: string[]): boolean {
  return selected.every((s) => noteTags.some((t) => t === s || t.startsWith(`${s}/`)));
}
