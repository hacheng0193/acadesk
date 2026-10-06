import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteReview } from "@/app/actions/reviews";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Markdown } from "@/components/Markdown";
import { ReviewForm } from "@/components/ReviewForm";
import { ReviewMatrix } from "@/components/ReviewMatrix";
import { SynthesisEditor } from "@/components/SynthesisEditor";
import { Card, PageHeader, SectionTitle, buttonClass } from "@/components/ui";
import { listPapers } from "@/lib/queries/papers";
import { listProjects } from "@/lib/queries/research";
import { getReview, reviewPapers } from "@/lib/queries/reviews";
import { parseColumns } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const review = getReview(Number(id));
  if (!review) notFound();

  const rows = reviewPapers(review.id);
  const projects = listProjects();
  const project = projects.find((p) => p.id === review.project_id);
  const library = listPapers().map(({ id, title, authors, year }) => ({ id, title, authors, year }));
  const exportHref = (format: string) => `/api/reviews/${review.id}/export?format=${format}`;

  return (
    <>
      <Link href="/reviews" className="mb-3 inline-block text-xs text-dim hover:text-ink">
        ← 文獻回顧
      </Link>
      <PageHeader
        title={review.title}
        subtitle={
          <>
            {rows.length} 篇論文
            {project ? (
              <>
                {"　·　"}
                <Link href={`/research/${project.id}`} className="hover:text-ink hover:underline">
                  {project.title}
                </Link>
              </>
            ) : null}
          </>
        }
        actions={
          <>
            <a href={exportHref("md")} className={buttonClass({ variant: "outline" })}>
              匯出 Markdown
            </a>
            <a href={exportHref("bib")} className={buttonClass({ variant: "outline" })}>
              匯出 BibTeX
            </a>
            <ReviewForm
              review={review}
              projects={projects}
              trigger={<span className={buttonClass({ variant: "outline" })}>編輯</span>}
            />
            <ConfirmButton
              size="md"
              className="text-danger"
              message={`刪除「${review.title}」？比較表和綜述都會一起刪除（文獻庫的論文不受影響）。`}
              action={deleteReview.bind(null, review.id)}
            >
              刪除
            </ConfirmButton>
          </>
        }
      />

      {review.question_md ? (
        <Card className="mb-6 p-4">
          <p className="mb-1.5 text-xs font-medium text-dim">研究問題 / 範圍</p>
          <Markdown>{review.question_md}</Markdown>
        </Card>
      ) : null}

      <section className="mb-8">
        <SectionTitle title="比較矩陣" hint="點儲存格編輯，⌘Enter 或點外面儲存；欄位名稱可直接改" />
        <ReviewMatrix
          reviewId={review.id}
          columns={parseColumns(review.columns_json)}
          rows={rows}
          library={library}
        />
      </section>

      <section>
        <SectionTitle title="綜述" hint="整理共通點、分歧與研究缺口" />
        <SynthesisEditor reviewId={review.id} initial={review.synthesis_md} papers={rows} />
      </section>
    </>
  );
}
