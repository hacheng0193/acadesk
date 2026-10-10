import { PaperDropZone } from "@/components/PaperDropZone";
import { PaperForm } from "@/components/PaperForm";
import { PaperTable } from "@/components/PaperTable";
import { Empty, PageHeader, buttonClass } from "@/components/ui";
import { fileSize } from "@/lib/papers-library";
import { listPapers } from "@/lib/queries/papers";
import { listProjects } from "@/lib/queries/research";

export const dynamic = "force-dynamic";

export default function PapersPage() {
  const papers = listPapers();
  const projects = listProjects();
  // Resolved here (server side) so the table can flag files that went missing.
  const sizes = Object.fromEntries(
    papers.filter((p) => p.file_path).map((p) => [p.id, fileSize(p.file_path)]),
  );
  const reading = papers.filter((p) => p.status === "reading").length;
  const toRead = papers.filter((p) => p.status === "to_read").length;

  return (
    <PaperDropZone>
      <PageHeader
        title="文獻"
        subtitle={`${papers.length} 篇　·　${reading} 篇閱讀中　·　${toRead} 篇待讀　·　把 PDF 拖進來即可新增`}
        actions={
          <PaperForm
            projects={projects}
            trigger={<span className={buttonClass({ variant: "primary" })}>＋ 新增論文</span>}
          />
        }
      />
      {papers.length ? (
        <PaperTable papers={papers} projects={projects} sizes={sizes} />
      ) : (
        <Empty>還沒有論文。把 PDF 拖進這頁、按 ⌘K 快速新增，或從右上角填完整資訊。</Empty>
      )}
    </PaperDropZone>
  );
}
