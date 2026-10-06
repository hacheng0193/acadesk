import fs from "node:fs";
import path from "node:path";
import { db, getSetting, setSetting } from "./db";
import { toLocalIso } from "./dates";
import type { Course } from "./types";
import { vaultRoot } from "./vault";

/**
 * Read-only NTU COOL (Canvas LMS) client and sync, ported from the course
 * dashboard's cool.py.
 *
 * Auth is the browser's session `Cookie` header, from COOL_COOKIE in .env.local.
 * A session cookie can do anything the account can, so this only ever issues GET
 * requests - nothing here writes to COOL.
 *
 * Sync writes:
 * - assignments rows, keyed by `cool_id`
 * - cool_files: files in each course's modules, so new ones can be offered for download
 * - cool_announcements
 */

const DONE_STATES = new Set(["submitted", "graded", "pending_review"]);

export class CoolError extends Error {}
export class CoolAuthError extends CoolError {}

export type Log = (msg: string) => void;

function baseUrl(): string {
  return (process.env.COOL_BASE_URL || "https://cool.ntu.edu.tw").replace(/\/+$/, "");
}

/** A header value must be a single line, however it was pasted. */
function oneLine(text: string): string {
  return text.replace(/[\r\n]/g, "").trim();
}

export function coolConfigured(): boolean {
  return !!oneLine(process.env.COOL_COOKIE ?? "");
}

function coolCookie(): string {
  const cookie = oneLine(process.env.COOL_COOKIE ?? "");
  if (!cookie) throw new CoolAuthError("找不到課程網認證：請在 .env.local 設定 COOL_COOKIE，並重啟服務");
  return cookie;
}

const EXPIRED =
  "課程網 cookie 被拒絕（登入 session 過期）：到瀏覽器重新登入 COOL，重新複製 Cookie 到 .env.local 的 COOL_COOKIE，再重啟服務";

export function nextLink(header: string | null): string | null {
  const m = header?.match(/<([^>]+)>;\s*rel="next"/);
  return m ? m[1] : null;
}

class CoolClient {
  private cookie = coolCookie();

  /**
   * GET, following redirects by hand: file downloads redirect to object storage
   * on another host, and the session cookie must not go along. A 401 or a bounce
   * to the login page means the session has expired.
   */
  async open(url: string, timeoutMs = 30_000): Promise<Response> {
    let current = url;
    const origin = new URL(url).host;
    for (let hops = 0; hops < 10; hops++) {
      const sameHost = new URL(current).host === origin;
      if (sameHost && new URL(current).pathname.startsWith("/login")) throw new CoolAuthError(EXPIRED);
      let res: Response;
      try {
        res = await fetch(current, {
          method: "GET",
          redirect: "manual",
          headers: { Accept: "application/json", ...(sameHost ? { Cookie: this.cookie } : {}) },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (e) {
        throw new CoolError(`連不上課程網：${(e as Error).message}`);
      }
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        current = new URL(res.headers.get("location")!, current).toString();
        continue;
      }
      if (res.status === 401) throw new CoolAuthError(EXPIRED);
      if (res.status === 403) {
        throw new CoolError(`沒有權限讀取 ${new URL(current).pathname}（學生帳號可能看不到這個資源）`);
      }
      if (!res.ok) throw new CoolError(`COOL HTTP ${res.status} for ${new URL(current).pathname}`);
      return res;
    }
    throw new CoolError("課程網轉址太多次");
  }

  /** GET a JSON endpoint, following Canvas `Link: rel="next"` pagination for lists. */
  async get<T = unknown>(apiPath: string, params: Record<string, string | number> = {}): Promise<T> {
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
    let url: string | null = `${baseUrl()}${apiPath}${qs ? `?${qs}` : ""}`;
    const pages: unknown[] = [];
    while (url) {
      const res = await this.open(url);
      const text = (await res.text()).replace(/^while\(1\);/, "");
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        // An expired session sometimes answers 200 with the HTML login page.
        throw new CoolAuthError(EXPIRED);
      }
      if (!Array.isArray(data)) return data as T;
      pages.push(...data);
      url = nextLink(res.headers.get("link"));
    }
    return pages as T;
  }

  /** Download to `dest.part`, then move it into place; never leaves a half file behind. */
  async download(url: string, dest: string): Promise<number> {
    const res = await this.open(url, 120_000);
    const tmp = `${dest}.part`;
    try {
      const data = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(tmp, data);
      fs.renameSync(tmp, dest);
      return data.length;
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }
}

/** Canvas UTC timestamp → local 'YYYY-MM-DDTHH:mm:ss' (the server runs in the user's timezone). */
function toLocal(iso: string | null | undefined): string | null {
  return iso ? toLocalIso(new Date(iso)) : null;
}

/** Loose comparison key for file names: case, spaces and punctuation don't matter. */
export function fileKey(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[\s_\-.()（）\[\]]+/g, "");
}

// ---------- courses ----------

export type CoolCourse = { id: number; name: string; course_code: string };

export async function listCoolCourses(): Promise<CoolCourse[]> {
  const courses = await new CoolClient().get<CoolCourse[]>("/api/v1/courses", {
    enrollment_state: "active",
    per_page: 100,
  });
  return courses.filter((c) => c && c.id && c.name);
}

let courseCache: { at: number; courses: CoolCourse[] } | null = null;

/**
 * COOL courses for the course form's picker, cached for ten minutes so the
 * courses page doesn't wait on COOL every render. Empty when COOL can't be reached.
 */
export async function coolCoursesForPicker(): Promise<CoolCourse[]> {
  if (!coolConfigured()) return [];
  if (courseCache && Date.now() - courseCache.at < 10 * 60_000) return courseCache.courses;
  try {
    courseCache = { at: Date.now(), courses: await listCoolCourses() };
    return courseCache.courses;
  } catch {
    return [];
  }
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

/** COOL course for a local one: by course code first, then by name. */
export function matchCourse(course: Course, cool: CoolCourse[]): CoolCourse | undefined {
  const code = norm(course.code);
  if (code) {
    const hit = cool.find((c) => norm(c.course_code).includes(code) || norm(c.name).includes(code));
    if (hit) return hit;
  }
  const name = norm(course.name);
  if (!name) return undefined;
  return cool.find((c) => norm(c.name).includes(name) || (norm(c.name).length >= 2 && name.includes(norm(c.name))));
}

// ---------- vault ----------

/** `<vault>/<course name>/Lectures`, refusing anything that escapes the vault. */
export function lecturesDir(course: Course): string {
  const root = vaultRoot();
  if (!root) throw new CoolError("尚未設定 Obsidian vault 路徑");
  const folder = course.name.replace(/[/\\:\0]/g, "-").trim() || `course-${course.id}`;
  const dir = path.resolve(root, folder, "Lectures");
  if (!dir.startsWith(root + path.sep)) throw new CoolError("路徑超出 vault 範圍");
  return dir;
}

/** Files already in the course's Lectures folder, by fileKey → vault-relative path. */
function vaultLectures(course: Course): Map<string, string> {
  const out = new Map<string, string>();
  try {
    const dir = lecturesDir(course);
    const root = vaultRoot()!;
    if (!fs.existsSync(dir)) return out;
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith(".") || name.endsWith(".part")) continue;
      out.set(fileKey(name), path.relative(root, path.join(dir, name)));
    }
  } catch {
    // No vault: nothing is in it.
  }
  return out;
}

// ---------- sync ----------

type CanvasModule = {
  name?: string;
  position?: number;
  items?: { type?: string; title: string; content_id?: number; position?: number; html_url?: string }[];
};

type CanvasAssignment = {
  id: number;
  name: string;
  due_at: string | null;
  html_url?: string;
  submission?: { workflow_state?: string } | null;
};

type CanvasAnnouncement = {
  id: number;
  title: string;
  message?: string;
  posted_at?: string | null;
  html_url?: string;
};

export type NewFile = {
  cool_file_id: number;
  course_id: number;
  course_name: string;
  title: string;
  module: string;
  html_url: string;
};

export type Announcement = {
  cool_id: number;
  course_id: number;
  course_name: string;
  title: string;
  posted_at: string | null;
  html_url: string;
};

export type SyncSummary = {
  added: number;
  adopted: number;
  done: number;
  updated: number;
  newFiles: number;
  newAnnouncements: number;
  matched: string[];
  errors: Record<string, string>;
  /** "課名：標題" of what is worth a notification: new open assignments and new announcements. */
  fresh?: { assignments: string[]; announcements: string[] };
};

export type CoolRun = {
  started: string;
  finished: string | null;
  status: "done" | "failed";
  lines: { t: string; msg: string }[];
  summary: SyncSummary | null;
  error: string | null;
  /** Started by the hourly auto-sync rather than the button. */
  auto?: boolean;
};

/** Files in the course's modules, in module order (same as cool.py's module_files). */
async function moduleFiles(client: CoolClient, cid: number) {
  const modules = await client.get<CanvasModule[]>(`/api/v1/courses/${cid}/modules`, {
    "include[]": "items",
    per_page: 100,
  });
  const out: { title: string; fileId: number; module: string; htmlUrl: string }[] = [];
  for (const m of [...modules].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))) {
    for (const item of [...(m.items ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))) {
      if (item.type === "File" && item.content_id) {
        out.push({ title: item.title, fileId: item.content_id, module: m.name ?? "", htmlUrl: item.html_url ?? "" });
      }
    }
  }
  return out;
}

async function syncFiles(client: CoolClient, course: Course, cid: number, log: Log): Promise<number> {
  const files = await moduleFiles(client, cid);
  const inVault = vaultLectures(course);
  const known = db.prepare("SELECT status, local_path FROM cool_files WHERE cool_file_id = ?");
  const insert = db.prepare(
    `INSERT INTO cool_files (cool_file_id, course_id, title, module, html_url, position, status, local_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  // Teachers move files between modules and rename them; keep the listing current.
  const refresh = db.prepare(
    "UPDATE cool_files SET title = ?, module = ?, html_url = ?, position = ? WHERE cool_file_id = ?",
  );
  const setPath = db.prepare("UPDATE cool_files SET local_path = ? WHERE cool_file_id = ?");
  let added = 0;
  files.forEach((f, position) => {
    const vaultPath = inVault.get(fileKey(f.title)) ?? "";
    const row = known.get(f.fileId) as { status: string; local_path: string } | undefined;
    if (row) {
      refresh.run(f.title, f.module, f.htmlUrl, position, f.fileId);
      if (row.status === "downloaded" && !row.local_path && vaultPath) setPath.run(vaultPath, f.fileId);
      return;
    }
    // Already in the vault (downloaded by hand, or by the old dashboard): not new.
    const status = vaultPath ? "downloaded" : "new";
    insert.run(f.fileId, course.id, f.title, f.module, f.htmlUrl, position, status, vaultPath);
    if (status === "new") {
      added++;
      log(`[${course.name}]   新檔案：${f.title}（${f.module || "—"}）`);
    }
  });
  log(
    files.length
      ? `[${course.name}] 模組中的檔案 ${files.length} 個，新的 ${added} 個`
      : `[${course.name}] 沒有模組裡的檔案`,
  );
  return added;
}

async function syncAssignments(
  client: CoolClient,
  course: Course,
  cid: number,
  log: Log,
  counts: SyncSummary,
): Promise<void> {
  const items = await client.get<CanvasAssignment[]>(`/api/v1/courses/${cid}/assignments`, {
    "include[]": "submission",
    per_page: 100,
  });
  const submitted = (a: CanvasAssignment) => DONE_STATES.has(a.submission?.workflow_state ?? "");
  log(`[${course.name}] 作業 ${items.length} 份（已繳交／已評分 ${items.filter(submitted).length}）`);

  const now = toLocalIso(new Date());
  const byCoolId = db.prepare("SELECT id, title, due_at, status FROM assignments WHERE cool_id = ?");
  const byTitle = db.prepare(
    "SELECT id, title, due_at, status FROM assignments WHERE cool_id IS NULL AND course_id = ? AND title = ?",
  );
  type Row = { id: number; title: string; due_at: string | null; status: string };

  for (const a of items) {
    const coolId = `a:${a.id}`;
    const title = a.name.trim();
    const due = toLocal(a.due_at);
    const isDone = submitted(a);

    let row = byCoolId.get(coolId) as Row | undefined;
    if (!row) {
      const adopt = byTitle.get(course.id, title) as Row | undefined;
      if (adopt) {
        db.prepare("UPDATE assignments SET cool_id = ? WHERE id = ?").run(coolId, adopt.id);
        counts.adopted++;
        log(`[${course.name}] 作業改由課程網管理：${title}`);
        row = adopt;
      }
    }

    if (!row) {
      const pastDue = !!due && due < now;
      const status = isDone || pastDue ? "done" : "todo";
      db.prepare(
        `INSERT INTO assignments (course_id, title, notes_md, due_at, status, kind, cool_id, completed_at)
         VALUES (?, ?, ?, ?, ?, 'assignment', ?, ?)`,
      ).run(
        course.id,
        title,
        a.html_url ? `[在 COOL 開啟](${a.html_url})` : "",
        due,
        status,
        coolId,
        status === "done" ? now : null,
      );
      counts.added++;
      if (status === "todo") counts.fresh?.assignments.push(`${course.name}：${title}`);
      const reason = isDone ? "，已繳交 → 標成完成" : pastDue ? "，已過期自動標完成" : "";
      log(`[${course.name}] 作業新增：${title}（截止 ${due?.slice(0, 16).replace("T", " ") ?? "無"}${reason}）`);
      continue;
    }

    const changes: string[] = [];
    if (row.title !== title) changes.push(`標題 ${row.title} → ${title}`);
    if ((row.due_at ?? null) !== due) {
      changes.push(`截止 ${row.due_at?.slice(0, 16).replace("T", " ") ?? "—"} → ${due?.slice(0, 16).replace("T", " ") ?? "—"}`);
    }
    if (changes.length) {
      db.prepare("UPDATE assignments SET title = ?, due_at = ? WHERE id = ?").run(title, due, row.id);
      counts.updated++;
      log(`[${course.name}] 作業更新：${title}：${changes.join("、")}`);
    }
    // Only ever towards done: a status the user set by hand is never undone.
    if (isDone && row.status !== "done") {
      db.prepare("UPDATE assignments SET status = 'done', completed_at = COALESCE(completed_at, ?) WHERE id = ?").run(
        now,
        row.id,
      );
      counts.done++;
      log(`[${course.name}] 作業已繳交 → 標成完成：${title}`);
    }
  }
}

async function syncAnnouncements(
  client: CoolClient,
  course: Course,
  cid: number,
  log: Log,
  fresh: string[],
): Promise<number> {
  const items = await client.get<CanvasAnnouncement[]>(`/api/v1/courses/${cid}/discussion_topics`, {
    only_announcements: "true",
    per_page: 50,
  });
  const insert = db.prepare(
    `INSERT OR IGNORE INTO cool_announcements (cool_id, course_id, title, message_html, posted_at, html_url, read)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  // Anything older than two weeks counts as already read, so the first sync of
  // a course doesn't bury the panel under the whole semester's announcements.
  const cutoff = toLocalIso(new Date(Date.now() - 14 * 86_400_000));
  let added = 0;
  for (const a of items) {
    const posted = toLocal(a.posted_at);
    const old = !!posted && posted < cutoff ? 1 : 0;
    const r = insert.run(a.id, course.id, a.title, a.message ?? "", posted, a.html_url ?? "", old);
    if (r.changes && !old) {
      added++;
      fresh.push(`${course.name}：${a.title}`);
      log(`[${course.name}]   新公告：${a.title}`);
    }
  }
  return added;
}

let running = false;

export function syncRunning(): boolean {
  return running;
}

/** One sync at a time; every step is written to the run's log as it happens. */
export async function syncCool({ auto = false }: { auto?: boolean } = {}): Promise<CoolRun> {
  const run: CoolRun = {
    started: toLocalIso(new Date()),
    finished: null,
    status: "done",
    lines: [],
    summary: null,
    error: null,
    auto,
  };
  const log: Log = (msg) => run.lines.push({ t: toLocalIso(new Date()).slice(11), msg });

  if (running) {
    run.status = "failed";
    run.error = "已經有一個同步在執行";
    run.finished = run.started;
    return run;
  }
  running = true;
  const summary: SyncSummary = {
    added: 0,
    adopted: 0,
    done: 0,
    updated: 0,
    newFiles: 0,
    newAnnouncements: 0,
    matched: [],
    errors: {},
    fresh: { assignments: [], announcements: [] },
  };
  try {
    const client = new CoolClient();
    log("開始同步：讀取 COOL 課程清單");

    const unmatched = db
      .prepare("SELECT * FROM courses WHERE archived = 0 AND cool_course_id IS NULL")
      .all() as Course[];
    if (unmatched.length) {
      const cool = await listCoolCourses();
      for (const course of unmatched) {
        const hit = matchCourse(course, cool);
        if (!hit) {
          log(`[${course.name}] 找不到對應的 COOL 課程（可在課程編輯裡手動指定）`);
          continue;
        }
        db.prepare("UPDATE courses SET cool_course_id = ? WHERE id = ?").run(hit.id, course.id);
        summary.matched.push(course.name);
        log(`[${course.name}] 自動對應到 COOL：${hit.name}`);
      }
    }

    const courses = db
      .prepare("SELECT * FROM courses WHERE archived = 0 AND cool_course_id > 0 ORDER BY name")
      .all() as Course[];
    if (!courses.length) log("沒有任何課程對應到 COOL");

    for (const course of courses) {
      const cid = course.cool_course_id!;
      // Each part separately: a course whose modules are hidden can still sync its assignments.
      const steps: [string, () => Promise<void>][] = [
        ["講義列表", async () => void (summary.newFiles += await syncFiles(client, course, cid, log))],
        ["作業", () => syncAssignments(client, course, cid, log, summary)],
        ["公告", async () => void (summary.newAnnouncements += await syncAnnouncements(client, course, cid, log, summary.fresh!.announcements))],
      ];
      for (const [label, step] of steps) {
        try {
          await step();
        } catch (e) {
          if (e instanceof CoolAuthError) throw e;
          const msg = `${label}：${(e as Error).message}`;
          summary.errors[course.name] = summary.errors[course.name] ? `${summary.errors[course.name]}；${msg}` : msg;
          log(`[${course.name}] ✗ 讀取${msg}`);
        }
      }
    }

    const failed = Object.keys(summary.errors).length;
    log(
      `完成：作業新增 ${summary.added}、接管 ${summary.adopted}、標完成 ${summary.done}、更新 ${summary.updated}；` +
        `新講義 ${summary.newFiles} 個；新公告 ${summary.newAnnouncements} 則` +
        (failed ? `；${failed} 門課有錯誤` : ""),
    );
    run.summary = summary;
    run.status = courses.length && failed === courses.length ? "failed" : "done";
  } catch (e) {
    run.error = (e as Error).message;
    run.status = "failed";
    log(`✗ 同步失敗：${run.error}`);
  } finally {
    running = false;
    run.finished = toLocalIso(new Date());
    setSetting("cool_last_run", JSON.stringify(run));
  }
  return run;
}

export function lastRun(): CoolRun | null {
  try {
    return JSON.parse(getSetting("cool_last_run") ?? "null") as CoolRun | null;
  } catch {
    return null;
  }
}

// ---------- pending items ----------

export function pendingFiles(): NewFile[] {
  return db
    .prepare(
      `SELECT f.cool_file_id, f.course_id, c.name AS course_name, f.title, f.module, f.html_url
       FROM cool_files f JOIN courses c ON c.id = f.course_id
       WHERE f.status = 'new' ORDER BY c.name, f.first_seen_at, f.cool_file_id`,
    )
    .all() as NewFile[];
}

export function unreadAnnouncements(): Announcement[] {
  return db
    .prepare(
      `SELECT a.cool_id, a.course_id, c.name AS course_name, a.title, a.posted_at, a.html_url
       FROM cool_announcements a JOIN courses c ON c.id = a.course_id
       WHERE a.read = 0 ORDER BY a.posted_at DESC`,
    )
    .all() as Announcement[];
}

/** Download a file listed as new into `<vault>/<course>/Lectures/`. Returns the vault-relative path. */
export async function downloadCoolFile(fileId: number): Promise<string> {
  const row = db
    .prepare("SELECT f.*, c.id AS cid FROM cool_files f JOIN courses c ON c.id = f.course_id WHERE cool_file_id = ?")
    .get(fileId) as { course_id: number; title: string } | undefined;
  if (!row) throw new CoolError("這個檔案不在同步清單裡");
  const course = db.prepare("SELECT * FROM courses WHERE id = ?").get(row.course_id) as Course;

  const client = new CoolClient();
  const meta = await client.get<{ url?: string; display_name?: string }>(`/api/v1/files/${fileId}`);
  if (!meta.url) throw new CoolError("COOL 沒有提供下載連結（檔案可能被鎖住）");
  const name = path.basename(meta.display_name || row.title); // no path components from the server
  const dir = lecturesDir(course);
  const dest = path.resolve(dir, name);
  if (!dest.startsWith(dir + path.sep)) throw new CoolError("無效的檔名");
  if (fs.existsSync(dest)) throw new CoolError(`檔案已存在：${name}`);
  fs.mkdirSync(dir, { recursive: true });
  await client.download(meta.url, dest);

  const rel = path.relative(vaultRoot()!, dest);
  db.prepare("UPDATE cool_files SET status = 'downloaded', local_path = ? WHERE cool_file_id = ?").run(rel, fileId);
  return rel;
}

export type DownloadedFile = NewFile & { local_path: string };

/** Files already fetched into the vault, newest first per course. */
export function downloadedFiles(): DownloadedFile[] {
  return db
    .prepare(
      `SELECT f.cool_file_id, f.course_id, c.name AS course_name, f.title, f.module, f.html_url, f.local_path
       FROM cool_files f JOIN courses c ON c.id = f.course_id
       WHERE f.status = 'downloaded' AND f.local_path != ''
       ORDER BY c.name, f.first_seen_at DESC, f.cool_file_id DESC`,
    )
    .all() as DownloadedFile[];
}

const CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".txt": "text/plain; charset=utf-8",
  ".mp4": "video/mp4",
};

/**
 * A COOL file's bytes for previewing in the browser: the vault copy when it has
 * been downloaded, otherwise streamed straight from COOL without saving it.
 */
export async function openCoolFile(
  fileId: number,
): Promise<{ name: string; type: string; inline: boolean; size: number | null; body: ReadableStream | Buffer }> {
  const row = db
    .prepare("SELECT title, local_path FROM cool_files WHERE cool_file_id = ?")
    .get(fileId) as { title: string; local_path: string } | undefined;
  if (!row) throw new CoolError("這個檔案不在同步清單裡");

  const typeOf = (name: string) => CONTENT_TYPES[path.extname(name).toLowerCase()];
  const root = vaultRoot();
  if (row.local_path && root) {
    const abs = path.resolve(root, row.local_path);
    if (abs.startsWith(root + path.sep) && fs.existsSync(abs)) {
      const name = path.basename(abs);
      const type = typeOf(name);
      return { name, type: type ?? "application/octet-stream", inline: !!type, size: fs.statSync(abs).size, body: fs.readFileSync(abs) };
    }
  }

  const client = new CoolClient();
  const meta = await client.get<{ url?: string; display_name?: string; size?: number }>(`/api/v1/files/${fileId}`);
  if (!meta.url) throw new CoolError("COOL 沒有提供下載連結（檔案可能被鎖住）");
  const res = await client.open(meta.url, 120_000);
  const name = path.basename(meta.display_name || row.title);
  const type = typeOf(name);
  return {
    name,
    type: type ?? "application/octet-stream",
    inline: !!type,
    size: Number(res.headers.get("content-length")) || null,
    body: res.body!,
  };
}

export type LectureFile = {
  cool_file_id: number;
  course_id: number;
  title: string;
  module: string;
  html_url: string;
  status: "new" | "downloaded" | "ignored";
  local_path: string;
};

export type LectureCourse = { id: number; name: string; color: string; project_id: number | null };

/** Every COOL file the sync has seen, per course, in COOL's module order. */
export function lectureFiles(): { courses: LectureCourse[]; files: LectureFile[] } {
  const courses = db
    .prepare(
      `SELECT id, name, color, project_id FROM courses
       WHERE archived = 0 AND (cool_course_id > 0 OR id IN (SELECT course_id FROM cool_files))
       ORDER BY name`,
    )
    .all() as LectureCourse[];
  const files = db
    .prepare(
      `SELECT cool_file_id, course_id, title, module, html_url, status, local_path
       FROM cool_files ORDER BY course_id, position, cool_file_id`,
    )
    .all() as LectureFile[];
  return { courses, files };
}

/** Absolute vault path of a downloaded file, or null when it is gone. */
export function localCoolFile(fileId: number): string | null {
  const row = db.prepare("SELECT local_path FROM cool_files WHERE cool_file_id = ?").get(fileId) as
    | { local_path: string }
    | undefined;
  const root = vaultRoot();
  if (!row?.local_path || !root) return null;
  const abs = path.resolve(root, row.local_path);
  return abs.startsWith(root + path.sep) && fs.existsSync(abs) ? abs : null;
}
