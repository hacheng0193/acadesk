import { execFile } from "node:child_process";
import { NextResponse } from "next/server";

/**
 * Opens the macOS file/folder chooser on the machine the server runs on and
 * returns the chosen path. Only the path comes back - the file is never read.
 * That makes sense because this app is local; it would be meaningless (and is
 * refused) anywhere else.
 */
export async function POST(request: Request) {
  // A page on another site must not be able to pop dialogs on this machine.
  const origin = request.headers.get("origin");
  if (!origin || new URL(origin).host !== request.headers.get("host")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (process.platform !== "darwin") {
    return NextResponse.json({ error: "目前只支援 macOS，請直接貼上路徑。" }, { status: 501 });
  }

  const { kind } = (await request.json().catch(() => ({}))) as { kind?: string };
  const chooser = kind === "folder" ? "choose folder" : "choose file";
  const prompt = kind === "folder" ? "選擇要連結的資料夾" : "選擇要連結的檔案";

  return new Promise<NextResponse>((resolve) => {
    execFile(
      "osascript",
      ["-e", `POSIX path of (${chooser} with prompt "${prompt}")`],
      { timeout: 5 * 60_000 },
      (err, stdout, stderr) => {
        if (err) {
          // -128 is the user pressing 取消; not an error worth showing.
          if (/-128/.test(stderr)) return resolve(NextResponse.json({ path: null }));
          return resolve(NextResponse.json({ error: "無法開啟選擇視窗，請直接貼上路徑。" }, { status: 500 }));
        }
        resolve(NextResponse.json({ path: stdout.trim() || null }));
      },
    );
  });
}
