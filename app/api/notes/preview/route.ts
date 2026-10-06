import { NextResponse } from "next/server";
import { renderMarkdown } from "@/lib/markdown";
import { imageIndex, listNotes, resolveVaultImage } from "@/lib/vault";

/** Live preview for the note editor. Rendering server-side keeps one Markdown
 *  implementation rather than shipping a second parser to the browser. */
export async function POST(request: Request) {
  const { markdown } = (await request.json()) as { markdown?: string };
  const images = imageIndex();
  const index = new Map(listNotes().map((f) => [f.title.toLowerCase(), f.rel]));
  return NextResponse.json({
    html: renderMarkdown(String(markdown ?? ""), {
      stripFrontmatter: true,
      resolveWikilink: (name) => index.get(name.toLowerCase()) ?? null,
      resolveImage: (src) => resolveVaultImage(src, images),
    }),
  });
}
