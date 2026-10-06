# Acadesk

A local-first coursework & research manager for university and graduate students.
Courses, assignments, research milestones, time tracking, papers and notes — one
app, running on your own machine.

No accounts, no cloud, no telemetry. It listens on `127.0.0.1` only and the
database is a single SQLite file you own.

繁體中文說明：**[README.zh-TW.md](README.zh-TW.md)**（更完整，包含設計理由與維運細節）

---

## What's in it

| Page | What it does |
|---|---|
| **Overview** | Today's classes, next 7 days, active milestones, today's hours, lab check-in |
| **Schedule** | Assignments, exams, talks, weekly reports, meetings — board and calendar views, weekly/biweekly repeats |
| **Courses** | Course records and a weekly timetable; can spin up a matching research topic and link straight to it. Optional one-click sync with NTU COOL |
| **Lectures** | Lecture files from NTU COOL per course and module — preview, download into your vault, or skip |
| **Research** | Topics → milestone timeline, research log, linked papers and notes, cumulative hours; categorised as research / course / side project and filterable |
| **Notes** | Reads and writes your Obsidian vault directly — not a second copy; sidebar is a collapsible folder tree |
| **Papers** | Paper list, tags, linked research topics, local PDFs |
| **Reviews** | Literature reviews: papers side by side in a comparison matrix, plus the synthesis you write from it, exportable |
| **Time** | Timer sessions and lab check-in/out |
| **Stats** | Weekly/monthly hours, split by topic, daily heatmap, attendance streak |
| **Settings** | Vault path, hour targets, timer, backup |

A today's-todo list and a research timer live in the sidebar on every page.
**⌘K** searches everything; clear the input and it becomes a quick-add.

### Things worth knowing

- **The timer survives you forgetting it.** The page heartbeats "still open". If
  your Mac sleeps or the browser closes, the session is retroactively ended at
  the last confirmed heartbeat instead of counting the fifteen hours you were
  away. You get a report to confirm or correct when you come back.
- **Papers autofill from a DOI.** Paste a DOI, an arXiv id, or a whole BibTeX
  entry. PDFs you drag in are copied into a local library, so clearing your
  Downloads folder doesn't break the link.
- **The calendar subscribes to macOS Calendar.** One-way: changes here flow out,
  changes in Calendar don't come back.
- **Notes are just files in your vault.** Edit in the browser, see it in Obsidian
  immediately. If both sides changed, saving prompts you to pick — never a
  silent overwrite. Notes open in preview, and "複製全文" copies the whole
  Markdown source in one go.
- **A topic can follow a whole folder, not just single notes.** The folder is
  attached to the topic and resolved against the vault on every render, so a
  note dropped into `daily/` tomorrow shows up on its own — no re-importing.
  Picking a folder includes everything beneath it. "＋ 新增筆記" creates the
  file in the vault, links it, and opens it.
- **The research log is just notes.** "＋ 新增紀錄" creates
  `<topic folder>/<date> <title>.md` with `type` (experiment / meeting / idea)
  and `date` in the frontmatter, shows that path before saving, and opens it.
  The topic page lists title, date and a two-line preview; the note holds the
  rest. Any note attached to the topic with one of those types counts, including
  ones written in Obsidian. Older databases: run
  `node --experimental-strip-types scripts/migrate-logs-to-vault.mts` (dry run),
  then add `--apply`.
- **NTU COOL sync is one button.** Read-only, using your browser's session
  cookie (see *Optional setup*). It pulls assignments into the schedule (tagged
  「COOL 作業」, marked done once submitted, due dates kept current; a manual
  item with the same title is adopted rather than duplicated), new
  announcements, and the files in each course's modules. You pick which files
  to download into `<vault>/<course>/Lectures/`; the rest can be previewed
  straight from COOL or skipped.
- **PDFs open in a built-in viewer** (PDF.js), so they display even in browsers
  without a PDF plugin. Downloaded files can also be opened in Preview or shown
  in Finder.
- **Courses can own a research topic.** Adding a course creates a same-named
  topic by default (categorised as a course topic), reachable from the course
  card or straight from the timetable block. It's a real foreign key, so
  renaming either side keeps the link.

---

## Requirements

- **Node.js 22 or newer** — the backup scripts use `--experimental-strip-types`
- **macOS** for the optional auto-start and scheduled backup (two LaunchAgents).
  Everything else runs anywhere Node runs.

## Install

```bash
git clone https://github.com/hacheng0193/acadesk.git
cd acadesk
npm install
npm run build
```

Then either run it by hand:

```bash
npm start          # http://localhost:3000 (this machine only)
```

…or, on macOS, have it start at login and back itself up daily:

```bash
npm run autostart:install
```

That writes two LaunchAgents (`com.acadesk.server`, `com.acadesk.backup`) using
the project's current path. Moved the folder? Re-run the same command. To stop
it entirely: `npm run autostart:uninstall`.

The database is created on first launch at `data/acadesk.db` — no migration step,
no seed data. You start with an empty system.

## Optional setup

**Obsidian** — put your vault's absolute path in Settings, or set
`OBSIDIAN_VAULT` in `.env.local` (see [.env.example](.env.example)). Without it,
the Notes page just tells you it isn't configured; nothing else is affected.

**Off-machine backup** — local snapshots always run. To also push to GitHub,
create your own **private** repo and wire it up yourself:

```bash
cd backups/export
git init && git remote add origin <your-private-repo>
```

The app never creates repos or touches your credentials. Research topics each
have a backup toggle; topics switched off stay in local snapshots but are
excluded from the export. Research log entries are vault notes, so they are
never part of the export. Note that **git history cannot be
un-pushed** — turning a toggle off later only keeps the item out of *future*
commits. Paper PDFs are never uploaded.

**NTU COOL** — log in to `cool.ntu.edu.tw` in your browser, open DevTools →
Network, click any request to `cool.ntu.edu.tw`, and copy the whole `Cookie`
request header into `.env.local`:

```bash
COOL_COOKIE=_normandy_session=...; log_session_id=...
```

Restart the server, then press 「同步 NTU COOL」 on the Courses page. Courses
are matched to COOL by course code, then by name; fix any match in the course's
edit form (or set it to 不同步). Downloading lecture files needs the Obsidian
vault configured. The session expires when you log out of COOL or after a while
— the sync then says so, and you paste a fresh cookie. Only `GET` requests are
ever sent, and the cookie never leaves this machine except to COOL itself.
COOL runs on Canvas LMS, so `COOL_BASE_URL` can point at another school's
Canvas instance; only NTU COOL has been tried.

## Where your data lives

| | |
|---|---|
| `data/acadesk.db` | Everything you enter. Gitignored. |
| `data/papers/` | PDFs you attached. Gitignored. |
| `backups/snapshots/` | Restore-grade `.db` copies, newest per day, 14 days. Gitignored. |
| `backups/export/` | JSON export for the optional GitHub push. Gitignored. |
| your Obsidian vault | Notes, and lecture files downloaded from COOL (`<course>/Lectures/`). Untouched by this repo's backups — use your own. |
| `.env.local` | Optional settings, including your COOL cookie. Gitignored. |

A fresh clone contains **none** of the above.

## Limits, honestly

- **Single user, no authentication.** It assumes it's your machine, so the
  server listens on `127.0.0.1` only: phones and other computers can't reach it.
  Don't put it behind a proxy or tunnel — with a COOL cookie configured, anyone
  who can reach it can read your COOL courses.
- **Outbound requests** go to two places only: the paper metadata lookup
  (Crossref / arXiv), which sends nothing but the identifier you typed, and
  NTU COOL, only if you set `COOL_COOKIE`. BibTeX is parsed locally.
- **Some buttons are macOS-only**: 「Finder」, 「預覽程式」 and opening local
  `file://` links use the `open` command. The rest works anywhere.
- **The timetable importer targets NTU's course site** (`course.ntu.edu.tw`)
  paste format. Other schools won't match — enter courses manually; nothing else
  depends on it.
- **The UI is in Traditional Chinese.** The code and comments are in English.

## Tech

Next.js 15 (App Router, server actions) + SQLite via `better-sqlite3`.
Schema in [db/schema.sql](db/schema.sql); columns added to existing databases go
through the idempotent `ADDED_COLUMNS` migration in [lib/db.ts](lib/db.ts). The
schema is applied once per connection, so **schema changes need a server restart**,
not just a hot reload.

Operational detail lives in [scripts/launchd.md](scripts/launchd.md).

## License

MIT — see [LICENSE](LICENSE).
