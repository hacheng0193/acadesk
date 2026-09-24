import fs from "node:fs";
import path from "node:path";
import { resolveImageInVault, VaultError } from "@/lib/vault";

export const dynamic = "force-dynamic";

/**
 * Serve an image out of the vault. Notes embed files that live on disk next to
 * them, and a browser cannot follow a file:// src from an http page, so the
 * server hands the bytes over - the same trick as a paper's PDF.
 */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("path");
  if (!raw) return new Response("缺少檔案路徑", { status: 400 });

  try {
    const { abs, type } = resolveImageInVault(raw);
    const stat = fs.statSync(abs);
    return new Response(fs.readFileSync(abs), {
      headers: {
        "content-type": type,
        "content-length": String(stat.size),
        "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(path.basename(abs))}`,
        // The file can be replaced in Obsidian under the same name.
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof VaultError) return new Response(e.message, { status: 400 });
    return new Response("找不到這張圖片", { status: 404 });
  }
}
