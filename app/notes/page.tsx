import Link from "next/link";
import { NoteTree } from "@/components/NoteTree";
import { Empty, PageHeader } from "@/components/ui";
import { listNotes, noteTags, syncNoteIndex, vaultRoot } from "@/lib/vault";

export const dynamic = "force-dynamic";

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const rawTag = (await searchParams).tag;
  const initialTags = rawTag === undefined ? [] : Array.isArray(rawTag) ? rawTag : [rawTag];
  const root = vaultRoot();
  if (!root) {
    return (
      <>
        <PageHeader title="筆記" />
        <Empty>
          尚未設定 Obsidian vault。到{" "}
          <Link href="/settings" className="text-[var(--accent)] underline">
            設定
          </Link>{" "}
          填入 vault 的絕對路徑後，這裡就會列出你所有的 Markdown 筆記。
        </Empty>
      </>
    );
  }

  syncNoteIndex();
  const tags = noteTags();
  const notes = listNotes().map((n) => ({ ...n, tags: tags.get(n.rel) ?? [] }));

  return (
    <>
      <PageHeader
        title="筆記"
        subtitle={`${notes.length} 篇　·　${root}`}
      />
      {notes.length ? <NoteTree notes={notes} initialTags={initialTags} /> : <Empty>這個 vault 裡還沒有 .md 檔案。</Empty>}
    </>
  );
}
