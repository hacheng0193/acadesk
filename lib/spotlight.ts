import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** Quote a user string for a Spotlight query literal; `*` would be a wildcard. */
function literal(q: string): string {
  return q.replace(/[\\"*]/g, (c) => `\\${c}`);
}

/**
 * Attachments (PDFs, slides, ...) under `root` whose text contains a word
 * starting with `query`, via macOS Spotlight. Notes are left to the SQLite
 * index, which matches Chinese substrings that Spotlight's word splitting misses;
 * this covers what that index cannot read at all.
 *
 * Best effort: off macOS, outside Spotlight's index, or slow, it returns [].
 */
export function spotlightAttachments(root: string, query: string, limit = 20): Promise<string[]> {
  const q = query.trim();
  if (process.platform !== "darwin" || !q) return Promise.resolve([]);
  const expr = `kMDItemTextContent == "${literal(q)}*"cdw && kMDItemFSName != "*.md"c`;
  return new Promise((resolve) => {
    execFile("mdfind", ["-onlyin", root, expr], { timeout: 1500 }, (err, stdout) => {
      if (err) return resolve([]);
      const out: string[] = [];
      for (const abs of stdout.split("\n")) {
        if (!abs.startsWith(root + path.sep)) continue;
        const rel = path.relative(root, abs);
        // Hidden folders (.obsidian, .trash) are not part of the vault proper.
        if (rel.split(path.sep).some((part) => part.startsWith("."))) continue;
        try {
          if (!fs.statSync(abs).isFile()) continue;
        } catch {
          continue; // gone since Spotlight last looked
        }
        out.push(rel);
        if (out.length >= limit) break;
      }
      resolve(out);
    });
  });
}
