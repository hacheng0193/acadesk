"use server";

import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  coolConfigured,
  downloadCoolFile,
  downloadedFiles,
  lastRun,
  localCoolFile,
  pendingFiles,
  syncCool,
  unreadAnnouncements,
  type Announcement,
  type CoolRun,
  type DownloadedFile,
  type NewFile,
} from "@/lib/cool";
import { coolAutoSyncEnabled } from "@/lib/cool-auto";

export type CoolPanelState = {
  configured: boolean;
  files: NewFile[];
  downloaded: DownloadedFile[];
  announcements: Announcement[];
  lastRun: CoolRun | null;
  autoSync: boolean;
};

export async function coolPanelState(): Promise<CoolPanelState> {
  return {
    configured: coolConfigured(),
    files: pendingFiles(),
    downloaded: downloadedFiles(),
    announcements: unreadAnnouncements(),
    lastRun: lastRun(),
    autoSync: coolAutoSyncEnabled(),
  };
}

export async function runCoolSync(): Promise<CoolPanelState> {
  await syncCool();
  revalidatePath("/", "layout");
  return coolPanelState();
}

export type DownloadResult = { id: number; ok: boolean; message: string };

/** One at a time: COOL is slow and a failed file shouldn't stop the rest. */
export async function downloadCoolFiles(ids: number[]): Promise<DownloadResult[]> {
  const results: DownloadResult[] = [];
  for (const id of ids) {
    try {
      results.push({ id, ok: true, message: await downloadCoolFile(id) });
    } catch (e) {
      results.push({ id, ok: false, message: (e as Error).message });
    }
  }
  revalidatePath("/", "layout");
  return results;
}

export async function ignoreCoolFiles(ids: number[]) {
  const stmt = db.prepare("UPDATE cool_files SET status = 'ignored' WHERE cool_file_id = ? AND status = 'new'");
  for (const id of ids) stmt.run(id);
  revalidatePath("/lectures");
}

/** Put skipped files back on the "new" list. */
export async function unignoreCoolFiles(ids: number[]) {
  const stmt = db.prepare("UPDATE cool_files SET status = 'new' WHERE cool_file_id = ? AND status = 'ignored'");
  for (const id of ids) stmt.run(id);
  revalidatePath("/lectures");
}

const execFile = promisify(execFileCb);

/** Open a downloaded file in its default Mac app (Preview for PDFs). */
export async function openCoolFileInApp(id: number): Promise<{ ok: boolean; error?: string }> {
  const abs = localCoolFile(id);
  if (!abs) return { ok: false, error: "還沒下載，或檔案不在 vault 裡了" };
  try {
    await execFile("open", [abs]);
    return { ok: true };
  } catch {
    return { ok: false, error: "無法開啟檔案" };
  }
}

export async function revealCoolFile(id: number): Promise<{ ok: boolean; error?: string }> {
  const abs = localCoolFile(id);
  if (!abs) return { ok: false, error: "檔案不在 vault 裡了（可能被移動或刪除）" };
  try {
    await execFile("open", ["-R", abs]);
    return { ok: true };
  } catch {
    return { ok: false, error: "無法開啟 Finder" };
  }
}

export async function markAnnouncementsRead(ids: number[]) {
  const stmt = db.prepare("UPDATE cool_announcements SET read = 1 WHERE cool_id = ?");
  for (const id of ids) stmt.run(id);
}
