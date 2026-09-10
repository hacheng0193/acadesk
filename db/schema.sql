PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS courses (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL DEFAULT '',
  name          TEXT NOT NULL,
  instructor    TEXT NOT NULL DEFAULT '',
  credits       REAL NOT NULL DEFAULT 3,
  semester      TEXT NOT NULL DEFAULT '',
  color         TEXT NOT NULL DEFAULT 'indigo',
  schedule_json TEXT NOT NULL DEFAULT '[]',
  archived      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS assignments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id    INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  notes_md     TEXT NOT NULL DEFAULT '',
  due_at       TEXT,
  status       TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','done')),
  priority     TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
  weight       REAL,
  est_hours    REAL,
  completed_at TEXT,
  sort_order   REAL NOT NULL DEFAULT 0,
  kind         TEXT NOT NULL DEFAULT 'assignment',
  location     TEXT NOT NULL DEFAULT '',
  end_at       TEXT,
  repeat_rule  TEXT NOT NULL DEFAULT 'none',
  repeat_until TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_assignments_due ON assignments(due_at);
CREATE INDEX IF NOT EXISTS idx_assignments_status ON assignments(status);

CREATE TABLE IF NOT EXISTS projects (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  title          TEXT NOT NULL,
  description_md TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','done')),
  advisor        TEXT NOT NULL DEFAULT '',
  started_on     TEXT,
  color          TEXT NOT NULL DEFAULT 'emerald',
  backup_enabled INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS milestones (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  target_date TEXT,
  status      TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','done')),
  sort_order  REAL NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id);

CREATE TABLE IF NOT EXISTS log_entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL DEFAULT 'experiment' CHECK (kind IN ('experiment','meeting','idea')),
  title       TEXT NOT NULL,
  body_md     TEXT NOT NULL DEFAULT '',
  occurred_on TEXT NOT NULL,
  backup_enabled INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_logs_project ON log_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_logs_date ON log_entries(occurred_on);

CREATE TABLE IF NOT EXISTS papers (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  title     TEXT NOT NULL,
  authors   TEXT NOT NULL DEFAULT '',
  venue     TEXT NOT NULL DEFAULT '',
  year      INTEGER,
  doi       TEXT NOT NULL DEFAULT '',
  url       TEXT NOT NULL DEFAULT '',
  file_path TEXT NOT NULL DEFAULT '',
  status    TEXT NOT NULL DEFAULT 'to_read' CHECK (status IN ('to_read','reading','read')),
  rating    INTEGER,
  notes_md  TEXT NOT NULL DEFAULT '',
  added_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_papers_status ON papers(status);

CREATE TABLE IF NOT EXISTS tags (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT 'slate'
);

CREATE TABLE IF NOT EXISTS paper_tags (
  paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  tag_id   INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (paper_id, tag_id)
);

CREATE TABLE IF NOT EXISTS paper_projects (
  paper_id   INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  PRIMARY KEY (paper_id, project_id)
);

CREATE TABLE IF NOT EXISTS time_sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  course_id  INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  started_at TEXT NOT NULL,
  ended_at   TEXT,
  note       TEXT NOT NULL DEFAULT '',
  source     TEXT NOT NULL DEFAULT 'timer' CHECK (source IN ('timer','manual')),
  last_seen_at TEXT,
  auto_stopped INTEGER NOT NULL DEFAULT 0,
  reviewed     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON time_sessions(started_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_one_running
  ON time_sessions((1)) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS checkins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  day           TEXT NOT NULL UNIQUE,
  check_in_at   TEXT NOT NULL,
  check_out_at  TEXT
);

CREATE TABLE IF NOT EXISTS goals (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  kind         TEXT NOT NULL UNIQUE,
  target_value REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  rel_path        TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  last_seen_mtime INTEGER NOT NULL DEFAULT 0,
  last_indexed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS note_links (
  note_id     INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('project','course','assignment','paper')),
  entity_id   INTEGER NOT NULL,
  PRIMARY KEY (note_id, entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS todos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  day          TEXT NOT NULL,
  title        TEXT NOT NULL,
  done         INTEGER NOT NULL DEFAULT 0,
  sort_order   REAL NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_todos_day ON todos(day, done);

-- Per-occurrence completion for repeating items (a weekly report is done or
-- not done *this* week; the series row itself has no single status).
CREATE TABLE IF NOT EXISTS occurrence_done (
  assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  occurred_on   TEXT NOT NULL,
  completed_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (assignment_id, occurred_on)
);

-- Full-text search across everything the user writes. Content-less FTS5: the
-- rows live in their own tables, this only holds the index.
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
  kind UNINDEXED,
  ref_id UNINDEXED,
  ref_key UNINDEXED,
  title,
  body,
  -- trigram, not unicode61: unicode61 treats a whole run of Chinese as one
  -- token, so searching 對比學習 would never match 對比學習的關鍵. Trigram needs
  -- >= 3 characters, and lib/search.ts falls back to LIKE below that.
  tokenize = "trigram"
);

-- Triggers keep the index honest for database-backed content. Vault notes are
-- files, so they are indexed during the vault scan instead.
CREATE TRIGGER IF NOT EXISTS search_assignments_ai AFTER INSERT ON assignments BEGIN
  INSERT INTO search_index (kind, ref_id, ref_key, title, body)
  VALUES ('item', new.id, new.id, new.title, new.notes_md);
END;
CREATE TRIGGER IF NOT EXISTS search_assignments_au AFTER UPDATE ON assignments BEGIN
  DELETE FROM search_index WHERE kind = 'item' AND ref_id = old.id;
  INSERT INTO search_index (kind, ref_id, ref_key, title, body)
  VALUES ('item', new.id, new.id, new.title, new.notes_md);
END;
CREATE TRIGGER IF NOT EXISTS search_assignments_ad AFTER DELETE ON assignments BEGIN
  DELETE FROM search_index WHERE kind = 'item' AND ref_id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS search_logs_ai AFTER INSERT ON log_entries BEGIN
  INSERT INTO search_index (kind, ref_id, ref_key, title, body)
  VALUES ('log', new.id, COALESCE(new.project_id, 0), new.title, new.body_md);
END;
CREATE TRIGGER IF NOT EXISTS search_logs_au AFTER UPDATE ON log_entries BEGIN
  DELETE FROM search_index WHERE kind = 'log' AND ref_id = old.id;
  INSERT INTO search_index (kind, ref_id, ref_key, title, body)
  VALUES ('log', new.id, COALESCE(new.project_id, 0), new.title, new.body_md);
END;
CREATE TRIGGER IF NOT EXISTS search_logs_ad AFTER DELETE ON log_entries BEGIN
  DELETE FROM search_index WHERE kind = 'log' AND ref_id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS search_papers_ai AFTER INSERT ON papers BEGIN
  INSERT INTO search_index (kind, ref_id, ref_key, title, body)
  VALUES ('paper', new.id, new.id, new.title, new.authors || ' ' || new.venue || ' ' || new.notes_md);
END;
CREATE TRIGGER IF NOT EXISTS search_papers_au AFTER UPDATE ON papers BEGIN
  DELETE FROM search_index WHERE kind = 'paper' AND ref_id = old.id;
  INSERT INTO search_index (kind, ref_id, ref_key, title, body)
  VALUES ('paper', new.id, new.id, new.title, new.authors || ' ' || new.venue || ' ' || new.notes_md);
END;
CREATE TRIGGER IF NOT EXISTS search_papers_ad AFTER DELETE ON papers BEGIN
  DELETE FROM search_index WHERE kind = 'paper' AND ref_id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS search_projects_ai AFTER INSERT ON projects BEGIN
  INSERT INTO search_index (kind, ref_id, ref_key, title, body)
  VALUES ('project', new.id, new.id, new.title, new.description_md);
END;
CREATE TRIGGER IF NOT EXISTS search_projects_au AFTER UPDATE ON projects BEGIN
  DELETE FROM search_index WHERE kind = 'project' AND ref_id = old.id;
  INSERT INTO search_index (kind, ref_id, ref_key, title, body)
  VALUES ('project', new.id, new.id, new.title, new.description_md);
END;
CREATE TRIGGER IF NOT EXISTS search_projects_ad AFTER DELETE ON projects BEGIN
  DELETE FROM search_index WHERE kind = 'project' AND ref_id = old.id;
END;
