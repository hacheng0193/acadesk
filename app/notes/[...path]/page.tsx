import Link from "next/link";
import { notFound } from "next/navigation";
import { NoteEditor } from "@/components/NoteEditor";
import { renderMarkdown } from "@/lib/markdown";
import { listNotes, obsidianUri, readNote, VaultError } from "@/lib/vault";

export const dynamic = "force-dynamic";

/**
 * `from` carries where the reader came from, so the back link can name it
 * instead of relying on browser history (which breaks on reload and on links
 * followed from inside another note).
 */
function safeReturnTo(value: string | string[] | undefined): string | null {
  const path = Array.isArray(value) ? value[0] : value;
  if (!path) return null;
  // Internal paths only - never let a query param become an off-site link.
  return path.startsWith("/") && !path.startsWith("//") ? path : null;
}

export default async function NotePage({
  params,
  searchParams,
}: {
  params: Promise<{ path: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { path } = await params;
  const query = await searchParams;
  const relPath = path.map(decodeURIComponent).join("/");

  const returnTo = safeReturnTo(query.from);
  const returnLabel =
    (Array.isArray(query.fromLabel) ? query.fromLabel[0] : query.fromLabel) || "上一頁";

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
      {returnTo ? (
        <Link
          href={returnTo}
          className="mb-2 inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
        >
          ← 返回{returnLabel}
        </Link>
      ) : null}
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
