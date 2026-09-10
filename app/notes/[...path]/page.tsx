import Link from "next/link";
import { notFound } from "next/navigation";
import { NoteEditor } from "@/components/NoteEditor";
import { renderMarkdown } from "@/lib/markdown";
import { listNotes, obsidianUri, readNote, VaultError } from "@/lib/vault";

export const dynamic = "force-dynamic";

export default async function NotePage({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const relPath = path.map(decodeURIComponent).join("/");

  let note: { rel: string; content: string; mtime: number };
  try {
    note = readNote(relPath);
  } catch (e) {
    if (e instanceof VaultError) {
      return (
        <div className="rounded-xl border border-danger bg-danger-soft p-4 text-sm text-danger">
          {e.message}
        </div>
      );
    }
    notFound();
  }

  // Resolve [[wikilinks]] against the vault so they become in-app links.
  const index = new Map(listNotes().map((f) => [f.title.toLowerCase(), f.rel]));
  const previewHtml = renderMarkdown(note.content, {
    stripFrontmatter: true,
    resolveWikilink: (name) => index.get(name.toLowerCase()) ?? null,
  });

  const folder = note.rel.includes("/") ? note.rel.slice(0, note.rel.lastIndexOf("/")) : "";

  return (
    <>
      <div className="mb-2 flex items-center gap-2 text-xs text-dim">
        <Link href="/notes" className="hover:text-ink">
          筆記
        </Link>
        {folder ? <span>/ {folder}</span> : null}
      </div>
      <h1 className="mb-4 text-xl font-semibold tracking-tight">
        {note.rel.split("/").pop()?.replace(/\.md$/i, "")}
      </h1>
      <NoteEditor
        relPath={note.rel}
        initialContent={note.content}
        initialMtime={note.mtime}
        previewHtml={previewHtml}
        obsidianUri={obsidianUri(note.rel)}
      />
    </>
  );
}
