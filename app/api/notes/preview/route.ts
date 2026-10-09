import { NextResponse } from "next/server";
import { renderMarkdown } from "@/lib/markdown";
import { attachmentIndex, imageIndex, noteIndex, obsidianUri, resolveVaultImage } from "@/lib/vault";

/** Live preview for the note editor. Rendering server-side keeps one Markdown
 *  implementation rather than shipping a second parser to the browser. */
export async function POST(request: Request) {
  const { markdown } = (await request.json()) as { markdown?: string };
  const images = imageIndex();
  const index = noteIndex();
  const files = attachmentIndex();
  return NextResponse.json({
    html: renderMarkdown(String(markdown ?? ""), {
      stripFrontmatter: true,
      resolveWikilink: (name) => index.get(name.toLowerCase()) ?? null,
      resolveImage: (src) => resolveVaultImage(src, images),
      resolveFile: (name) => {
        const rel = files.get(name.toLowerCase());
        return rel ? obsidianUri(rel) : null;
      },
    }),
  });
}
