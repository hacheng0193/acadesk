import path from "node:path";
import { NextResponse } from "next/server";
import { search } from "@/lib/search";
import type { LookupHit } from "@/lib/types";
import { spotlightAttachments } from "@/lib/spotlight";
import { listAttachments, listNotes, vaultRoot } from "@/lib/vault";

export const dynamic = "force-dynamic";

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;

/** Lowercased names that more than one file in the vault answers to. */
function clashes(names: string[]): Set<string> {
  const seen = new Set<string>();
  const twice = new Set<string>();
  for (const n of names.map((x) => x.toLowerCase())) (seen.has(n) ? twice : seen).add(n);
  return twice;
}

const LIMIT = 30;

/**
 * Everything in the vault the editor's "insert note" panel can link to.
 * Names first, since that is usually what you remember; then notes whose text
 * matches (SQLite index, with a snippet); then attachments whose text matches
 * (Spotlight, which is the only thing here that can read inside a PDF).
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const root = vaultRoot();
  if (!q || !root) return NextResponse.json({ results: [] });

  // Started first, so the slow part overlaps the cheap scans below.
  const inAttachments = spotlightAttachments(root, q);

  const needle = q.toLowerCase();
  const notes = listNotes();
  const attachments = listAttachments();
  // A bare name is what Obsidian writes, but only safe when it is unambiguous;
  // otherwise spell out the path so both sides land on the same file.
  const sameTitle = clashes(notes.map((f) => f.title));
  const sameName = clashes(attachments.map((f) => f.name));

  const hits: LookupHit[] = [];
  const seen = new Set<string>();
  const add = (hit: Omit<LookupHit, "link">) => {
    if (seen.has(hit.rel) || hits.length >= LIMIT) return;
    seen.add(hit.rel);
    let link: string;
    if (hit.kind === "note") {
      link = `[[${sameTitle.has(hit.title.toLowerCase()) ? hit.rel.replace(/\.md$/i, "") : hit.title}]]`;
    } else {
      const target = sameName.has(hit.title.toLowerCase()) ? hit.rel : hit.title;
      link = `${IMAGE_EXT.test(hit.rel) ? "!" : ""}[[${target}]]`;
    }
    hits.push({ ...hit, link });
  };

  for (const f of notes) {
    if (f.rel.toLowerCase().includes(needle)) add({ kind: "note", rel: f.rel, title: f.title, match: "name" });
  }
  for (const f of attachments) {
    if (f.rel.toLowerCase().includes(needle)) add({ kind: "file", rel: f.rel, title: f.name, match: "name" });
  }
  // Other kinds share the index, so ask for more than we keep.
  for (const h of search(q, 100)) {
    if (h.kind !== "note") continue;
    add({ kind: "note", rel: h.refKey, title: h.title, match: "content", snippet: h.snippet });
  }
  for (const rel of await inAttachments) {
    add({ kind: "file", rel, title: path.basename(rel), match: "content" });
  }

  return NextResponse.json({ results: hits });
}
