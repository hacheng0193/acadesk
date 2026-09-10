import fs from "node:fs";
import path from "node:path";
// Reuse the app's connection so schema and migrations are applied exactly once,
// by exactly one piece of code.
import { db, setSetting } from "../lib/db.ts";

/**
 * Two artefacts, each for a different job:
 *
 *   snapshot (.db)  - complete, restore-grade, stays on this machine.
 *   export  (.json) - text, diffs well in git, and OMITS anything the user
 *                     flagged as not-for-upload.
 *
 * Run with `npm run backup`; the login agent runs it daily via backup-run.sh.
 */

const ROOT = process.cwd();
const SNAPSHOT_DIR = path.join(ROOT, "backups", "snapshots");
const EXPORT_DIR = path.join(ROOT, "backups", "export");
const KEEP_DAYS = 14;
const VOLATILE_SETTINGS = /^(last_backup_|git_backup_status$)/;

function stamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

function localIso(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/** Consistent single-file copy. Plain `cp` is unsafe while WAL is in use. */
function writeSnapshot(): string {
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const out = path.join(SNAPSHOT_DIR, `acadesk-${stamp()}.db`);
  db.prepare("VACUUM INTO ?").run(out);
  return out;
}

/**
 * Keep the newest snapshot per day, for the last KEEP_DAYS days.
 *
 * Counting files instead of days would collapse the window as soon as backups
 * run more than once a day - which they now do, since the job also fires at
 * login to cover machines that are switched off overnight.
 */
function rotateSnapshots(): number {
  const files = fs
    .readdirSync(SNAPSHOT_DIR)
    .filter((f) => /^acadesk-\d{8}-\d{6}\.db$/.test(f))
    .sort();

  const newestPerDay = new Map<string, string>();
  for (const f of files) newestPerDay.set(f.slice(8, 16), f); // "acadesk-".length = 8; sorted, so last wins

  const keep = new Set([...newestPerDay.keys()].sort().slice(-KEEP_DAYS).map((d) => newestPerDay.get(d)!));
  const stale = files.filter((f) => !keep.has(f));
  for (const f of stale) fs.unlinkSync(path.join(SNAPSHOT_DIR, f));
  return stale.length;
}

/**
 * Projects and log entries the user has excluded from off-machine backup.
 * Turning a project off also excludes its logs, whatever their own flag says.
 */
function excluded(): { projectIds: Set<number>; logIds: Set<number> } {
  const projectIds = new Set(
    (db.prepare("SELECT id FROM projects WHERE backup_enabled = 0").all() as { id: number }[]).map(
      (r) => r.id,
    ),
  );
  const logs = db
    .prepare("SELECT id, project_id, backup_enabled FROM log_entries")
    .all() as { id: number; project_id: number | null; backup_enabled: number }[];
  const logIds = new Set(
    logs
      .filter((l) => !l.backup_enabled || (l.project_id !== null && projectIds.has(l.project_id)))
      .map((l) => l.id),
  );
  return { projectIds, logIds };
}

function writeExport(): { file: string; omitted: number } {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  const { projectIds, logIds } = excluded();

  const tables = (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[]
  ).map((t) => t.name);

  const dump: Record<string, unknown[]> = {};
  for (const table of tables) {
    let rows = db.prepare(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[];
    if (table === "projects") rows = rows.filter((r) => !projectIds.has(r.id as number));
    if (table === "log_entries") rows = rows.filter((r) => !logIds.has(r.id as number));
    // Operational status is not user data, and it changes on every single run -
    // leaving it in would make every export differ and defeat the
    // "no change, no commit" rule downstream.
    if (table === "settings") rows = rows.filter((r) => !VOLATILE_SETTINGS.test(String(r.key)));
    dump[table] = rows;
  }

  // No timestamp in the body: the git commit already carries one, and a value
  // that changes every run would make the file differ even when nothing did.
  const file = path.join(EXPORT_DIR, "acadesk-export.json");
  fs.writeFileSync(file, JSON.stringify({ tables: dump }, null, 2) + "\n");
  return { file, omitted: projectIds.size + logIds.size };
}

try {
  const snapshot = writeSnapshot();
  const rotated = rotateSnapshots();
  const { file, omitted } = writeExport();

  const rows = Object.values(
    JSON.parse(fs.readFileSync(file, "utf8")).tables as Record<string, unknown[]>,
  ).reduce((n, r) => n + r.length, 0);

  setSetting("last_backup_at", localIso());
  setSetting("last_backup_error", "");
  setSetting("last_backup_omitted", String(omitted));

  console.log(`快照：${snapshot}`);
  console.log(`匯出：${file}（${rows} 筆${omitted ? `，${omitted} 筆依開關排除` : ""}）`);
  if (rotated) console.log(`清理了 ${rotated} 份快照（每天保留最新一份，共 ${KEEP_DAYS} 天）`);
} catch (e) {
  const message = e instanceof Error ? e.message : String(e);
  // Record the failure so the settings page can surface it - a backup that
  // fails silently is worse than no backup at all.
  try {
    setSetting("last_backup_error", `${localIso()}　${message}`);
  } catch {
    // Database itself is unreachable; the log is all we have left.
  }
  console.error(`備份失敗：${message}`);
  process.exit(1);
}
