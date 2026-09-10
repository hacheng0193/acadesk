import { addDays, formatHours } from "@/lib/dates";
import { WEEKDAYS } from "@/lib/types";

const SHADES = [
  "var(--surface-2)",
  "color-mix(in oklab, var(--accent) 25%, var(--surface-2))",
  "color-mix(in oklab, var(--accent) 45%, var(--surface-2))",
  "color-mix(in oklab, var(--accent) 70%, var(--surface-2))",
  "var(--accent)",
];

/**
 * Daily hours as a sequential single-hue grid (light -> dark), with a legend
 * strip so the ramp is readable without hovering.
 */
export function AttendanceHeatmap({
  from,
  weeks,
  hoursByDay,
}: {
  from: string;
  weeks: number;
  hoursByDay: Record<string, number>;
}) {
  const max = Math.max(1, ...Object.values(hoursByDay));
  const level = (h: number) => (h <= 0 ? 0 : Math.min(4, Math.ceil((h / max) * 4)));

  return (
    <div>
      <div className="flex gap-1 overflow-x-auto pb-1">
        <div className="flex flex-col gap-1 pr-1">
          {WEEKDAYS.map((d) => (
            <span key={d} className="h-3 text-[9px] leading-3 text-dim">
              {d}
            </span>
          ))}
        </div>
        {Array.from({ length: weeks }, (_, w) => (
          <div key={w} className="flex flex-col gap-1">
            {Array.from({ length: 7 }, (_, d) => {
              const day = addDays(from, w * 7 + d);
              const hours = hoursByDay[day] ?? 0;
              return (
                <span
                  key={day}
                  title={`${day}　${hours > 0 ? formatHours(hours) : "無紀錄"}`}
                  className="h-3 w-3 rounded-[3px]"
                  style={{ background: SHADES[level(hours)] }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-dim">
        <span>少</span>
        {SHADES.map((c, i) => (
          <span key={i} className="h-3 w-3 rounded-[3px]" style={{ background: c }} />
        ))}
        <span>多</span>
        <span className="ml-auto tabular-nums">單日最高 {formatHours(max)}</span>
      </div>
    </div>
  );
}
