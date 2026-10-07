import { execFile } from "node:child_process";

/** A macOS notification. Text goes in as argv, never spliced into the script, so titles can't break out of the string. */
export function notify(title: string, body: string) {
  if (process.platform !== "darwin") return;
  execFile(
    "osascript",
    [
      "-e",
      "on run argv",
      "-e",
      'display notification (item 2 of argv) with title (item 1 of argv) sound name "default"',
      "-e",
      "end run",
      title,
      body,
    ],
    { timeout: 10_000 },
    (err) => {
      if (err) console.error("[notify] notification failed:", err.message);
    },
  );
}
