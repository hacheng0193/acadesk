import fs from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { LibraryError, removePdf, resolveInLibrary, storePdf } from "@/lib/papers-library";

export const dynamic = "force-dynamic";

const MAX_BYTES = 100 * 1024 * 1024;

function refresh(id: number) {
  revalidatePath("/papers");
  revalidatePath(`/papers/${id}`);
  revalidatePath("/research", "layout");
  revalidatePath("/reviews", "layout");
}

function paperRow(id: string) {
  return db.prepare("SELECT title, file_path FROM papers WHERE id = ?").get(Number(id)) as
    | { title: string; file_path: string }
    | undefined;
}

/**
 * Serve a paper's PDF. Browsers refuse to open file:// links from an http page,
 * so a plain link to the file on disk cannot work - the server has to hand the
 * bytes over itself.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = paperRow(id);

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

/**
 * Attach a PDF. A route handler rather than a server action: server actions
 * cap the request body (4 MB here), and most papers are bigger than that.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = paperRow(id);
  if (!row) return Response.json({ error: "找不到這篇論文" }, { status: 404 });

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return Response.json({ error: "無法讀取上傳內容" }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "沒有選擇檔案" }, { status: 400 });
  }
  if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return Response.json({ error: "只接受 PDF 檔案" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) return Response.json({ error: "檔案超過 100 MB" }, { status: 413 });

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
      return Response.json({ error: "這個檔案不是有效的 PDF" }, { status: 400 });
    }
    const stored = storePdf(Number(id), row.title, bytes, row.file_path);
    db.prepare("UPDATE papers SET file_path = ? WHERE id = ?").run(stored, Number(id));
    refresh(Number(id));
    return Response.json({ ok: true, file: stored, size: bytes.length });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "存檔失敗" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = paperRow(id);
  if (!row) return Response.json({ error: "找不到這篇論文" }, { status: 404 });
  if (row.file_path) removePdf(row.file_path);
  db.prepare("UPDATE papers SET file_path = '' WHERE id = ?").run(Number(id));
  refresh(Number(id));
  return Response.json({ ok: true });
}
