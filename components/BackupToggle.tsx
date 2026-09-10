"use client";

import { useState, useTransition } from "react";
import { setBackupEnabled } from "@/app/actions/research";
import { Button, cx } from "./ui";
import { Modal } from "./ui/Modal";

/**
 * Per-record switch for "may this leave the machine".
 *
 * Turning it ON is the irreversible direction - content starts being pushed to
 * GitHub, and anything already pushed stays in git history forever - so that
 * direction asks for confirmation. Turning it OFF is safe and immediate.
 */
export function BackupToggle({
  kind,
  id,
  enabled,
  label,
  inheritedOff,
}: {
  kind: "project" | "log";
  id: number;
  enabled: boolean;
  label: string;
  /** Log under an excluded project: forced off, not overridable here. */
  inheritedOff?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  if (inheritedOff) {
    return (
      <span
        className="shrink-0 text-[11px] text-[var(--warn)]"
        title="所屬研究主題已關閉備份，底下的紀錄一律排除"
      >
        ⊘ 隨主題排除
      </span>
    );
  }

  const apply = (next: boolean) => startTransition(() => void setBackupEnabled(kind, id, next));

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => (enabled ? apply(false) : setConfirming(true))}
        title={enabled ? "目前會上傳到 GitHub 備份，點擊排除" : "目前不會上傳，點擊加入備份"}
        className={cx(
          "shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] leading-4 transition-colors",
          enabled
            ? "border-line text-dim hover:text-ink"
            : "border-transparent bg-warn-soft text-[var(--warn)]",
        )}
      >
        {enabled ? "☁ 備份中" : "⊘ 不備份"}
      </button>

      <Modal
        title="要開始上傳這筆內容嗎？"
        open={confirming}
        onClose={() => setConfirming(false)}
        width="max-w-md"
      >
        {(close) => (
          <div className="space-y-3 text-sm">
            <p>
              「<strong>{label}</strong>」將從下次備份起上傳到你的 GitHub private repo。
            </p>
            <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs leading-relaxed text-[var(--warn)]">
              <strong>git 歷史無法撤回。</strong>
              日後再關掉，只會讓它不再出現在新的 commit，
              <strong>已經上傳過的內容仍留在 repo 歷史裡</strong>。有疑慮的話就維持關閉。
            </p>
            <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
              <Button type="button" variant="ghost" onClick={close}>
                取消
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={pending}
                onClick={() => {
                  apply(true);
                  close();
                }}
              >
                確定，開始備份
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
