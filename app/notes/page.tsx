import Link from "next/link";
import { NoteTree } from "@/components/NoteTree";
import { Empty, PageHeader } from "@/components/ui";
import { listNotes, syncNoteIndex, vaultRoot } from "@/lib/vault";

export const dynamic = "force-dynamic";

export default function NotesPage() {
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
  const notes = listNotes();

  return (
    <>
      <PageHeader
        title="筆記"
        subtitle={`${notes.length} 篇　·　${root}`}
      />
      {notes.length ? <NoteTree notes={notes} /> : <Empty>這個 vault 裡還沒有 .md 檔案。</Empty>}
    </>
  );
}
