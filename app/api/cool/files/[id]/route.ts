import { CoolError, openCoolFile } from "@/lib/cool";

export const dynamic = "force-dynamic";

/**
 * Preview a COOL lecture file in the browser. Serves the vault copy once it has
 * been downloaded; before that it streams from COOL so a file can be looked at
 * before deciding whether to keep it.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const file = await openCoolFile(Number(id));
    const headers: Record<string, string> = {
      "content-type": file.type,
      // inline: PDFs open in the browser's viewer instead of downloading.
      "content-disposition": `${file.inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "cache-control": "no-store",
    };
    if (file.size) headers["content-length"] = String(file.size);
    return new Response(file.body as BodyInit, { headers });
  } catch (e) {
    const message = e instanceof CoolError ? e.message : "無法讀取檔案";
    return new Response(message, {
      status: e instanceof CoolError ? 400 : 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}
