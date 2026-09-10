import { backupStatus } from "@/app/actions/backup";
import {
  BackupPanel,
  GoalForm,
  SearchIndexPanel,
  TimerForm,
  VaultForm,
} from "@/components/SettingsForms";
import { Card, PageHeader, SectionTitle } from "@/components/ui";
import { getSetting } from "@/lib/db";
import { HEARTBEAT_MINUTES, idleMinutes, maxSessionHours } from "@/lib/idle";
import { weeklyGoal } from "@/lib/queries/time";
import { listNotes, vaultRoot } from "@/lib/vault";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const configured = getSetting("vault_path") ?? "";
  const root = vaultRoot();
  const envOverride = !!process.env.OBSIDIAN_VAULT;
  const backup = await backupStatus();

  return (
    <>
      <PageHeader title="設定" />

      <div className="space-y-6">
        <Card className="p-4">
          <SectionTitle
            title="Obsidian 整合"
            hint={
              root
                ? `目前使用：${root}${envOverride ? "（來自 OBSIDIAN_VAULT 環境變數）" : ""}`
                : "尚未設定，「筆記」頁會是空的"
            }
          />
          <VaultForm current={configured} noteCount={root ? listNotes().length : null} />
          <p className="mt-3 border-t border-line pt-3 text-xs text-dim">
            筆記直接讀寫 vault 裡的 .md 檔，Obsidian 那邊會立即看到。存檔前會比對檔案修改時間，
            若你同時在 Obsidian 改過同一篇，會跳出提示讓你選擇保留哪一份，不會靜默覆蓋。
          </p>
        </Card>

        <Card className="p-4">
          <SectionTitle title="時數目標" hint="顯示在總覽與統計頁的進度條" />
          <GoalForm current={weeklyGoal()} />
        </Card>

        <Card className="p-4">
          <SectionTitle title="搜尋" hint="⌘K 可搜尋行程、研究日誌、筆記與文獻" />
          <SearchIndexPanel />
        </Card>

        <Card className="p-4">
          <SectionTitle title="計時器" hint="避免忘記停止而污染統計" />
          <TimerForm
            idleMinutes={idleMinutes()}
            maxHours={maxSessionHours()}
            heartbeatMinutes={HEARTBEAT_MINUTES}
          />
        </Card>

        <Card className="p-4">
          <SectionTitle title="備份" hint="每天凌晨 3 點自動執行" />
          <BackupPanel status={backup} />
          <div className="mt-3 space-y-1.5 border-t border-line pt-3 text-xs text-dim">
            <p>
              <strong className="text-ink">本機快照</strong>：
              <code className="rounded bg-surface-2 px-1 py-0.5 font-mono">backups/snapshots/</code>
              下的 .db 檔，保留最近 14 份，內容永遠完整。還原就是覆蓋回{" "}
              <code className="rounded bg-surface-2 px-1 py-0.5 font-mono">data/acadesk.db</code>（記得先停服務）。
            </p>
            <p>
              <strong className="text-ink">GitHub 異地備份</strong>：
              <code className="rounded bg-surface-2 px-1 py-0.5 font-mono">backups/export/</code>
              裡的 JSON，內容沒變就不會產生 commit。論文 PDF 不會上傳。
            </p>
            <p>
              從 GitHub 還原得到的是<strong className="text-ink">不含被排除項目</strong>的部分資料，
              完整還原要用本機快照。
            </p>
            <p>筆記本身在 Obsidian vault 裡，沿用你既有的備份方式即可。</p>
          </div>
        </Card>
      </div>
    </>
  );
}
