"use client";

import { useState, useTransition } from "react";
import { runBackupNow, type BackupStatus } from "@/app/actions/backup";
import { rebuildSearchIndex } from "@/app/actions/search";
import { setVaultPath } from "@/app/actions/notes";
import { setTimerSettings, setWeeklyGoal } from "@/app/actions/time";
import { Button, Field, cx, inputClass } from "./ui";

export function VaultForm({ current, noteCount }: { current: string; noteCount: number | null }) {
  return (
    <form action={setVaultPath} className="space-y-3">
      <Field
        label="Obsidian vault 路徑"
        hint="vault 資料夾的絕對路徑，例如 /Users/you/Documents/MyVault。可用 ~ 開頭。"
      >
        <input
          name="vault_path"
          defaultValue={current}
          className={inputClass}
          placeholder="/Users/you/Documents/MyVault"
        />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" size="sm">
          儲存並重新掃描
        </Button>
        <span className="text-xs text-dim">
          {noteCount === null
            ? "路徑無效或尚未設定"
            : `已索引 ${noteCount} 篇筆記`}
        </span>
      </div>
    </form>
  );
}

export function GoalForm({ current }: { current: number | null }) {
  const [value, setValue] = useState(current?.toString() ?? "");
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-3">
      <Field label="每週研究時數目標" hint="留空或填 0 表示不設目標">
        <input
          type="number"
          step="0.5"
          min="0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={inputClass}
          placeholder="例如 30"
        />
      </Field>
      <Button
        variant="primary"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(() => void setWeeklyGoal(value.trim() ? Number(value) : null))
        }
      >
        儲存目標
      </Button>
    </div>
  );
}

export function BackupPanel({ status }: { status: BackupStatus }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; output: string } | null>(null);

  const failed = !!status.lastError;
  const pushFailed = status.gitStatus.startsWith("推送失敗");

  // A backup that quietly stopped running is the failure mode that actually
  // loses data, so surface the gap rather than just the last timestamp.
  const daysAgo = status.lastAt
    ? Math.floor((Date.now() - new Date(status.lastAt).getTime()) / 86_400_000)
    : null;
  const stale = daysAgo === null || daysAgo >= 3;

  return (
    <div className="space-y-3">
      <div className="grid gap-2 text-xs sm:grid-cols-2">
        <div
          className={cx(
            "rounded-lg border px-3 py-2",
            stale ? "border-[var(--warn)] bg-warn-soft" : "border-line bg-surface-2",
          )}
        >
          <div className={cx(stale ? "text-[var(--warn)]" : "text-dim")}>上次備份</div>
          <div className={cx("mt-0.5 text-sm", stale ? "text-[var(--warn)]" : "text-ink")}>
            {status.lastAt ? status.lastAt.replace("T", " ") : "從未執行"}
          </div>
          {stale ? (
            <div className="mt-0.5 text-[11px] text-[var(--warn)]">
              已經 {daysAgo} 天沒備份了，按下面的按鈕跑一次
            </div>
          ) : null}
        </div>
        <div className="rounded-lg border border-line bg-surface-2 px-3 py-2">
          <div className="text-dim">GitHub 推送</div>
          <div className={cx("mt-0.5 text-sm", pushFailed ? "text-danger" : "text-ink")}>
            {status.gitStatus}
          </div>
        </div>
      </div>

      {failed ? (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
          上次備份失敗：{status.lastError}
        </p>
      ) : null}

      {status.omitted > 0 ? (
        <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-dim">
          目前有 <strong className="text-ink">{status.omitted}</strong> 筆研究主題／日誌被排除在
          GitHub 備份之外。它們仍完整保存在本機快照裡，只是不會上傳。
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setResult(null);
              setResult(await runBackupNow());
            })
          }
        >
          {pending ? "備份中…" : "立即備份"}
        </Button>
        {result ? (
          <span className={cx("text-xs", result.ok ? "text-dim" : "text-danger")}>
            {result.output}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function TimerForm({
  idleMinutes,
  maxHours,
  heartbeatMinutes,
}: {
  idleMinutes: number;
  maxHours: number;
  heartbeatMinutes: number;
}) {
  return (
    <form action={setTimerSettings} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="閒置多久算離開（分鐘）"
          hint={`不會低於 ${heartbeatMinutes + 5} 分——比心跳週期短會誤停使用中的計時`}
        >
          <input
            name="timer_idle_minutes"
            type="number"
            min="1"
            step="1"
            defaultValue={idleMinutes}
            className={inputClass}
          />
        </Field>
        <Field label="單次計時上限（小時）" hint="超過的部分不計入統計">
          <input
            name="timer_max_hours"
            type="number"
            min="1"
            step="0.5"
            defaultValue={maxHours}
            className={inputClass}
          />
        </Field>
      </div>
      <Button type="submit" variant="primary" size="sm">
        儲存
      </Button>
      <p className="border-t border-line pt-3 text-xs leading-relaxed text-dim">
        計時中，頁面每 {heartbeatMinutes} 分鐘回報一次「還開著」，切走或關閉時再補送一次精確時間。
        如果 Mac 睡著或瀏覽器關掉，下次開啟時會把計時
        <strong className="text-ink">回溯結束在最後一次回報的時刻</strong>，
        不會把離開的時間算進去。沒有計時在跑時完全不送任何請求。
      </p>
    </form>
  );
}


export function SearchIndexPanel() {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await rebuildSearchIndex();
            setDone(true);
          })
        }
      >
        {pending ? "重建中…" : "重建搜尋索引"}
      </Button>
      <span className="text-xs text-dim">
        {done ? "已重建" : "平常會自動維護，搜不到東西時才需要按"}
      </span>
    </div>
  );
}
