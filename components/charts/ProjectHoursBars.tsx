import { formatHours } from "@/lib/dates";
import { colorOf } from "@/lib/types";

export type Slice = { label: string; hours: number; color: string };

/**
 * Ranked horizontal bars for "where did the time go" - direct-labelled, so
 * identity never rests on colour alone (which also covers the light-mode
 * contrast relief the palette validator asks for).
 */
export function ProjectHoursBars({ slices }: { slices: Slice[] }) {
  const total = slices.reduce((s, x) => s + x.hours, 0);
  const max = Math.max(1, ...slices.map((s) => s.hours));

  return (
    <div className="space-y-2.5">
      {slices.map((s) => (
        <div key={s.label}>
          <div className="mb-1 flex items-baseline gap-2 text-xs">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorOf(s.color) }} />
            <span className="flex-1 truncate">{s.label}</span>
            <span className="shrink-0 tabular-nums text-dim">
              {formatHours(s.hours)}
              {total > 0 ? `　${Math.round((s.hours / total) * 100)}%` : ""}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-2">
            <div
              className="h-full rounded-full"
              style={{ width: `${(s.hours / max) * 100}%`, background: colorOf(s.color) }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
