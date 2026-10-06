import { execFile } from "node:child_process";
import { db } from "./db";
import { toLocalIso } from "./dates";
import { coolConfigured, lastRun, syncCool, type CoolRun } from "./cool";

/**
 * Hourly NTU COOL sync during the day, run inside the server process so it
 * works whether or not a browser tab is open.
 *
 * Every few minutes: between 08:00 and 18:00, if the last sync (by hand or
 * automatic) started more than an hour ago, sync again and post a macOS
 * notification when new assignments or announcements turned up. A sleeping Mac
 * simply misses ticks; the first tick after waking catches up.
 *
 * Set COOL_AUTO_SYNC=0 in .env.local to turn it off.
 */

const TICK_MS = 5 * 60_000;
const FIRST_TICK_MS = 60_000;
const INTERVAL_MS = 60 * 60_000;
const START_HOUR = 8;
const END_HOUR = 18;

export function coolAutoSyncEnabled(): boolean {
  return process.env.COOL_AUTO_SYNC !== "0" && coolConfigured();
}

function inWindow(d: Date): boolean {
  const h = d.getHours();
  return h >= START_HOUR && h < END_HOUR;
}

/**
 * `npm run dev` and the login agent can run at the same time against the same
 * database; this upsert only succeeds for whichever process gets there first.
 */
function claim(now: Date): boolean {
  const r = db
    .prepare(
      `INSERT INTO settings (key, value) VALUES ('cool_auto_claim', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE settings.value < ?`,
    )
    .run(toLocalIso(now), toLocalIso(new Date(now.getTime() - INTERVAL_MS + TICK_MS)));
  return r.changes > 0;
}

async function tick() {
  const now = new Date();
  if (!coolAutoSyncEnabled() || !inWindow(now)) return;
  const prev = lastRun();
  if (prev && now.getTime() - new Date(prev.started).getTime() < INTERVAL_MS) return;
  if (!claim(now)) return;

  const run = await syncCool({ auto: true });
  notifyAbout(run, prev);
}

function notifyAbout(run: CoolRun, prev: CoolRun | null) {
  if (run.error) {
    // Only an expired cookie needs the user (a network blip after waking doesn't),
    // and it fails every hour until replaced: say so once.
    if (/cookie/i.test(run.error) && prev?.error !== run.error) notify("NTU COOL 自動同步失敗", run.error);
    return;
  }
  const fresh = run.summary?.fresh;
  if (!fresh) return;
  const { assignments, announcements } = fresh;
  if (!assignments.length && !announcements.length) return;

  const counts = [
    assignments.length ? `${assignments.length} 份新作業` : "",
    announcements.length ? `${announcements.length} 則新公告` : "",
  ].filter(Boolean);
  const lines = [...assignments.map((t) => `作業｜${t}`), ...announcements.map((t) => `公告｜${t}`)];
  const body = lines.length > 3 ? [...lines.slice(0, 3), `…還有 ${lines.length - 3} 項`].join("\n") : lines.join("\n");
  notify(`NTU COOL：${counts.join("、")}`, body);
}

/** Text goes in as argv, never spliced into the script, so titles can't break out of the string. */
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
      if (err) console.error("[cool-auto] notification failed:", err.message);
    },
  );
}

const g = globalThis as { __coolAutoSync?: boolean };

export function startCoolAutoSync() {
  if (g.__coolAutoSync) return;
  g.__coolAutoSync = true;

  const safeTick = () =>
    tick().catch((e) => console.error("[cool-auto] tick failed:", (e as Error).message));
  // unref: never the reason a process stays alive.
  setTimeout(safeTick, FIRST_TICK_MS).unref();
  setInterval(safeTick, TICK_MS).unref();
}
