import { addDays, formatHours } from "@/lib/dates";
import { Card, SectionTitle } from "./ui";
import { ProjectHoursBars, type Slice } from "./charts/ProjectHoursBars";

export type WeekRow = {
  week: string;
  byLabel: Map<string, number>;
  total: number;
};

/** "This week" time split for one kind of topic (research topics or courses). */
export function ThisWeekCard({
  noun,
  weekStart,
  thisWeek,
}: {
  noun: string;
  weekStart: string;
  thisWeek: Slice[];
}) {
  const thisWeekTotal = thisWeek.reduce((s, b) => s + b.hours, 0);
  return (
    <Card className="p-4">
      <SectionTitle
        title={`本週${noun}時間分配`}
        hint={`${weekStart} 起，共 ${formatHours(thisWeekTotal)}`}
      />
      {thisWeek.length ? (
        <ProjectHoursBars slices={thisWeek} />
      ) : (
        <p className="text-xs text-dim">這週還沒有{noun}的計時紀錄</p>
      )}
    </Card>
  );
}

/** Week x topic table for one kind of topic. */
export function WeeklyTopicTable({
  noun,
  weekStart,
  columns,
  rows,
  weeks,
}: {
  noun: string;
  weekStart: string;
  columns: Slice[];
  rows: WeekRow[];
  weeks: number;
}) {
  const grand = columns.reduce((s, c) => s + c.hours, 0);
  return (
    <Card className="p-4">
      <SectionTitle
        title={`每週 × ${noun}`}
        hint={`近 ${weeks} 週，週一至週日`}
      />
      {columns.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr className="border-b border-line text-left text-dim">
                <th className="py-1.5 pr-3 font-normal">週</th>
                {columns.map((c) => (
                  <th
                    key={c.label}
                    className="px-2 py-1.5 text-right font-normal"
                  >
                    {c.label}
                  </th>
                ))}
                <th className="py-1.5 pl-2 text-right font-normal">合計</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.week}
                  className={`border-b border-line/50 ${r.week === weekStart ? "bg-surface-2 font-medium" : ""}`}
                >
                  <td className="whitespace-nowrap py-1.5 pr-3">
                    {r.week.slice(5)} – {addDays(r.week, 6).slice(5)}
                    {r.week === weekStart ? "（本週）" : ""}
                  </td>
                  {columns.map((c) => {
                    const h = r.byLabel.get(c.label);
                    return (
                      <td key={c.label} className="px-2 py-1.5 text-right">
                        {h ? formatHours(h) : "–"}
                      </td>
                    );
                  })}
                  <td className="py-1.5 pl-2 text-right">
                    {r.total ? formatHours(r.total) : "–"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-medium">
                <td className="py-1.5 pr-3">總計</td>
                {columns.map((c) => (
                  <td key={c.label} className="px-2 py-1.5 text-right">
                    {formatHours(c.hours)}
                  </td>
                ))}
                <td className="py-1.5 pl-2 text-right">{formatHours(grand)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="text-xs text-dim">這段期間還沒有{noun}的計時紀錄</p>
      )}
    </Card>
  );
}
