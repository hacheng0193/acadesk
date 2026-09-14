import fs from "node:fs";
import path from "node:path";
import { splitFrontmatter } from "../markdown";
import { LOG_KINDS, type LogKind, type Project, type VaultLog } from "../types";
import { vaultRoot } from "../vault";
import { foldersFor, notesFor } from "./notes";
import { listProjects } from "./research";

/** Enough of the file for the frontmatter and a few lines of preview. */
const HEAD_BYTES = 4096;

function readHead(abs: string): string {
  const fd = fs.openSync(abs, "r");
  try {
    const buf = Buffer.alloc(HEAD_BYTES);
    const n = fs.readSync(fd, buf, 0, HEAD_BYTES, 0);
    return buf.subarray(0, n).toString("utf8");
  } finally {
    fs.closeSync(fd);
  }
}

/** Flat `key: value` frontmatter - all a log note needs, no YAML library. */
function parseFrontmatter(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
}

/** A few lines of prose: headings, empty lines and the leading `# title` dropped. */
function previewOf(body: string): string {
  return body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^#{1,6}\s/.test(l) && !/^(```|---)/.test(l))
    .slice(0, 3)
    .map((l) =>
      l
        .replace(/^(>\s*)+|^[-*+]\s+(\[[ xX]\]\s+)?|^\d+\.\s+/, "")
        .replace(/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, name, alias) => alias ?? name)
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/(\*\*|__|`|~~)/g, ""),
    )
    .join(" ")
    .slice(0, 240);
}

/**
 * A research log entry is a vault note whose frontmatter `type` is one of the
 * log kinds. The file is the record - nothing is stored in the database - so a
 * note written in Obsidian with the same frontmatter shows up here as well.
 */
function asLog(root: string, rel: string, title: string, projectId: number): VaultLog | null {
  let head: string;
  let mtime: number;
  try {
    const abs = path.join(root, rel);
    head = readHead(abs);
    mtime = fs.statSync(abs).mtimeMs;
  } catch {
    return null;
  }
  const { frontmatter, body } = splitFrontmatter(head);
  if (!frontmatter) return null;
  const meta = parseFrontmatter(frontmatter);
  if (!LOG_KINDS.some((k) => k.key === meta.type)) return null;

  const date = /^\d{4}-\d{2}-\d{2}/.test(meta.date ?? "")
    ? meta.date.slice(0, 10)
    : new Date(mtime).toISOString().slice(0, 10);
  return {
    rel_path: rel,
    title: meta.title || title.replace(/^\d{4}-\d{2}-\d{2}\s+/, ""),
    kind: meta.type as LogKind,
    date,
    preview: previewOf(body),
    project_id: projectId,
  };
}

function byDateDesc(a: VaultLog, b: VaultLog): number {
  return b.date.localeCompare(a.date) || b.rel_path.localeCompare(a.rel_path);
}

/** Log notes attached to a topic, newest first. */
export function logsFor(projectId: number): VaultLog[] {
  const root = vaultRoot();
  if (!root) return [];
  return notesFor("project", projectId)
    .map((n) => asLog(root, n.rel_path, n.title, projectId))
    .filter((l): l is VaultLog => l !== null)
    .sort(byDateDesc);
}

/** Newest log notes across every topic, for the overview. */
export function recentLogs(limit: number): (VaultLog & { project_title: string })[] {
  const seen = new Set<string>();
  const out: (VaultLog & { project_title: string })[] = [];
  for (const p of listProjects()) {
    for (const log of logsFor(p.id)) {
      if (seen.has(log.rel_path)) continue;
      seen.add(log.rel_path);
      out.push({ ...log, project_title: p.title });
    }
  }
  return out.sort(byDateDesc).slice(0, limit);
}

/** Where a new log note for this topic goes unless the user picks elsewhere:
 *  the folder it already follows, or one named after it at the vault root. */
export function defaultLogFolder(project: Pick<Project, "id" | "title">): string {
  return (
    foldersFor("project", project.id)[0] ??
    (project.title.replace(/[\/\\:*?"<>|\0]/g, "-").replace(/^\.+/, "").trim() || "研究日誌")
  );
}
