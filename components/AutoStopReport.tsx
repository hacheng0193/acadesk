"use client";

import { useState, useTransition } from "react";
import { resolveAutoStop } from "@/app/actions/time";
import { formatHours } from "@/lib/dates";
import type { PendingReview } from "@/lib/idle";
import { Button, cx, inputClass } from "./ui";
import { Modal } from "./ui/Modal";

/**
 * Shown when the user comes back to find a timer was closed on their behalf.
 * The recorded time is a guess made from the last heartbeat, so it is offered
 * for confirmation rather than written silently.
 */
export function AutoStopReport({ review }: { review: PendingReview }) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [endValue, setEndValue] = useState(review.ended_at.slice(0, 16));
  const [open, setOpen] = useState(true);

  const hours =
    (new Date(review.ended_at).getTime() - new Date(review.started_at).getTime()) / 3_600_000;

  const act = (choice: Parameters<typeof resolveAutoStop>[1]) =>
    startTransition(async () => {
      await resolveAutoStop(review.id, choice);
      setOpen(false);
    });

  return (
    <Modal title="計時器自動停止了" open={open} onClose={() => setOpen(false)} width="max-w-md">
      {() => (
        <div className="space-y-3 text-sm">
          <p className="text-dim">
            偵測到你離開了，所以沒有繼續累積時間。計時停在
            <strong className="text-ink">最後一次確認你還在</strong>的時刻。
          </p>
          <div className="rounded-lg border border-line bg-surface-2 px-3 py-2">
            <div className="text-xs text-dim">{review.label}</div>
            <div className="mt-0.5 tabular-nums">
              {review.started_at.slice(0, 16).replace("T", " ")} —{" "}
              {review.ended_at.slice(11, 16)}
            </div>
            <div className="mt-0.5 text-xs text-dim">記錄 {formatHours(hours)}</div>
          </div>

          {editing ? (
            <div className="space-y-2">
              <label className="block text-xs text-dim">實際的結束時間</label>
              <input
                type="datetime-local"
                value={endValue}
                onChange={(e) => setEndValue(e.target.value)}
                className={cx(inputClass, "w-full")}
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEditing(false)}>
                  返回
                </Button>
                <Button
                  variant="primary"
                  disabled={pending}
                  onClick={() => act({ action: "adjust", endedAt: `${endValue}:00` })}
                >
                  儲存這個時間
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
              <Button
                variant="ghost"
                className="mr-auto text-danger"
                disabled={pending}
                onClick={() => act({ action: "discard" })}
              >
                捨棄這段
              </Button>
              <Button variant="outline" onClick={() => setEditing(true)}>
                改時間
              </Button>
              <Button variant="primary" disabled={pending} onClick={() => act({ action: "accept" })}>
                接受
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
