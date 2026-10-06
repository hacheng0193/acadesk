import { getReview, reviewPapers } from "@/lib/queries/reviews";
import { toBibtex, toMarkdownTable } from "@/lib/review-export";

export const dynamic = "force-dynamic";

/** Download a review's matrix as a Markdown table, or its papers as BibTeX. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const review = getReview(Number(id));
  if (!review) return new Response("找不到這份文獻回顧", { status: 404 });

  const format = new URL(request.url).searchParams.get("format");
  const rows = reviewPapers(review.id);
  const [body, ext, type] =
    format === "bib"
      ? [toBibtex(rows), "bib", "application/x-bibtex"]
      : [toMarkdownTable(review, rows), "md", "text/markdown"];

  return new Response(body, {
    headers: {
      "content-type": `${type}; charset=utf-8`,
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${review.title}.${ext}`)}`,
      "cache-control": "no-store",
    },
  });
}
