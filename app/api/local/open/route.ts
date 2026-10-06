import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NextResponse } from "next/server";

/** Things `open` would run rather than show. These are revealed in Finder instead. */
const RUNNABLE = new Set([
  ".app", ".command", ".sh", ".zsh", ".bash", ".tool", ".terminal", ".workflow",
  ".scpt", ".scptd", ".applescript", ".action", ".pkg", ".mpkg", ".dmg", ".jar",
  ".bat", ".exe", ".webloc", ".url",
]);

/**
 * Opens a local file or folder with its default app on the machine the server
 * runs on. Browsers refuse to follow file:// links from a web page, and this
 * app is local, so the server does it. Executable-looking files are only
 * revealed in Finder, never launched.
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || new URL(origin).host !== request.headers.get("host")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (process.platform !== "darwin") {
    return NextResponse.json({ error: "目前只支援 macOS。" }, { status: 501 });
  }

  const { href } = (await request.json().catch(() => ({}))) as { href?: string };
  let target: string;
  try {
    if (!href || !/^file:\/\//i.test(href)) throw new Error();
    target = path.resolve(fileURLToPath(href));
  } catch {
    return NextResponse.json({ error: "無效的檔案連結。" }, { status: 400 });
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(target);
  } catch {
    return NextResponse.json({ error: `找不到：${target}` }, { status: 404 });
  }

  const runnable =
    RUNNABLE.has(path.extname(target).toLowerCase()) || (stat.isFile() && (stat.mode & 0o111) !== 0);
  const args = runnable ? ["-R", target] : [target];

  return new Promise<NextResponse>((resolve) => {
    execFile("open", args, (err) => {
      if (err) return resolve(NextResponse.json({ error: "無法開啟這個檔案。" }, { status: 500 }));
      resolve(NextResponse.json({ ok: true, revealed: runnable }));
    });
  });
}
