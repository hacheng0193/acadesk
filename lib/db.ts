import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = path.join(process.cwd(), "data", "acadesk.db");

declare global {
  // eslint-disable-next-line no-var
  var __acadeskDb: Database.Database | undefined;
}

/**
 * Columns added to tables that already exist in someone's database. CREATE TABLE
 * IF NOT EXISTS in schema.sql cannot add these, so they are applied here - each
 * one is checked against PRAGMA table_info, so running this repeatedly is safe.
 */
const ADDED_COLUMNS: { table: string; column: string; definition: string }[] = [
  { table: "assignments", column: "kind", definition: "TEXT NOT NULL DEFAULT 'assignment'" },
  { table: "assignments", column: "location", definition: "TEXT NOT NULL DEFAULT ''" },
  { table: "assignments", column: "end_at", definition: "TEXT" },
  { table: "assignments", column: "repeat_rule", definition: "TEXT NOT NULL DEFAULT 'none'" },
  { table: "assignments", column: "repeat_until", definition: "TEXT" },
  { table: "projects", column: "backup_enabled", definition: "INTEGER NOT NULL DEFAULT 1" },
  { table: "time_sessions", column: "last_seen_at", definition: "TEXT" },
  { table: "time_sessions", column: "auto_stopped", definition: "INTEGER NOT NULL DEFAULT 0" },
  { table: "time_sessions", column: "reviewed", definition: "INTEGER NOT NULL DEFAULT 0" },
  { table: "courses", column: "project_id", definition: "INTEGER REFERENCES projects(id)" },
  { table: "projects", column: "kind", definition: "TEXT NOT NULL DEFAULT 'research'" },
];

function migrate(database: Database.Database): void {
  for (const { table, column, definition } of ADDED_COLUMNS) {
    const columns = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (columns.some((c) => c.name === column)) continue;
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function open(): Database.Database {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const database = new Database(DB_PATH);
  // `next build` collects page data in several worker processes at once, and
  // each one opens this database and applies the schema. Without a busy timeout
  // they collide on the very first build of a fresh clone and the build dies
  // with SQLITE_BUSY. Wait for the other writer instead of failing.
  database.pragma("busy_timeout = 10000");
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.exec(fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8"));
  migrate(database);
  return database;
}

// Reused across hot reloads in dev so we don't leak file handles. schema.sql is
// applied once per connection, so editing it needs a server restart, not just a
// hot reload.
export const db = globalThis.__acadeskDb ?? (globalThis.__acadeskDb = open());

export function getSetting(key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}
