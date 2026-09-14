import fs from "node:fs";
import path from "node:path";
import { db, getSetting } from "../lib/db.ts";

/**
 * One-time move of research log entries out of the `log_entries` table and into
 * the Obsidian vault, where the app now keeps them (lib/queries/logs.ts).
 *
 * Each entry becomes `<folder>/<date> <title>.md` with `type` and `date` in the
 * frontmatter, placed where a new log for its topic would go, and attached to
 * that topic. Entries without a topic go to `研究日誌/`.
 *
 * Dry run by default; pass --apply to write. Before touching anything it takes
 * a database snapshot, and it only drops the table once every file is written.
 *
 *   node --experimental-strip-types scripts/migrate-logs-to-vault.mts [--apply]
 */

const apply = process.argv.includes("--apply");

const hasTable = db
  .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'log_entries'")
  .get();
if (!hasTable) {
  console.log("沒有 log_entries 資料表，已經遷移過了。");
  process.exit(0);
}

const configured = process.env.OBSIDIAN_VAULT || getSetting("vault_path");
const root = configured
  ? path.resolve(configured.replace(/^~(?=$|\/)/, process.env.HOME ?? "~"))
  : null;
if (!root || !fs.existsSync(root)) {
  console.error("找不到 Obsidian vault，請先在設定頁填好 vault 路徑。");
  process.exit(1);
}

type Row = {
  id: number;
  project_id: number | null;
  kind: string;
  title: string;
  body_md: string;
  occurred_on: string;
  project_title: string | null;
};

const rows = db
  .prepare(
    `SELECT l.id, l.project_id, l.kind, l.title, l.body_md, l.occurred_on, p.title AS project_title
     FROM log_entries l LEFT JOIN projects p ON p.id = l.project_id ORDER BY l.occurred_on, l.id`,
  )
  .all() as Row[];

const clean = (s: string) => s.replace(/[\/\\:*?"<>|\0]/g, "-").replace(/^\.+/, "").trim();

function followedFolders(projectId: number): string[] {
  return (
    db
      .prepare(
        "SELECT folder FROM note_folder_links WHERE entity_type = 'project' AND entity_id = ? ORDER BY folder",
      )
      .all(projectId) as { folder: string }[]
  ).map((r) => r.folder);
}

function freePath(folder: string, base: string): string {
  for (let n = 1; ; n++) {
    const rel = path.posix.join(folder, `${base}${n > 1 ? ` (${n})` : ""}.md`);
    if (!fs.existsSync(path.join(root!, rel))) return rel;
  }
}

const plan = rows.map((r) => {
  const folder = r.project_id
    ? (followedFolders(r.project_id)[0] ?? (clean(r.project_title ?? "") || "研究日誌"))
    : "研究日誌";
  const rel = freePath(folder, clean(`${r.occurred_on} ${r.title}`) || r.occurred_on);
  const content =
    `---\ntype: ${r.kind}\ndate: ${r.occurred_on}\n---\n\n# ${r.title}\n\n` +
    (r.body_md ? `${r.body_md.trimEnd()}\n` : "");
  return { row: r, folder, rel, content };
});

for (const p of plan) console.log(`${apply ? "寫入" : "預計"}　#${p.row.id} → ${p.rel}`);
if (!plan.length) console.log("log_entries 是空的。");

if (!apply) {
  console.log("\n這是預演，沒有寫入任何東西。確認路徑無誤後加上 --apply。");
  process.exit(0);
}

const snapshotDir = path.join(process.cwd(), "backups", "snapshots");
fs.mkdirSync(snapshotDir, { recursive: true });
const snapshot = path.join(snapshotDir, `pre-log-migration-${Date.now()}.db`);
db.prepare("VACUUM INTO ?").run(snapshot);
console.log(`\n資料庫快照：${snapshot}`);

for (const p of plan) {
  const abs = path.join(root, p.rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, p.content, { encoding: "utf8", flag: "wx" });
}

db.transaction(() => {
  for (const p of plan) {
    const title = path.posix.basename(p.rel, ".md");
    db.prepare("INSERT OR IGNORE INTO notes (rel_path, title) VALUES (?, ?)").run(p.rel, title);
    if (!p.row.project_id) continue;
    const followed = followedFolders(p.row.project_id);
    if (followed.some((f) => p.folder === f || p.folder.startsWith(`${f}/`))) continue;
    if (!followed.length) {
      db.prepare(
        "INSERT OR IGNORE INTO note_folder_links (folder, entity_type, entity_id) VALUES (?, 'project', ?)",
      ).run(p.folder, p.row.project_id);
    } else {
      const noteId = (db.prepare("SELECT id FROM notes WHERE rel_path = ?").get(p.rel) as { id: number }).id;
      db.prepare(
        "INSERT OR IGNORE INTO note_links (note_id, entity_type, entity_id) VALUES (?, 'project', ?)",
      ).run(noteId, p.row.project_id);
    }
  }
  db.prepare("DELETE FROM search_index WHERE kind = 'log'").run();
  db.exec("DROP TABLE log_entries"); // its indexes and search triggers go with it
})();

console.log(`完成：${plan.length} 筆紀錄已搬到 vault，log_entries 已移除。`);
