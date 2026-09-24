import { NextResponse } from "next/server";
import { renderMarkdown } from "@/lib/markdown";
import { imageIndex, resolveVaultImage } from "@/lib/vault";

/** Live preview for the note editor. Rendering server-side keeps one Markdown
 *  implementation rather than shipping a second parser to the browser. */
export async function POST(request: Request) {
  const { markdown } = (await request.json()) as { markdown?: string };
  const images = imageIndex();
  return NextResponse.json({
    html: renderMarkdown(String(markdown ?? ""), {
      stripFrontmatter: true,
      resolveImage: (src) => resolveVaultImage(src, images),
    }),
  });
}
