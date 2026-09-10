import fs from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { LibraryError, resolveInLibrary } from "@/lib/papers-library";

export const dynamic = "force-dynamic";

/**
 * Serve a paper's PDF. Browsers refuse to open file:// links from an http page,
 * so a plain link to the file on disk cannot work - the server has to hand the
 * bytes over itself.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = db.prepare("SELECT title, file_path FROM papers WHERE id = ?").get(Number(id)) as
    | { title: string; file_path: string }
    | undefined;

  if (!row?.file_path) return new Response("這篇論文沒有附加檔案", { status: 404 });

  try {
    const abs = resolveInLibrary(row.file_path);
    const stat = fs.statSync(abs);
    return new Response(fs.readFileSync(abs), {
      headers: {
        "content-type": "application/pdf",
        "content-length": String(stat.size),
        // inline: open in the browser's viewer rather than downloading.
        "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(path.basename(abs))}`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    const message = e instanceof LibraryError ? e.message : "無法讀取檔案";
    return new Response(message, { status: e instanceof LibraryError ? 400 : 500 });
  }
}
