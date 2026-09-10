"use client";

import { useState } from "react";
import { formatHours } from "@/lib/dates";
import { cx } from "../ui";

export type Bar = { key: string; label: string; value: number; sublabel?: string };

/**
 * Single-series magnitude-over-time bars. One hue (so no legend), recessive
 * grid, 4px rounded tops anchored to the baseline, hover tooltip per bar.
 */
export function HoursBars({
  bars,
  goal,
  height = 180,
}: {
  bars: Bar[];
  goal?: number | null;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...bars.map((b) => b.value), goal ?? 0);
  const ticks = [0, max / 2, max];

  return (
    <div className="relative">
      <div className="flex" style={{ height }}>
        <div className="flex w-10 shrink-0 flex-col justify-between pr-2 text-right">
          {[...ticks].reverse().map((t) => (
            <span key={t} className="text-[10px] tabular-nums text-dim">
              {t === 0 ? "0" : t.toFixed(t >= 10 ? 0 : 1)}h
            </span>
          ))}
        </div>
        <div className="relative flex-1">
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute inset-x-0 border-t border-line/70"
              style={{ bottom: `${(t / max) * 100}%` }}
            />
          ))}
          {goal ? (
            <div
              className="absolute inset-x-0 border-t border-dashed border-[var(--accent)]"
              style={{ bottom: `${(goal / max) * 100}%` }}
              title={`目標 ${goal} 小時`}
            />
          ) : null}
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {bars.map((b, i) => (
              <div
                key={b.key}
                className="group relative flex h-full flex-1 items-end"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <div
                  className={cx(
                    "w-full transition-opacity",
                    hover !== null && hover !== i && "opacity-45",
                  )}
                  style={{
                    height: `${Math.max(b.value > 0 ? 2 : 0, (b.value / max) * 100)}%`,
                    background: "var(--accent)",
                    borderTopLeftRadius: 4,
                    borderTopRightRadius: 4,
                  }}
                />
                {hover === i ? (
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-surface px-2 py-1 text-[11px] shadow-[var(--shadow)]">
                    <div className="font-medium">{b.label}</div>
                    <div className="tabular-nums text-dim">{formatHours(b.value)}</div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-1.5 flex pl-10">
        {bars.map((b) => (
          <span key={b.key} className="relative h-3 flex-1">
            {b.sublabel ? (
              <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] tabular-nums text-dim">
                {b.sublabel}
              </span>
            ) : null}
          </span>
        ))}
      </div>
    </div>
  );
}
