import fs from "node:fs";
import path from "node:path";
import { getSetting } from "./db";
import { vaultRoot } from "./vault";

/**
 * Where downloaded paper PDFs live. Paywalled papers (IEEE Xplore and friends)
 * can only exist as a local file, so the app keeps its own copy rather than
 * pointing at whatever is sitting in Downloads today.
 */

const ALLOWED_EXT = new Set([".pdf"]);

export class LibraryError extends Error {}

export function libraryRoot(): string {
  const configured = getSetting("papers_dir");
  const root = configured
    ? path.resolve(configured.replace(/^~(?=$|\/)/, process.env.HOME ?? "~"))
    : path.join(process.cwd(), "data", "papers");
  fs.mkdirSync(root, { recursive: true });
  return root;
}

/**
 * Resolve a stored file path and refuse anything outside the places we are
 * willing to serve. Without this the file endpoint would read any file on disk.
 * Same shape as vault.ts:resolveInVault - one guard, used by every read.
 */
export function resolveInLibrary(stored: string): string {
  if (!stored || stored.includes("\0")) throw new LibraryError("無效的檔案路徑");

  const roots = [libraryRoot(), vaultRoot()].filter(Boolean) as string[];
  const abs = path.isAbsolute(stored) ? path.resolve(stored) : path.resolve(libraryRoot(), stored);

  if (!ALLOWED_EXT.has(path.extname(abs).toLowerCase())) {
    throw new LibraryError("只能開啟 PDF 檔案");
  }
  const inside = roots.some((root) => abs === root || abs.startsWith(root + path.sep));
  if (!inside) throw new LibraryError("檔案不在論文庫或 vault 範圍內");
  if (!fs.existsSync(abs)) throw new LibraryError("檔案不存在，可能已被移動或刪除");

  return abs;
}

/** Readable, collision-free filename: "12-attention-is-all-you-need.pdf". */
export function libraryFileName(paperId: number, title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[\/\\:*?"<>|\0]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
  return `${paperId}-${slug || "paper"}.pdf`;
}

/** Copy an uploaded PDF into the library, replacing this paper's previous file. */
export function storePdf(
  paperId: number,
  title: string,
  bytes: Buffer,
  previous: string,
): string {
  const root = libraryRoot();
  const name = libraryFileName(paperId, title);
  const dest = path.join(root, name);
  fs.writeFileSync(dest, bytes);

  // Drop the old copy, but only if it was one we owned inside the library.
  if (previous && previous !== name) {
    try {
      const oldAbs = resolveInLibrary(previous);
      if (oldAbs.startsWith(root + path.sep) && oldAbs !== dest) fs.unlinkSync(oldAbs);
    } catch {
      // Missing or out-of-scope: nothing of ours to clean up.
    }
  }
  return name;
}

export function removePdf(stored: string): void {
  const root = libraryRoot();
  try {
    const abs = resolveInLibrary(stored);
    if (abs.startsWith(root + path.sep)) fs.unlinkSync(abs);
  } catch {
    // Already gone, or outside the library - leave the user's own files alone.
  }
}

export function fileSize(stored: string): number | null {
  try {
    return fs.statSync(resolveInLibrary(stored)).size;
  } catch {
    return null;
  }
}
