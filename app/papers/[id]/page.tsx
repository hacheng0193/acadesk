import { notFound } from "next/navigation";
import { PaperReader } from "@/components/PaperReader";
import { getSetting } from "@/lib/db";
import { ensurePaperNote } from "@/lib/paper-notes";
import { fileSize } from "@/lib/papers-library";
import { getPaper, listChats, listHighlights } from "@/lib/queries/papers";
import { listProjects } from "@/lib/queries/research";

export const dynamic = "force-dynamic";

export default async function PaperPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  let paper = getPaper(id);
  if (!paper) notFound();

  const note = ensurePaperNote(paper);
  // Creating the note writes note_path back; read the row again to carry it.
  if (note.ok && note.rel !== paper.note_path) paper = getPaper(id) ?? paper;

  return (
    <PaperReader
      paper={paper}
      projects={listProjects()}
      fileSize={paper.file_path ? fileSize(paper.file_path) : null}
      note={note}
      highlights={listHighlights(id)}
      chats={listChats(id)}
      models={{
        claude: getSetting("paper_ai_claude_model") ?? "",
        codex: getSetting("paper_ai_codex_model") ?? "",
      }}
    />
  );
}
