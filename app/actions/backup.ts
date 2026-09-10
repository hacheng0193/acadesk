"use server";

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { revalidatePath } from "next/cache";
import { getSetting } from "@/lib/db";

const run = promisify(exec);

export type BackupStatus = {
  lastAt: string | null;
  lastError: string;
  omitted: number;
  gitStatus: string;
};

export async function backupStatus(): Promise<BackupStatus> {
  return {
    lastAt: getSetting("last_backup_at"),
    lastError: getSetting("last_backup_error") ?? "",
    omitted: Number(getSetting("last_backup_omitted") ?? "0"),
    gitStatus: getSetting("git_backup_status") ?? "未設定",
  };
}

/** Run the same script the daily agent runs, so "立即備份" can't drift from it. */
export async function runBackupNow(): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout } = await run("sh scripts/backup-run.sh", {
      cwd: process.cwd(),
      timeout: 120_000,
    });
    revalidatePath("/settings");
    return { ok: true, output: stdout.trim().split("\n").slice(-3).join("\n") };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    revalidatePath("/settings");
    return {
      ok: false,
      output: (err.stdout || err.stderr || err.message || "備份失敗").trim().split("\n").slice(-3).join("\n"),
    };
  }
}
