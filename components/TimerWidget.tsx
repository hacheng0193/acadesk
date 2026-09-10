"use client";

import { useEffect, useState, useTransition } from "react";
import { discardTimer, startTimer, stopTimer, stopTimerAt } from "@/app/actions/time";
import { formatDuration, toLocalIso } from "@/lib/dates";
import { colorOf } from "@/lib/types";
import { Button, cx } from "./ui";

export type TimerTarget = { key: string; label: string; color: string };

export function TimerWidget({
  running,
  targets,
  maxHours,
}: {
  running: { started_at: string; label: string; color: string } | null;
  targets: TimerTarget[];
  maxHours: number;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [pick, setPick] = useState(targets[0]?.key ?? "");
  const [pending, startTransition] = useTransition();

  // Tick locally; the authoritative start time comes from the database, so a
  // reload (or a different tab) always shows the same running total.
  //
  // The interval is torn down whenever the tab is hidden: nobody is looking at
  // the number, and a per-second timer is exactly the kind of thing that keeps
  // a laptop from idling. Coming back recomputes from the stored start time.
  useEffect(() => {
    if (!running) {
      setElapsed(0);
      return;
    }
    const compute = () => setElapsed((Date.now() - new Date(running.started_at).getTime()) / 1000);
    let id: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      compute();
      if (!id) id = setInterval(compute, 1000);
    };
    const stop = () => {
      if (id) clearInterval(id);
      id = null;
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    if (!document.hidden) start();
    else compute();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [running]);

  useEffect(() => {
    if (!pick && targets.length) setPick(targets[0].key);
  }, [targets, pick]);

  const run = (fn: () => Promise<unknown>) => startTransition(() => void fn());

  if (running) {
    return (
      <div className="rounded-xl border border-line bg-surface-2 p-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70"
              style={{ background: colorOf(running.color) }}
            />
            <span
              className="relative inline-flex h-2 w-2 rounded-full"
              style={{ background: colorOf(running.color) }}
            />
          </span>
          <span className="truncate text-xs font-medium text-dim">{running.label}</span>
        </div>
        <div className="mt-1.5 font-mono text-2xl tabular-nums tracking-tight text-ink">
          {formatDuration(elapsed)}
        </div>
        {elapsed >= maxHours * 3600 ? (
          <div className="mt-2 rounded-lg bg-warn-soft px-2 py-1.5 text-[11px] leading-snug text-[var(--warn)]">
            已經連續計時超過 {maxHours} 小時，統計只會採計到上限。忘了停的話：
            <button
              type="button"
              className="mt-1 block underline"
              disabled={pending}
              onClick={() =>
                run(() =>
                  stopTimerAt(
                    toLocalIso(new Date(new Date(running.started_at).getTime() + maxHours * 3_600_000)),
                  ),
                )
              }
            >
              停在 {maxHours} 小時的時間點
            </button>
          </div>
        ) : null}
        <div className="mt-2.5 flex gap-1.5">
          <Button
            variant="primary"
            size="sm"
            className="flex-1"
            disabled={pending}
            onClick={() => run(stopTimer)}
          >
            停止並記錄
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => {
              if (confirm("捨棄這段計時？不會留下紀錄。")) run(discardTimer);
            }}
          >
            捨棄
          </Button>
        </div>
      </div>
    );
  }

  const [kind, rawId] = pick.split(":");

  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3">
      <div className="text-xs font-medium text-dim">研究計時器</div>
      <select
        value={pick}
        onChange={(e) => setPick(e.target.value)}
        className="mt-2 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink"
      >
        <option value="">未分類</option>
        {targets.map((t) => (
          <option key={t.key} value={t.key}>
            {t.label}
          </option>
        ))}
      </select>
      <Button
        variant="primary"
        size="sm"
        className={cx("mt-2 w-full")}
        disabled={pending}
        onClick={() => {
          // Ask at the one moment the permission is obviously relevant. A
          // refusal is remembered by the browser; we never ask again.
          if (typeof Notification !== "undefined" && Notification.permission === "default") {
            void Notification.requestPermission().catch(() => {});
          }
          run(() =>
            startTimer({
              projectId: kind === "p" ? Number(rawId) : null,
              courseId: kind === "c" ? Number(rawId) : null,
            }),
          );
        }}
      >
        ▶ 開始計時
      </Button>
    </div>
  );
}
