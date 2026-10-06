import Link from "next/link";
import { ReviewForm } from "@/components/ReviewForm";
import { Badge, Card, Empty, PageHeader, buttonClass } from "@/components/ui";
import { listReviews } from "@/lib/queries/reviews";
import { listProjects } from "@/lib/queries/research";
import { colorOf } from "@/lib/types";

export const dynamic = "force-dynamic";

export default function ReviewsPage() {
  const reviews = listReviews();
  const projects = listProjects();

  return (
    <>
      <PageHeader
        title="文獻回顧"
        subtitle={`${reviews.length} 份　·　把論文排進比較表，再寫成綜述`}
        actions={
          <ReviewForm
            projects={projects}
            trigger={<span className={buttonClass({ variant: "primary" })}>＋ 新增文獻回顧</span>}
          />
        }
      />
      {reviews.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {reviews.map((r) => (
            <Link key={r.id} href={`/reviews/${r.id}`}>
              <Card className="h-full p-4 transition-colors hover:border-[var(--accent)]">
                <h2 className="text-sm font-semibold leading-snug">{r.title}</h2>
                {r.question_md ? (
                  <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-dim">{r.question_md}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Badge tone="accent">{r.paper_count} 篇</Badge>
                  {r.project_title ? (
                    <Badge>
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: colorOf(r.project_color ?? "") }}
                      />
                      {r.project_title}
                    </Badge>
                  ) : null}
                  <span className="ml-auto text-[11px] tabular-nums text-dim">
                    更新於 {r.updated_at.slice(0, 10)}
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Empty>還沒有文獻回顧。建立一份，從文獻庫挑論文放進比較表。</Empty>
      )}
    </>
  );
}
